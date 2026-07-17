(function () {
    // 1. Define the Node Component Option Object
    const AgiCanvasNode = {
        name: 'AgiCanvasNode',
        props: {
            node: { type: Object, required: true },
            selectedMariaId: { type: String, default: '' }
        },
        emits: ['node-click'],
        template: `
            <component 
                :is="resolveQuasarTag(node.type || node.tagName)"
                :class="[getNodeClasses(node), node.mariaId === selectedMariaId ? 'selected-highlight' : '']"
                v-bind="mapNodeAttributes(node)"
                @click.stop="$emit('node-click', node)"
            >
                {{ node.text }}
                <agi-canvas-node 
                    v-for="child in (node.children || node.widgets)" 
                    :key="child.mariaId || child.id" 
                    :node="child"
                    :selected-maria-id="selectedMariaId"
                    @node-click="$emit('node-click', $event)"
                />
            </component>
        `,
        methods: {
            resolveQuasarTag(type) {
                if (!type) return 'div';
                switch (type.toLowerCase()) {
                    case 'container': case 'webroot': case 'widgets': return 'div';
                    case 'form': case 'formsingle': return 'q-form';
                    case 'field-row': return 'div';
                    case 'text-field': case 'formfield': return 'q-input';
                    case 'submit': case 'link': return 'q-btn';
                    case 'label': return 'div';
                    default: return 'div';
                }
            },
            getNodeClasses(node) {
                let baseClass = 'agi-canvas-element-wrapper ';
                const type = node.type || node.tagName;
                if (!type) return baseClass;
                switch (type.toLowerCase()) {
                    case 'formsingle': case 'form': case 'container':
                        baseClass += 'q-pa-md q-my-sm bg-white rounded-borders shadow-1 full-width column q-gutter-y-sm'; break;
                    case 'formfield': case 'text-field': baseClass += 'q-my-xs block full-width'; break;
                    case 'link': case 'submit': baseClass += 'q-mt-md block text-left'; break;
                    case 'label': baseClass += 'text-body2 text-grey-7 q-py-xs block'; break;
                    default: baseClass += 'q-pa-sm block';
                }
                return baseClass;
            },
            mapNodeAttributes(node) {
                const type = node.type || node.tagName;
                if (!type) return {};
                const t = type.toLowerCase();
                if (t === 'formfield' || t === 'text-field') {
                    return { label: node.text || node.name || 'Form Control', outlined: true, dense: true, 'model-value': '', class: 'bg-white' };
                }
                if (t === 'link' || t === 'submit') {
                    return { label: node.text || 'Action Execute', color: 'primary', unelevated: true, dense: false };
                }
                return {};
            }
        }
    };

    // 🎯 Crucial: Bind explicitly to window immediately so the inner component resolution block won't drop it
    window.AgiCanvasNode = AgiCanvasNode;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-canvas-node'] = AgiCanvasNode;

    // 2. Main Canvas Editor Component Option Object
    const AgiCanvasEditor = {
        name: 'AgiCanvasEditor',
        mixins: [window.AgiEditorShareMixin].filter(m => m !== undefined),
        components: {
            // 🎯 Map directly to the globally verified scope variable to avoid undefined race references
            'agi-canvas-node': window.AgiCanvasNode || AgiCanvasNode
        },
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
                <div id="canvas-elements-viewport" class="column no-wrap items-stretch full-width">
                    <agi-canvas-node 
                        v-for="rootNode in (Array.isArray(localBlueprintTree) ? localBlueprintTree : [localBlueprintTree])" 
                        :key="rootNode.mariaId || rootNode.id" 
                        :node="rootNode" 
                        :selected-maria-id="selectedMariaId" 
                        @node-click="handleVisualNodeClick"
                    ></agi-canvas-node>
                </div>
            </div>
        `,
        props: {
            screenPath: { type: String, required: true },
            layoutTree: { type: Object, default: () => ({ id: "root", tagName: "form", children: [] }) }
        },
        data() {
            return {
                selectedMariaId: '',
                contextBus: null,
                localBlueprintTree: { id: "root", tagName: "form", children: [] }
            };
        },
        watch: {
            layoutTree: {
                handler(newTree) {
                    if (newTree) {
                        let normalizedTree = JSON.parse(JSON.stringify(newTree));
                        if (normalizedTree && normalizedTree.widgets && !normalizedTree.children) {
                            normalizedTree.children = normalizedTree.widgets;
                        }
                        this.localBlueprintTree = normalizedTree;
                    }
                },
                immediate: true,
                deep: true
            }
        },
        mounted() {
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = (msg) => {
                if (!msg.data) return;
                if (msg.data.event === 'element-selected-by-id') {
                    this.selectedMariaId = msg.data.mariaId;
                    this.scrollToNode(msg.data.mariaId);
                } else if (msg.data.event === 'artifact-state-mutated') {
                    this.localBlueprintTree = msg.data.mutatedTree;
                }
            };
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },
        methods: {
            executeBufferSave() {
                this.$emit('trigger-save', this.localBlueprintTree || this.layoutTree);
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
    window.AgiComponents['agi-canvas-editor'] = AgiCanvasEditor;

    const registerAgiCanvasEditor = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            if (!window.moqui.webrootVueApp.component('agi-canvas-node')) {
                window.moqui.webrootVueApp.component('agi-canvas-node', window.AgiCanvasNode);
            }
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