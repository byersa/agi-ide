(function () {
    const AgiScreenEditor = {
        name: 'AgiScreenEditor',
        mixins: [window.AgiEditorShareMixin].filter(m => m !== undefined),
        template: `
            <!-- Root Code Editor Container -->
            <div :class="['screen-editor-container fit column no-wrap q-pa-sm', activeHighlightedMariaId ? 'glow-active' : '']" style="height: 100%;">
                
                <!-- Toolbar Header (Unified layout translation) -->
                <div class="q-mb-sm row items-center justify-between">
                    <div class="row items-center q-gutter-x-sm">
                        <span class="text-subtitle2 text-grey-8">XML Screen Editor</span>
                        
                        <!-- Save Button mapped to native save function -->
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
                        // Automatically compile the fresh blueprint tree down to structural text representation
                        this.compileTreeToXmlText();
                    }
                },
                immediate: true,
                deep: true
            }
        },
        mounted() {
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');

            // Listen for selection events broadcasting from the Visual Canvas
            this.contextBus.onmessage = (msg) => {
                if (msg.data && msg.data.event === 'element-selected-by-id') {
                    const selectedId = msg.data.mariaId; // e.g., "SampleForm#username"
                    this.highlightAndScrollToSourceElement(selectedId);
                }
            };
        },
        beforeUnmount() {
            if (this.contextBus) {
                this.contextBus.close();
            }
        },
        methods: {
            async compileTreeToXmlText() {
                if (!this.localBlueprintTree) return;
                const vm = this;

                // Dynamically resolve the native Pinia store layer instance safely
                let ideStore = null;
                if (window.useAgiIdeStore) {
                    ideStore = window.useAgiIdeStore();
                }

                // Pull out the centralized headers cleanly from the getter computation rule
                const axiosConfig = ideStore ? ideStore.getAxiosConfig : {};

                axios.post('/rest/s1/agi-ai/compileTreeToXml', {
                    layoutTree: this.localBlueprintTree
                }, axiosConfig)
                    .then(function (response) {
                        vm.rawXmlSource = response.data?.xmlText || '';
                    })
                    .catch(function (err) {
                        console.error("Error encountered in compileTreeToXmlText:", err);
                    });
            },
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
            clearHighlight() {
                this.activeHighlightedMariaId = '';
            },
            highlightAndScrollToSourceElement(mariaId) {
                // Extract the target widget name from the mariaId compound token
                const elementName = mariaId.split('#')[1]; // yields "username"
                if (!elementName) return;

                const textarea = this.$el.querySelector('.xml-textarea');
                if (!textarea) return;

                const textContent = textarea.value;
                // Search the text buffer for the field or container declaration string
                const targetSearchString = `name="${elementName}"`;
                const index = textContent.indexOf(targetSearchString);

                if (index !== -1) {
                    this.activeHighlightedMariaId = mariaId;
                    // Programmatically focus and highlight the text characters inside the source window
                    textarea.focus();
                    textarea.setSelectionRange(index, index + targetSearchString.length);

                    // Compute scroll offset to bring the code line into viewport focus
                    const numLines = textContent.substring(0, index).split('\n').length;
                    const lineHeight = 18; // Matches your custom CSS line-height rule
                    textarea.scrollTop = (numLines - 3) * lineHeight;
                }
            },
        }
    };

    // Expose component globally
    window.AgiScreenEditor = AgiScreenEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-screen-editor'] = AgiScreenEditor;

    // Safe Registration Function targeting the Vue 3 App Instance
    const registerAgiScreenEditor = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            if (!window.moqui.webrootVueApp.component('agi-screen-editor')) {
                window.moqui.webrootVueApp.component('agi-screen-editor', AgiScreenEditor);
                console.info("🚀 [AGI] Registered 'agi-screen-editor' successfully.");
            }
        } else {
            // Wait safely until the webroot vue app is loaded
            setTimeout(registerAgiScreenEditor, 50);
        }
    };

    registerAgiScreenEditor();
})();