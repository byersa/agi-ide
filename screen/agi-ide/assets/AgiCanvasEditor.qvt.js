(function () {
    // Main Canvas Editor Component Option Object
    const AgiCanvasEditor = {
        name: 'AgiCanvasEditor',
        mixins: [window.AgiEditorShareMixin].filter(m => m !== undefined),
        template: `
            <div id="canvas-editor-root" class="fit q-pa-md bg-blue-grey-1" style="height: 100%;">
                <div id="canvas-header-card" class="q-mb-md q-pa-sm bg-white rounded-borders shadow-1">
                    <div id="canvas-title-bar" class="row items-center justify-between">
                        <span class="text-subtitle1 text-weight-bold text-grey-9">Visual Canvas Workspace</span>
                        <q-btn icon="save" label="Save Changes" dense flat @click="executeBufferSave" />
                    </div>
                    <div id="canvas-path-status" class="text-caption text-grey-6 row items-center q-mt-xs">
                        <q-icon name="folder" size="xs" class="q-mr-xs" />
                        <span>Active Path:</span>
                        <span class="text-weight-medium q-ml-xs text-primary">{{ screenPath }}</span>
                    </div>
                </div>

                <!-- 🎯 NATIVE QMETA BLUEPRINT RENDERER ENGINE -->
                <div id="canvas-elements-viewport" class="column no-wrap items-stretch full-width">
                    <m-blueprint-node 
                        v-if="localBlueprintTree" 
                        :node="localBlueprintTree" 
                        :context="{ selectedMariaId: selectedMariaId }"
                    ></m-blueprint-node>
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
                type: Object,
                default: () => ({ id: "root", tagName: "form", children: [] })
            }
        },
        data() {
            return {
                selectedMariaId: '',
                contextBus: null
            };
        },
        computed: {
            localBlueprintTree() {
                const ideStore = window.useAgiIdeStore ? window.useAgiIdeStore() : null;
                const treeFromStore = ideStore ? ideStore.getActiveBlueprint : null;

                return treeFromStore || this.layoutTree || (this.$attrs && this.$attrs['layout-tree']);
            }
        },
        mounted() {
            // ContextBus strictly for UI signals (e.g. node focus/highlight)
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },
        methods: {
            executeBufferSave() {
                this.$emit('trigger-save');
            },
            handleVisualNodeClick(clickedNode) {
                this.selectedMariaId = clickedNode.mariaId;
                this.contextBus.postMessage({ event: 'element-selected-by-id', mariaId: clickedNode.mariaId, screen: clickedNode.screen });
                this.scrollToNode(clickedNode.mariaId);
            },
            scrollToNode(mariaId) {
                this.$nextTick(() => {
                    const el = this.$el.querySelector(`[mariaid="${mariaId}"]`) || document.querySelector(`[mariaid="${mariaId}"]`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        el.classList.add('pulse-highlight');
                        setTimeout(() => el.classList.remove('pulse-highlight'), 1000);
                    }
                });
            }
        }
    };

    window.AgiCanvasEditor = AgiCanvasEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-canvas-editor'] = AgiCanvasEditor;

    const registerAgiCanvasEditor = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            if (!window.moqui.webrootVueApp.component('agi-canvas-editor')) {
                window.moqui.webrootVueApp.component('agi-canvas-editor', AgiCanvasEditor);
                console.info("🚀 [AGI] Registered 'agi-canvas-editor' successfully.");
            }
        } else {
            setTimeout(registerAgiCanvasEditor, 50);
        }
    };
    registerAgiCanvasEditor();
})();