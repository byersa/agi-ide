(function () {
    const AgiScreenEditor = {
        name: 'AgiScreenEditor',
        mixins: [window.AgiEditorShareMixin].filter(m => m !== undefined),
        template: `
            <div :class="['screen-editor-container fit column no-wrap q-pa-xs', activeHighlightedMariaId ? 'glow-active' : '']" style="height: 100%; min-height: 0;">
                
                <!-- Toolbar Header -->
                <div class="q-mb-xs row items-center justify-between">
                    <div class="row items-center q-gutter-x-sm">
                        <span class="text-caption text-weight-bold text-grey-4 font-mono">XML SCREEN EDITOR</span>
                        <q-btn icon="save" label="Save (Ctrl+S)" color="primary" dense size="xs" class="q-px-xs" @click="executeBufferSave" />
                    </div>
                    
                    <!-- Transition Service Badges & Sync Chips -->
                    <div class="row items-center q-gutter-x-xs">
                        <q-chip 
                            v-for="(svc, idx) in detectedTransitionServices"
                            :key="idx"
                            color="amber-10" 
                            text-color="black" 
                            icon="bolt" 
                            dense size="sm" 
                            clickable
                            class="text-weight-bold font-mono"
                            @click="jumpToServiceEditor(svc)"
                        >
                            <q-tooltip>Open {{ svc.serviceName }} in AgiServiceEditor</q-tooltip>
                            Service: {{ svc.serviceName }}
                        </q-chip>

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
                </div>

                <!-- Code Editor Container -->
                <div class="col full-width relative-position rounded-borders" style="border: 1px solid #334155; min-height: 0; height: 100%;">
                    <!-- CodeMirror Host -->
                    <div v-show="cmAvailable" ref="cmHost" class="fit" style="height: 100%;"></div>

                    <!-- Safe Textarea Fallback -->
                    <textarea 
                        v-if="!cmAvailable"
                        class="xml-textarea fit font-mono text-caption q-pa-xs bg-grey-10 text-white"
                        style="white-space: pre; overflow: auto; resize: none;"
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
            },

            detectedTransitionServices() {
                const results = [];
                if (!this.localBlueprintTree) return results;

                const scanTree = (node) => {
                    if (!node || typeof node !== 'object') return;

                    const tag = node.name || node._moquiTag || node.tagName;
                    if (tag === 'transition') {
                        const tName = node.attributes?.name || '';
                        const findServiceCall = (subNode) => {
                            if (!subNode || typeof subNode !== 'object') return;
                            const subTag = subNode.name || subNode._moquiTag || subNode.tagName;
                            if (subTag === 'service-call') {
                                const sName = subNode.attributes?.name || '';
                                if (sName) {
                                    results.push({
                                        transitionName: tName,
                                        serviceName: sName
                                    });
                                }
                            }
                            const children = subNode.children || subNode.widgets || [];
                            if (Array.isArray(children)) children.forEach(findServiceCall);
                        };
                        const children = node.children || node.widgets || [];
                        if (Array.isArray(children)) children.forEach(findServiceCall);
                    }

                    const children = node.children || node.widgets || [];
                    if (Array.isArray(children)) children.forEach(scanTree);
                };

                scanTree(this.localBlueprintTree);

                if (results.length === 0 && this.rawXmlSource) {
                    const svcMatch = this.rawXmlSource.match(/<service-call\s+name=["']([^"']+)["']/);
                    if (svcMatch && svcMatch[1]) {
                        results.push({
                            transitionName: 'transition',
                            serviceName: svcMatch[1]
                        });
                    }
                }

                return results;
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
                if (typeof CodeMirror === 'undefined') {
                    if (attempts < 10) setTimeout(() => this.tryInitCodeMirror(attempts + 1), 100);
                    else this.cmAvailable = false;
                    return;
                }

                // Ensure XML mode script is loaded
                if (!CodeMirror.modes || !CodeMirror.modes.xml) {
                    if (!document.getElementById('cm-xml-mode-script')) {
                        const script = document.createElement('script');
                        script.id = 'cm-xml-mode-script';
                        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/xml/xml.min.js';
                        script.onload = () => this.tryInitCodeMirror(0);
                        document.head.appendChild(script);
                        return;
                    } else if (attempts < 15) {
                        setTimeout(() => this.tryInitCodeMirror(attempts + 1), 100);
                        return;
                    }
                }

                if (this.$refs.cmHost) {
                    this.cmAvailable = true;
                    this.cmInstance = CodeMirror(this.$refs.cmHost, {
                        value: this.rawXmlSource || '',
                        mode: 'application/xml',
                        htmlMode: false,
                        theme: 'material-darker',
                        lineNumbers: true,
                        lineWrapping: true // Enables automatic line wrapping within the panel width
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
                    this.$nextTick(() => {
                        setTimeout(() => this.cmInstance?.refresh(), 100);
                    });
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
                        setTimeout(() => vm.cmInstance?.refresh(), 50);
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

            jumpToServiceEditor(svc) {
                if (!svc || !svc.serviceName) return;

                let uri = '';
                const rawName = svc.serviceName.trim();

                // Example rawName: "nursinghome.service.nursinghome.NursingHomeDataServices.intake#NewResident"
                // Or: "nursinghome.patient.PatientServices.intake#NewResident"
                if (rawName.includes('#')) {
                    // Strip verb#noun from the end
                    const beforeVerb = rawName.substring(0, rawName.lastIndexOf('.'));
                    const parts = beforeVerb.split('.').filter(p => p !== 'service');
                    const comp = parts[0] || 'nursinghome';
                    const fileParts = parts.slice(1);

                    uri = `component://${comp}/service/${fileParts.join('/')}.xml`;
                }

                const payload = {
                    event: 'open-service-artifact',
                    serviceName: svc.serviceName,
                    serviceUri: uri,
                    transitionName: svc.transitionName
                };

                if (this.contextBus) {
                    this.contextBus.postMessage(payload);
                }

                window.dispatchEvent(new CustomEvent('open-service-artifact', { detail: payload }));
            },

            highlightAndScrollToSourceElement(mariaId, nodeData = null) {
                if (!mariaId || !this.cmInstance) return;

                const genericSubTags = [
                    'default-field', 'header-field', 'text-line', 'date-time',
                    'drop-down', 'check', 'radio', 'text-find', 'display', 'hidden'
                ];

                const parts = mariaId.toString().split('#').filter(p => !genericSubTags.includes(p));
                const rawElementName = parts[parts.length - 1] || mariaId;
                const elementName = nodeData?.attributes?.name || (nodeData?.name && !genericSubTags.includes(nodeData.name) ? nodeData.name : rawElementName);

                const doc = this.cmInstance.getDoc();
                const text = doc.getValue();
                if (!text || !elementName) return;

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
                        className: 'cm-selected-xml-node'
                    });

                    this.cmInstance.scrollIntoView({ from: startPos, to: endPos }, 80);
                    this.cmInstance.setSelection(startPos, endPos);
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