(function() {
    // 1. Recursive Node Render Component
    const AgiCanvasNode = {
        name: 'AgiCanvasNode',
        props: {
            node: { type: Object, required: true },
            selectedMariaId: { type: String, default: '' }
        },
        emits: ['node-click'],
        template: `
            <div 
                :class="['canvas-node q-pa-sm q-ma-xs rounded-borders', node.type.toLowerCase(), selectedMariaId === node.mariaId ? 'selected-highlight' : '']"
                :style="getNodeStyle(node)"
                :mariaid="node.mariaId"
                @click.stop="$emit('node-click', node)"
            >
                <div class="row items-center justify-between text-caption text-bold text-grey-8">
                    <span>{{ node.type }}: {{ node.id || node.name || node.mariaId }}</span>
                </div>
                
                <!-- Recursive Render of Children -->
                <div v-if="node.children && node.children.length" class="q-pl-sm row q-gutter-xs">
                    <agi-canvas-node 
                        v-for="child in node.children" 
                        :key="child.mariaId" 
                        :node="child"
                        :selected-maria-id="selectedMariaId"
                        @node-click="$emit('node-click', $event)"
                    ></agi-canvas-node>
                </div>
                <div v-else class="text-caption text-grey-6 q-pl-xs">
                    {{ node.text || '' }}
                </div>
            </div>
        `,
        methods: {
            getNodeStyle(node) {
                let style = {
                    border: '1px solid #cbd5e1',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    minWidth: '120px'
                };
                if (node.type === 'Container') {
                    style.backgroundColor = '#f8fafc';
                    style.borderStyle = 'dashed';
                } else if (node.type === 'FormSingle') {
                    style.backgroundColor = '#f0fdf4';
                    style.borderColor = '#86efac';
                } else if (node.type === 'FormField') {
                    style.backgroundColor = '#eff6ff';
                    style.borderColor = '#93c5fd';
                } else if (node.type === 'Link') {
                    style.backgroundColor = '#fdf2f8';
                    style.borderColor = '#fbcfe8';
                } else if (node.type === 'Label') {
                    style.backgroundColor = '#fff7ed';
                    style.borderColor = '#fed7aa';
                }
                return style;
            }
        }
    };

    // 2. Main Canvas Editor Component
    const AgiCanvasEditor = {
        name: 'AgiCanvasEditor',
        components: {
            AgiCanvasNode
        },
        template: `
            <q-scroll-area class="fit q-pa-sm bg-slate-900" style="height: 100%;">
                <style>
                    .selected-highlight {
                        outline: 2px solid #3b82f6 !important;
                        box-shadow: 0 0 10px rgba(59, 130, 246, 0.6) !important;
                        background-color: #dbeafe !important;
                    }
                    .pulse-highlight {
                        animation: pulseGlow 1s infinite alternate;
                    }
                    @keyframes pulseGlow {
                        from {
                            box-shadow: 0 0 4px rgba(59, 130, 246, 0.4);
                        }
                        to {
                            box-shadow: 0 0 12px rgba(59, 130, 246, 0.8);
                        }
                    }
                </style>
                
                <div class="q-mb-md">
                    <div class="text-h6 text-grey-8">Visual Canvas Workspace</div>
                    <div class="text-caption text-grey-6">Active Path: {{ screenPath }}</div>
                </div>

                <div class="row q-col-gutter-sm">
                    <agi-canvas-node 
                        v-for="rootNode in blueprintTree" 
                        :key="rootNode.mariaId" 
                        :node="rootNode" 
                        :selected-maria-id="selectedMariaId"
                        @node-click="handleVisualNodeClick"
                    ></agi-canvas-node>
                </div>
            </q-scroll-area>
        `,
        props: {
            screenPath: {
                type: String,
                required: true
            }
        },
        data() {
            return {
                blueprintTree: [],
                selectedMariaId: '',
                contextBus: null
            };
        },
        mounted() {
            // Initialize BroadCastChannel tunnel
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            
            // Listen for focus updates from external panels
            this.contextBus.onmessage = (msg) => {
                if (msg.data && msg.data.event === 'element-selected-by-id') {
                    this.selectedMariaId = msg.data.mariaId;
                    this.scrollToNode(msg.data.mariaId);
                }
            };

            // Fetch compiled metadata JSON payload
            fetch('/apps/agi-ide/AgiWorkspace?renderMode=qmeta&screenPath=' + encodeURIComponent(this.screenPath))
                .then(res => res.json())
                .then(data => {
                    this.blueprintTree = data;
                })
                .catch(err => {
                    console.warn("Telemetry fetch failed, registering fallback mock components structure", err);
                    // Register fallback mock data matches
                    this.blueprintTree = [
                        {
                            mariaId: "node_1",
                            type: "Container",
                            id: "main-layout",
                            screen: this.screenPath,
                            children: [
                                {
                                    mariaId: "node_2",
                                    type: "FormSingle",
                                    id: "SampleForm",
                                    screen: this.screenPath,
                                    children: [
                                        { mariaId: "node_3", type: "FormField", name: "username", text: "Username Input Field", screen: this.screenPath },
                                        { mariaId: "node_4", type: "FormField", name: "email", text: "Email Input Field", screen: this.screenPath }
                                    ]
                                },
                                { mariaId: "node_5", type: "Link", id: "submit-btn", text: "Submit Action Link", screen: this.screenPath },
                                { mariaId: "node_6", type: "Label", text: "System Footer Notice", screen: this.screenPath }
                            ]
                        }
                    ];
                });
        },
        beforeUnmount() {
            if (this.contextBus) {
                this.contextBus.close();
            }
        },
        methods: {
            handleVisualNodeClick(clickedNode) {
                this.selectedMariaId = clickedNode.mariaId;
                
                // Broadcast coordinates symmetrically to all open layout panes
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
})();