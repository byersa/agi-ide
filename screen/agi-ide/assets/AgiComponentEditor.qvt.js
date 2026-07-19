(function () {
    const AgiComponentEditor = {
        name: 'AgiComponentEditor',
        mixins: [window.AgiEditorShareMixin].filter(m => m !== undefined),
        template: `
            <!-- Root Code Editor Container -->
            <div :class="['component-editor-container fit column no-wrap q-pa-sm', activeHighlightedMariaId ? 'glow-active' : '']" style="height: 100%;">
                
                <!-- Toolbar Header (Direct Vue translation of the XML containers) -->
                <div class="q-mb-sm row items-center justify-between">
                    <div class="row items-center q-gutter-x-sm">
                        <!-- Text Label Header -->
                        <span class="text-subtitle2 text-grey-8">XML Component Editor</span>
                        
                        <!-- Save Button mapped to dynamic save function -->
                        <q-btn 
                            icon="save" 
                            label="Save Changes" 
                            dense 
                            flat 
                            @click="executeBufferSave" 
                        />
                    </div>

                    <!-- Active Selection Focus Chip -->
                    <q-chip 
                        v-if="activeHighlightedMariaId" 
                        color="primary" 
                        text-color="white" 
                        icon="gps_fixed" 
                        dense 
                        size="sm" 
                        @click="clearHighlight" 
                        clickable
                    >
                        Synced: {{ activeHighlightedMariaId.split('#')[1] || activeHighlightedMariaId }}
                    </q-chip>
                </div>

                <!-- Text Area Editor Window Container -->
                <div class="col col-stretch relative-position">
                    <textarea 
                        ref="xmlTextArea"
                        class="xml-textarea fit"
                        :value="rawXmlSource"
                        @input="onTextareaInput"
                    ></textarea>
                </div>

            </div>
        `,
        props: {
            screenPath: {
                type: String,
                required: true
            },
            layoutTree: {
                type: Object,
                default: () => ({ id: "root", tagName: "form", children: [] })
            }
        },
        computed: {
            artifactLocation() {
                return this.screenPath;
            }
        },
        data() {
            return {
                rawXmlSource: '',
                contextBus: null,
                activeHighlightedMariaId: '',
                localBlueprintTree: { id: "root", tagName: "form", children: [] }
            };
        },
        watch: {
            layoutTree: {
                handler(newTree) {
                    if (newTree) {
                        console.info(`🔄 Editor [${this.$options.name}] deeply sync'd localBlueprintTree to new workspace layout state.`);
                        this.localBlueprintTree = JSON.parse(JSON.stringify(newTree));
                    }
                },
                immediate: true,
                deep: true
            }
        },
        mounted() {
            // Configure message event listener
            // 2. Listen for selection events broadcasting from the Visual Canvas
            this.contextBus.onmessage = (msg) => {
                if (msg.data && msg.data.event === 'element-selected-by-id') {
                    const selectedId = msg.data.mariaId; // e.g., "SampleForm#username"
                    this.highlightAndScrollToSourceElement(selectedId);
                }
            };

            // Fetch raw XML component text definition with axios
            const vm = this;
            const ideStore = window.useAgiIdeStore ? window.useAgiIdeStore() : null;
            const axiosConfig = ideStore ? ideStore.getAxiosConfig : {};
            axios.get('/agi-ide/getRawXml?screenPath=' + encodeURIComponent(this.screenPath), axiosConfig)
                .then(function (response) {
                    vm.rawXmlSource = response.data || '';
                })
                .catch(function (err) {
                    console.warn("Failed fetching component XML, loading fallback blueprint code structure", err);
                    vm.rawXmlSource = `<?xml version="1.0" encoding="UTF-8"?>
<screen xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" require-authentication="true">
    <widgets>
        <container id="main-layout">
            <form-single name="SampleForm">
                <field name="username">
                    <default-field><text-line/></default-field>
                </field>
                <field name="email">
                    <default-field><text-line/></default-field>
                </field>
            </form-single>
            <link url="submit" text="Submit Action Link" id="submit-btn"/>
            <label text="System Footer Notice"/>
        </container>
    </widgets>
</screen>`;
                });
        },
        beforeUnmount() {
            if (this.contextBus) {
                this.contextBus.close();
            }
        },
        methods: {
            executeBufferSave() {
                console.info(`💾 Editor [${this.$options.name}] triggering upstream workspace buffer save request.`);
                // Emit the custom event. Pass the current layout tree state as the payload.
                this.$emit('trigger-save', this.localBlueprintTree || this.layoutTree);
            },
            onTextareaInput(event) {
                this.rawXmlSource = event.target.value;
                // Broadcast changes to update layout preview
                this.contextBus.postMessage({
                    event: 'xml-source-mutated',
                    rawXmlText: this.rawXmlSource
                });
            },
            highlightCodeLineByMariaId(mariaId) {
                const elementToken = mariaId.includes('#') ? mariaId.split('#')[1] : mariaId;
                if (!elementToken) return;

                let index = this.rawXmlSource.indexOf('id="' + elementToken + '"');
                if (index === -1) {
                    index = this.rawXmlSource.indexOf('name="' + elementToken + '"');
                }

                let matchIndex = -1;
                if (index === -1 && (elementToken.startsWith('link-') || elementToken.startsWith('label-'))) {
                    const parts = elementToken.split('-');
                    const tagType = parts[0];
                    const targetOccur = parseInt(parts[1], 10);

                    const regex = new RegExp('<' + tagType + '\\b', 'g');
                    let match;
                    let count = 0;
                    while ((match = regex.exec(this.rawXmlSource)) !== null) {
                        if (count === targetOccur) {
                            matchIndex = match.index;
                            break;
                        }
                        count++;
                    }
                }

                const targetIdx = index !== -1 ? index : matchIndex;
                if (targetIdx !== -1) {
                    this.activeHighlightedMariaId = mariaId;
                    const textarea = this.$refs.xmlTextArea;
                    if (textarea) {
                        textarea.focus();
                        textarea.setSelectionRange(targetIdx, targetIdx + elementToken.length + 8);

                        const textBefore = this.rawXmlSource.substring(0, targetIdx);
                        const lineCount = (textBefore.match(/\n/g) || []).length;
                        textarea.scrollTop = lineCount * 18;
                    }
                }
            },
            clearHighlight() {
                this.activeHighlightedMariaId = '';
            },
            highlightAndScrollToSourceElement(mariaId) {
                if (!mariaId) return;

                // 1. Extract the raw name/id after the '#' divider token safely
                // Works for "SampleForm#admission_hull" or "path/to/file.xml#fullName"
                const elementId = mariaId.split('#')[1];
                if (!elementId) return;

                // 2. Target your local text wrapper layout container
                const textarea = this.$el.querySelector('textarea') || document.querySelector('.xml-textarea');
                if (!textarea) return;

                const textContent = textarea.value;

                // 3. DEFENSIVE PATTERN MATCH: Scan for name="id" OR id="id" inside the XML layout markup
                let targetString = `name="${elementId}"`;
                let index = textContent.indexOf(targetString);

                if (index === -1) {
                    targetString = `id="${elementId}"`;
                    index = textContent.indexOf(targetString);
                }

                // 4. If located inside the text buffer, execute the viewport jump
                if (index !== -1) {
                    textarea.focus();

                    // Highlight the target text block markers
                    textarea.setSelectionRange(index, index + targetString.length);

                    // Compute exact line heights scroll coordinates programmatically
                    const linesUpToMatch = textContent.substring(0, index).split('\n').length;
                    const baselineLineHeight = 20; // Adjust slightly to match your panel CSS

                    // Center the found line inside the panel viewport area
                    textarea.scrollTop = (linesUpToMatch - 4) * baselineLineHeight;
                    console.info(`🎯 Text editor synchronized cursor to line ${linesUpToMatch} for element: ${elementId}`);
                }
            },
        }
    };

    window.AgiComponentEditor = AgiComponentEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-component-editor'] = AgiComponentEditor;

    // 🎯 Self-Registration Block
    const registerAgiComponentEditor = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            if (!window.moqui.webrootVueApp.component('agi-component-editor')) {
                window.moqui.webrootVueApp.component('agi-component-editor', AgiComponentEditor);
                console.info("🚀 [AGI] Registered 'agi-component-editor' successfully.");
            }
        } else {
            setTimeout(registerAgiComponentEditor, 50);
        }
    };

    registerAgiComponentEditor();
})();