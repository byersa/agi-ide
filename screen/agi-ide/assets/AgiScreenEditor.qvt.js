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
            node: {
                type: Object,
                required: false,
                default: () => ({ attributes: {}, children: [] })
            },
            layoutTree: {
                type: [Object, Array],
                default: () => []
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
        // Inside AgiScreenEditor.qvt.js -> mounted()
        mounted() {
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');

            // 🎯 1. REACTIVE PINIA STORE SUBSCRIPTION
            const ideStore = window.useAgiIdeStore ? window.useAgiIdeStore() : null;
            if (ideStore && typeof ideStore.$subscribe === 'function') {
                // Fires automatically whenever updateActiveBlueprint is called!
                this._storeUnsub = ideStore.$subscribe((mutation, state) => {
                    const activeTree = state.activeBlueprint || ideStore.getActiveBlueprint;
                    if (activeTree) {
                        console.info("📄 [AgiScreenEditor] Pinia store mutated. Re-compiling XML source...");
                        this.localBlueprintTree = JSON.parse(JSON.stringify(activeTree));
                        this.compileTreeToXmlText();
                    }
                });
            }

            // 🎯 2. KEEP CONTEXTBUS STRICTLY FOR UI HIGHLIGHTING
            this.contextBus.onmessage = (msg) => {
                if (!msg.data) return;
                if (msg.data.event === 'element-selected-by-id') {
                    this.highlightAndScrollToSourceElement(msg.data.mariaId);
                }
            };
        },
        beforeUnmount() {
            if (this._storeUnsub) this._storeUnsub();
            if (this.contextBus) this.contextBus.close();
        },
        methods: {
            async compileTreeToXmlText() {
                if (!this.localBlueprintTree) return;
                const vm = this;

                // 🎯 EASIEST & DIRECT FIX: Fetch Moqui's native injected token directly from window context
                const headers = {};
                headers['X-CSRF-Token'] = window.AGI_SERVER_CSRF_TOKEN;

                axios.post('/rest/s1/agi-ai/compileTreeToXml', {
                    layoutTree: this.localBlueprintTree
                }, { headers: headers }) // 🎯 Pass the clean, authentic header payload directly
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