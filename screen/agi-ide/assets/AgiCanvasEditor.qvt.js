(function () {
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
                    <template v-if="effectiveTree">
                        <!-- If root is a "screen" envelope, iterate and render its top-level widget children directly -->
                        <template v-if="effectiveTree._moquiTag === 'screen' && effectiveTree.children">
                            <m-blueprint-node 
                                v-for="(childNode, idx) in effectiveTree.children" 
                                :key="childNode.mariaId || idx"
                                :node="childNode" 
                                :context="{ 
                                    selectedMariaId: selectedMariaId,
                                    currentPathList: dynamicSubscreenPath,
                                    subscreens: effectiveTree.subscreens
                                }"
                            ></m-blueprint-node>
                        </template>
                
                        <!-- Fallback for direct container / form nodes -->
                        <m-blueprint-node 
                            v-else
                            :node="effectiveTree" 
                            :context="{ 
                                selectedMariaId: selectedMariaId,
                                currentPathList: dynamicSubscreenPath,
                                subscreens: effectiveTree.subscreens
                            }"
                        ></m-blueprint-node>
                    </template>
                </div>
            </div>
        `,
        props: {
            screenPath: { type: String, required: true },
            layoutTree: { type: Object, default: () => null }
        },
        watch: {
            layoutTree: {
                handler(newTree) {
                    if (newTree) {
                        console.info(`🔄 AgiCanvasEditor [${this.$options.name}] deeply sync'd localBlueprintTree to new workspace layout state.`);
                        return;
                    }
                },
                immediate: true,
                deep: true
            }
        },
        data() {
            return {
                selectedMariaId: '',
                contextBus: null
            };
        },
        computed: {
            // 🎯 SINGLE SOURCE OF TRUTH: Directly consume the prop passed by AgiWorkspace
            effectiveTree() {
                const tree = this.layoutTree;
                return this.layoutTree;
            },
            dynamicSubscreenPath() {
                const tree = this.effectiveTree;
                if (!tree) return [];

                const defaultSub = tree.subscreens?.defaultItem;
                if (defaultSub && defaultSub.length > 0) {
                    return [defaultSub];
                }

                const subChildren = tree.subscreens?.children || [];
                if (subChildren.length > 0 && subChildren[0].name) {
                    return [subChildren[0].name];
                }

                return [];
            }
        },
        mounted() {
            // ContextBus strictly for UI focus/selection signals
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = (msg) => {
                if (msg.data?.event === 'element-selected-by-id') {
                    this.scrollToNode(msg.data.mariaId);
                }
            };
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },
        methods: {
            executeBufferSave() {
                this.$emit('trigger-save', this.effectiveTree);
            },
            handleVisualNodeClick(clickedNode) {
                this.selectedMariaId = clickedNode.mariaId;
                this.contextBus.postMessage({
                    event: 'element-selected-by-id',
                    mariaId: clickedNode.mariaId,
                    screen: clickedNode.screen
                });
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