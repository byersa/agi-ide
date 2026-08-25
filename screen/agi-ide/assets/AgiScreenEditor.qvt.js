(function () {
    const AgiScreenEditor = {
        name: 'AgiScreenEditor',
        mixins: [window.AgiEditorShareMixin].filter(m => m !== undefined),
        template: `
            <div :class="['screen-editor-container fit column no-wrap q-pa-sm', activeHighlightedMariaId ? 'glow-active' : '']" style="height: 100%;">
                
                <!-- Toolbar Header -->
                <div class="q-mb-sm row items-center justify-between">
                    <div class="row items-center q-gutter-x-sm">
                        <span class="text-subtitle2 text-grey-8">XML Screen Editor</span>
                        <q-btn icon="save" label="Save Changes" dense flat @click="executeBufferSave" />
                    </div>
                    
                    <q-chip 
                        v-if="activeHighlightedMariaId" 
                        color="primary" 
                        text-color="white" 
                        icon="gps_fixed" 
                        dense size="sm" 
                        @click="clearHighlight" 
                        clickable
                    >
                        Synced: {{ displayElementName }}
                    </q-chip>
                </div>

                <!-- Code Editor Container -->
                <div class="col col-stretch relative-position rounded-borders overflow-hidden" style="border: 1px solid #334155;">
                    <!-- CodeMirror Host -->
                    <div v-show="cmAvailable" ref="cmHost" class="fit" style="height: 100%;"></div>

                    <!-- Safe Textarea Fallback if CDN is offline -->
                    <textarea 
                        v-if="!cmAvailable"
                        class="xml-textarea fit font-mono text-caption q-pa-xs bg-grey-10 text-white"
                        :value="rawXmlSource"
                        @input="onTextareaInput"
                    ></textarea>
                </div>
            </div>
        `,

        props: {
            screenPath: { type: String, required: true },
            layoutTree: { type: [Object, Array], default: () => [] }
        },

        data() {
            return {
                cmInstance: null,
                cmAvailable: false,
                rawXmlSource: '',
                activeHighlightedMariaId: '',
                contextBus: null,
                activeTextMarker: null,
                localBlueprintTree: { id: "root", tagName: "form", children: [] }
            };
        },

        computed: {
            displayElementName() {
                if (!this.activeHighlightedMariaId) return '';
                const parts = this.activeHighlightedMariaId.split('#');
                return parts[parts.length - 1] || this.activeHighlightedMariaId;
            }
        },

        watch: {
            layoutTree: {
                handler(newTree) {
                    if (newTree) {
                        this.localBlueprintTree = JSON.parse(JSON.stringify(newTree));
                        this.compileTreeToXmlText();
                    }
                },
                immediate: true,
                deep: true
            }
        },

        mounted() {
            this.tryInitCodeMirror();

            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = (msg) => {
                if (msg.data?.event === 'element-selected-by-id') {
                    this.highlightAndScrollToSourceElement(msg.data.mariaId, msg.data.node);
                }
            };

            this.onWindowSelection = (e) => {
                if (e.detail?.event === 'element-selected-by-id' || e.detail?.mariaId) {
                    this.highlightAndScrollToSourceElement(e.detail.mariaId, e.detail.node);
                }
            };
            window.addEventListener('element-selected-by-id', this.onWindowSelection);
        },

        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
            if (this.onWindowSelection) {
                window.removeEventListener('element-selected-by-id', this.onWindowSelection);
            }
            if (this.cmInstance) {
                this.cmInstance.toTextArea?.();
            }
        },

        methods: {
            tryInitCodeMirror(attempts = 0) {
                if (typeof CodeMirror !== 'undefined' && this.$refs.cmHost) {
                    this.cmAvailable = true;
                    this.cmInstance = CodeMirror(this.$refs.cmHost, {
                        value: this.rawXmlSource || '',
                        mode: 'xml',
                        theme: 'material-darker',
                        lineNumbers: true,
                        lineWrapping: true
                    });

                    this.cmInstance.on('change', (cm, change) => {
                        if (change.origin === 'setValue') return;
                        this.rawXmlSource = cm.getValue();
                        if (this.contextBus) {
                            this.contextBus.postMessage({
                                event: 'xml-source-mutated',
                                rawXmlText: this.rawXmlSource
                            });
                        }
                    });

                    this.cmInstance.setSize('100%', '100%');
                } else if (attempts < 10) {
                    setTimeout(() => this.tryInitCodeMirror(attempts + 1), 100);
                } else {
                    // Fallback to basic textarea mode if CodeMirror script is missing
                    this.cmAvailable = false;
                }
            },

            onTextareaInput(event) {
                this.rawXmlSource = event.target.value;
                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'xml-source-mutated',
                        rawXmlText: this.rawXmlSource
                    });
                }
            },

            async compileTreeToXmlText() {
                if (!this.localBlueprintTree) return;
                const vm = this;
                const headers = {};
                if (window.AGI_SERVER_CSRF_TOKEN) {
                    headers['X-CSRF-Token'] = window.AGI_SERVER_CSRF_TOKEN;
                }

                try {
                    const response = await axios.post('/rest/s1/agi-ide/compileTreeToXml', {
                        layoutTree: this.localBlueprintTree
                    }, { headers });

                    vm.rawXmlSource = response.data?.xmlText || '';
                    if (vm.cmInstance && vm.cmInstance.getValue() !== vm.rawXmlSource) {
                        vm.cmInstance.setValue(vm.rawXmlSource);
                    }
                } catch (err) {
                    console.error("Error compiling tree to XML:", err);
                }
            },

            executeBufferSave() {
                this.$emit('trigger-save', this.localBlueprintTree || this.layoutTree);
            },

            clearHighlight() {
                this.activeHighlightedMariaId = '';
                if (this.activeTextMarker) {
                    this.activeTextMarker.clear();
                    this.activeTextMarker = null;
                }
            },

            highlightAndScrollToSourceElement(mariaId, nodeData = null) {
                if (!mariaId) return;

                const parts = mariaId.toString().split('#');
                const rawElementName = parts[parts.length - 1] || mariaId;
                const elementName = nodeData?.attributes?.name || nodeData?.name || rawElementName;

                if (this.cmInstance) {
                    const doc = this.cmInstance.getDoc();
                    const text = doc.getValue();
                    if (!text) return;

                    const searchPatterns = [
                        `name="${elementName}"`,
                        `<field name="${elementName}"`,
                        `id="${elementName}"`,
                        `<${elementName}`
                    ];

                    let targetIndex = -1;
                    let patternLen = 0;

                    for (let pattern of searchPatterns) {
                        const idx = text.indexOf(pattern);
                        if (idx !== -1) {
                            targetIndex = idx;
                            patternLen = pattern.length;
                            break;
                        }
                    }

                    if (targetIndex !== -1) {
                        this.activeHighlightedMariaId = mariaId;
                        if (this.activeTextMarker) this.activeTextMarker.clear();

                        const startPos = doc.posFromIndex(targetIndex);
                        const endPos = doc.posFromIndex(targetIndex + patternLen);

                        this.activeTextMarker = doc.markText(startPos, endPos, {
                            className: 'cm-selected-xml-node bg-primary text-white text-weight-bold'
                        });

                        this.cmInstance.scrollIntoView({ from: startPos, to: endPos }, 80);
                        this.cmInstance.setSelection(startPos, endPos);
                    }
                }
            }
        }
    };

    window.AgiScreenEditor = AgiScreenEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-screen-editor'] = AgiScreenEditor;

    const registerAgiScreenEditor = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            if (!window.moqui.webrootVueApp.component('agi-screen-editor')) {
                window.moqui.webrootVueApp.component('agi-screen-editor', AgiScreenEditor);
            }
        } else {
            setTimeout(registerAgiScreenEditor, 50);
        }
    };
    registerAgiScreenEditor();
})();