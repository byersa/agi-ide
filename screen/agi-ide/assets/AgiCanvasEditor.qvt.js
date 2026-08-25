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
                        <template v-if="canvasWidgetNodes && canvasWidgetNodes.length > 0">
                            <m-blueprint-node 
                                v-for="(childNode, idx) in canvasWidgetNodes" 
                                :key="childNode.mariaId || childNode.id || idx"
                                :node="childNode" 
                                :context="{ 
                                    selectedMariaId: selectedMariaId,
                                    currentPathList: dynamicSubscreenPath,
                                    subscreens: parsedTree.subscreens
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
            // 🎯 Ensure tree is parsed Map/Object
            parsedTree() {
                if (!this.layoutTree) return null;
                if (typeof this.layoutTree === 'string') {
                    try { return JSON.parse(this.layoutTree); } catch (e) { return null; }
                }
                return this.layoutTree;
            },

            // 🎯 Extract visual root or children
            effectiveTree() {
                return this.parsedTree;
            },

            // 🎯 Locate actual visual nodes (unwrapping <screen> and <widgets>)
            // In AgiCanvasEditor.qvt.js computed properties:

            canvasWidgetNodes() {
                const rawTree = this.parsedTree;
                if (!rawTree) return [];

                // Helper to recursively normalize 'name' -> '_moquiTag'
                // In AgiCanvasEditor.qvt.js normalizeAstNode helper:
                const normalizeAstNode = (node, parentId = '') => {
                    if (!node || typeof node !== 'object') return node;

                    const tag = node._moquiTag || node.name || node.tag || 'container';
                    const rawName = node.attributes?.name || node.name || node.id || '';

                    // Formulate a distinct hierarchical ID if node lacks one
                    let assignedId = node.mariaId || node.id;
                    if (!assignedId) {
                        assignedId = parentId ? `${parentId}#${rawName || tag}` : (rawName || tag);
                    }

                    const children = (node.children || []).map(child => normalizeAstNode(child, assignedId));

                    return {
                        ...node,
                        mariaId: assignedId,
                        _moquiTag: tag,
                        children: children,
                        attributes: node.attributes || {}
                    };
                };

                const rootTag = rawTree._moquiTag || rawTree.name || rawTree.tag;

                // 1. If root is <screen>, extract children of <widgets>
                if (rootTag === 'screen' && Array.isArray(rawTree.children)) {
                    const widgetsNode = rawTree.children.find(c => {
                        const t = c._moquiTag || c.name || c.tag;
                        return t === 'widgets';
                    });

                    if (widgetsNode && Array.isArray(widgetsNode.children)) {
                        return widgetsNode.children.map(normalizeAstNode);
                    }

                    // Filter out non-visual elements
                    return rawTree.children
                        .filter(c => !['transition', 'actions', 'subscreens'].includes(c._moquiTag || c.name || c.tag))
                        .map(normalizeAstNode);
                }

                // 2. Direct <widgets> node
                if (rootTag === 'widgets' && Array.isArray(rawTree.children)) {
                    return rawTree.children.map(normalizeAstNode);
                }

                return [normalizeAstNode(rawTree)];
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
            // 1. Channel listener for cross-component / iframe broadcasts
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = (msg) => {
                if (msg.data?.event === 'element-selected-by-id') {
                    this.onElementSelected(msg.data.mariaId);
                }
            };

            // 2. Window listener fallback for same-window execution
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
                this.$nextTick(() => {
                    const el = this.$el.querySelector(`[data-maria-id="${mariaId}"]`)
                        || this.$el.querySelector(`[mariaid="${mariaId}"]`)
                        || document.querySelector(`[mariaid="${mariaId}"]`);
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