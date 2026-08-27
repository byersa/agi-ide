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

                <!-- NATIVE QMETA BLUEPRINT RENDERER ENGINE -->
                <div id="canvas-elements-viewport" class="column no-wrap items-stretch full-width" @click="handleCanvasClick">
                    <template v-if="effectiveTree">
                        <template v-if="canvasWidgetNodes && canvasWidgetNodes.length > 0">
                            <m-blueprint-node 
                                v-for="(childNode, idx) in canvasWidgetNodes" 
                                :key="childNode.mariaId || idx"
                                :node="childNode" 
                                :context="{ 
                                    selectedMariaId: selectedMariaId,
                                    currentPathList: dynamicSubscreenPath,
                                    subscreens: parsedTree.subscreens
                                }"
                            ></m-blueprint-node>
                        </template>
                
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
        data() {
            return {
                selectedMariaId: '',
                contextBus: null
            };
        },
        computed: {
            parsedTree() {
                if (!this.layoutTree) return null;
                if (typeof this.layoutTree === 'string') {
                    try { return JSON.parse(this.layoutTree); } catch (e) { return null; }
                }
                return this.layoutTree;
            },

            effectiveTree() {
                return this.parsedTree;
            },

            canvasWidgetNodes() {
                const rawTree = this.parsedTree;
                if (!rawTree) return [];

                const rootTag = rawTree._moquiTag || rawTree.name || rawTree.tag;

                if (rootTag === 'screen' && Array.isArray(rawTree.children)) {
                    const widgetsNode = rawTree.children.find(c => (c._moquiTag || c.name || c.tag) === 'widgets');
                    if (widgetsNode && Array.isArray(widgetsNode.children)) {
                        return widgetsNode.children;
                    }
                    return rawTree.children.filter(c => !['transition', 'actions', 'subscreens'].includes(c._moquiTag || c.name || c.tag));
                }

                if (rootTag === 'widgets' && Array.isArray(rawTree.children)) {
                    return rawTree.children;
                }

                return [rawTree];
            },

            dynamicSubscreenPath() {
                const tree = this.parsedTree;
                if (!tree) return [];
                const defaultSub = tree.subscreens?.defaultItem;
                if (defaultSub && defaultSub.length > 0) return [defaultSub];
                const subChildren = tree.subscreens?.children || [];
                if (subChildren.length > 0 && subChildren[0].name) return [subChildren[0].name];
                return [];
            }
        },
        mounted() {
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = (msg) => {
                if (msg.data?.event === 'element-selected-by-id') {
                    this.onElementSelected(msg.data.mariaId);
                }
            };

            this.onWindowSelection = (e) => {
                if (e.detail?.mariaId) {
                    this.onElementSelected(e.detail.mariaId);
                }
            };
            window.addEventListener('element-selected-by-id', this.onWindowSelection);
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
            if (this.onWindowSelection) {
                window.removeEventListener('element-selected-by-id', this.onWindowSelection);
            }
        },
        methods: {
            executeBufferSave() {
                this.$emit('trigger-save', this.effectiveTree);
            },
            onElementSelected(mariaId) {
                if (!mariaId) return;
                this.selectedMariaId = mariaId;
                this.scrollToNode(mariaId);
            },
            scrollToNode(mariaId) {
                if (!mariaId) return;
                const fieldName = mariaId.includes('#') ? mariaId.split('#').pop() : mariaId;

                this.$nextTick(() => {
                    // 1. Remove previous active classes
                    const allSelected = this.$el.querySelectorAll('.agi-canvas-selected-node, .selected-highlight');
                    allSelected.forEach(el => {
                        el.classList.remove('agi-canvas-selected-node');
                        el.classList.remove('selected-highlight');
                    });

                    // 2. Locate element by data-field-name, mariaid, or data-maria-id
                    const el = this.$el.querySelector(`[data-field-name="${fieldName}"]`)
                        || this.$el.querySelector(`[mariaid="${mariaId}"]`)
                        || this.$el.querySelector(`[data-maria-id="${mariaId}"]`)
                        || this.$el.querySelector(`[mariaid$="#${fieldName}"]`);

                    if (el) {
                        const targetWrapper = el.classList.contains('moqui-field-wrapper') ? el : (el.closest('.moqui-field-wrapper') || el);
                        targetWrapper.classList.add('agi-canvas-selected-node');
                        targetWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        targetWrapper.classList.add('pulse-highlight');
                        setTimeout(() => targetWrapper.classList.remove('pulse-highlight'), 800);
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
            }
        } else {
            setTimeout(registerAgiCanvasEditor, 50);
        }
    };
    registerAgiCanvasEditor();
})();