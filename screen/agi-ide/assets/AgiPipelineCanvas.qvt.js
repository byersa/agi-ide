(function () {
    const AgiPipelineCanvas = {
        name: 'AgiPipelineCanvas',
        emits: ['stage-selected', 'edge-selected'],
        props: {
            discussionId: { type: String, default: '' },
            targetComponent: { type: String, default: 'nursinghome' },
            selectedStageId: { type: String, default: '' },
            selectedEdgeId: { type: String, default: '' }
        },
        data() {
            return {
                rawNodes: [],
                rawEdges: [],
                loading: false,
                canvasScale: 1.0
            };
        },
        computed: {
            // Topological layout: compute column depth (X) and row index (Y)
            dagLayout() {
                if (!this.rawNodes || this.rawNodes.length === 0) return { columns: [], nodeMap: {} };

                const nodeMap = {};
                this.rawNodes.forEach(n => {
                    nodeMap[String(n.stageId)] = Object.assign({}, n, {
                        depth: 0,
                        row: 0,
                        children: []
                    });
                });

                // Link children
                this.rawEdges.forEach(e => {
                    const parent = nodeMap[String(e.from)];
                    const child = nodeMap[String(e.to)];
                    if (parent && child) {
                        parent.children.push(child);
                    }
                });

                // Calculate Depth (X Position)
                const assignDepth = (node, currentDepth) => {
                    if (node.depth < currentDepth) {
                        node.depth = currentDepth;
                    }
                    node.children.forEach(ch => assignDepth(ch, currentDepth + 1));
                };

                const rootNodes = Object.values(nodeMap).filter(n => !n.parentStageId);
                rootNodes.forEach(r => assignDepth(r, 0));

                // Group by Depth column
                const depthColumns = [];
                Object.values(nodeMap).forEach(n => {
                    if (!depthColumns[n.depth]) depthColumns[n.depth] = [];
                    depthColumns[n.depth].push(n);
                });

                // Assign Row index within each column
                depthColumns.forEach((col, dIdx) => {
                    if (!col) return;
                    col.forEach((node, rIdx) => {
                        node.row = rIdx;
                    });
                });

                return { columns: depthColumns.filter(Boolean), nodeMap };
            }
        },
        watch: {
            discussionId: {
                immediate: true,
                handler(val) {
                    if (val) this.fetchPipelineGraph();
                    else {
                        this.rawNodes = [];
                        this.rawEdges = [];
                    }
                }
            }
        },
        methods: {
            resolveCsrf() {
                return window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || "";
            },

            async fetchPipelineGraph() {
                if (!this.discussionId) return;
                this.loading = true;
                try {
                    const resp = await axios.get('/rest/s1/agi-ai/discussions/pipeline-graph', {
                        params: {
                            discussionId: this.discussionId,
                            targetComponent: this.targetComponent
                        },
                        headers: { 'moquiSessionToken': this.resolveCsrf() }
                    });
                    this.rawNodes = resp.data?.pipelineNodes || [];
                    this.rawEdges = resp.data?.pipelineEdges || [];

                    // Auto-select terminal node if none selected
                    if (!this.selectedStageId && this.rawNodes.length > 0) {
                        this.selectStage(this.rawNodes[this.rawNodes.length - 1]);
                    }
                } catch (e) {
                    console.error("Failed to load pipeline DAG graph:", e);
                } finally {
                    this.loading = false;
                }
            },

            selectStage(node) {
                this.$emit('stage-selected', node);
            },

            selectEdge(fromNode, toNode) {
                const edgeKey = `${fromNode.stageId}->${toNode.stageId}`;
                this.$emit('edge-selected', {
                    edgeId: edgeKey,
                    fromStage: fromNode,
                    toStage: toNode
                });
            },

            scrollCanvas(deltaX) {
                const el = this.$refs.canvasScrollArea;
                if (el) {
                    el.scrollBy({ left: deltaX, behavior: 'smooth' });
                }
            },

            scrollCanvasY(deltaY) {
                const el = this.$refs.canvasScrollArea;
                if (el) {
                    el.scrollBy({ top: deltaY, behavior: 'smooth' });
                }
            },

            getBadgeStyle(type) {
                if (type === 'build') return { color: 'amber-9', icon: 'handyman', textColor: 'black', border: '#f59e0b' };
                if (type === 'plan') return { color: 'deep-purple-7', icon: 'architecture', textColor: 'white', border: '#7c3aed' };
                return { color: 'primary', icon: 'chat', textColor: 'white', border: '#0284c7' };
            }
        },
        template: `
            <div class="agi-pipeline-canvas fit column no-wrap bg-slate-950 font-mono text-white relative-position overflow-hidden" style="border-bottom: 1px solid #334155; height: 100%; min-height: 0;">
                
                <component :is="'style'">
                    .agi-dag-viewport {
                        scrollbar-width: thin;
                        scrollbar-color: #0284c7 #020617;
                    }
                    .agi-dag-viewport::-webkit-scrollbar {
                        width: 10px !important;
                        height: 10px !important;
                    }
                    .agi-dag-viewport::-webkit-scrollbar-track {
                        background: #020617 !important;
                        border: 1px solid #1e293b;
                    }
                    .agi-dag-viewport::-webkit-scrollbar-thumb {
                        background: #0284c7 !important;
                        border-radius: 5px !important;
                        border: 2px solid #020617;
                    }
                    .agi-dag-viewport::-webkit-scrollbar-thumb:hover {
                        background: #38bdf8 !important;
                    }
                </component>

                <!-- TOP CONTROLS & BREADCRUMB STRIP (FIXED 32px) -->
                <div class="row items-center justify-between q-px-sm q-py-xs bg-black" style="border-bottom: 1px solid #1e293b; height: 32px; min-height: 32px; flex: 0 0 32px;">
                    <div class="row items-center q-gutter-x-xs">
                        <q-icon name="account_tree" color="cyan-4" size="16px" />
                        <span class="text-caption text-weight-bold text-cyan-2" style="font-size: 11px;">PIPELINE DAG</span>
                        <span class="text-caption text-slate-500 q-ml-xs" style="font-size: 10px;">
                            ({{ dagLayout.columns.length }} columns • {{ rawNodes.length }} compute steps)
                        </span>
                    </div>

                    <!-- Scroll Steppers: Both Horizontal (Left/Right) and Vertical (Up/Down) -->
                    <div class="row items-center q-gutter-x-xs">
                        <span class="text-slate-500 font-mono text-caption q-mr-xs" style="font-size: 9px;">PAN:</span>
                        <q-btn flat dense icon="arrow_back" size="xs" color="cyan-3" label="Left" no-caps class="text-weight-bold" @click="scrollCanvas(-300)">
                            <q-tooltip>Scroll DAG Left</q-tooltip>
                        </q-btn>
                        <q-btn flat dense icon-right="arrow_forward" size="xs" color="cyan-3" label="Right" no-caps class="text-weight-bold" @click="scrollCanvas(300)">
                            <q-tooltip>Scroll DAG Right</q-tooltip>
                        </q-btn>
                        
                        <q-separator vertical dark class="q-mx-xs" />

                        <q-btn flat dense icon="arrow_upward" size="xs" color="amber-4" label="Up" no-caps class="text-weight-bold" @click="scrollCanvasY(-200)">
                            <q-tooltip>Scroll Branches Up</q-tooltip>
                        </q-btn>
                        <q-btn flat dense icon-right="arrow_downward" size="xs" color="amber-4" label="Down" no-caps class="text-weight-bold" @click="scrollCanvasY(200)">
                            <q-tooltip>Scroll Branches Down</q-tooltip>
                        </q-btn>

                        <q-separator vertical dark class="q-mx-xs" />
                        <q-btn flat round dense icon="refresh" size="xs" color="slate-400" @click="fetchPipelineGraph" />
                    </div>
                </div>

                <!-- 2-AXIS SCROLLABLE CANVAS VIEWPORT -->
                <div 
                    ref="canvasScrollArea" 
                    class="col agi-dag-viewport q-pa-sm relative-position" 
                    style="overflow-x: scroll !important; overflow-y: scroll !important; flex: 1 1 0%; min-height: 0; height: 100%; scroll-behavior: smooth;"
                >
                    <div v-if="loading" class="fit row flex-center">
                        <q-spinner-dots color="cyan-4" size="2em" />
                        <span class="q-ml-sm text-caption text-slate-400">Loading Pipeline Graph...</span>
                    </div>

                    <div v-else-if="dagLayout.columns.length === 0" class="fit row flex-center text-slate-500 italic text-caption">
                        No compute stages in this pipeline. Formulate a plan or add a turn to begin.
                    </div>

                    <!-- THE HORIZONTAL COLUMN STACK -->
                    <div v-else class="row no-wrap items-start q-gutter-x-xl q-py-sm" style="min-width: max-content; width: max-content; min-height: 100%;">
                        
                        <div 
                            v-for="(col, colIndex) in dagLayout.columns" 
                            :key="colIndex"
                            class="column q-gutter-y-md items-center relative-position"
                            style="min-width: 240px; max-width: 280px;"
                        >
                            <!-- Column Header Badge (Stage Sequence) -->
                            <div class="text-overline text-slate-500 font-mono text-center q-mb-xs" style="font-size: 10px; line-height: 1;">
                                STEP {{ colIndex + 1 }}
                            </div>

                            <!-- Stage Action Cards in this Column -->
                            <div 
                                v-for="node in col" 
                                :key="node.stageId"
                                class="column full-width relative-position"
                            >
                                <!-- STAGE ACTION CARD -->
                                <div 
                                    class="q-pa-xs rounded-borders cursor-pointer transition-all shadow-2 relative-position"
                                    :class="String(selectedStageId) === String(node.stageId) ? 'bg-slate-900 border-active-node' : 'bg-slate-950 border-dim-node'"
                                    :style="{
                                        border: String(selectedStageId) === String(node.stageId) 
                                            ? '2px solid ' + getBadgeStyle(node.actionType).border 
                                            : '1px solid #334155',
                                        boxShadow: String(selectedStageId) === String(node.stageId)
                                            ? '0 0 12px rgba(56, 189, 248, 0.45)'
                                            : 'none'
                                    }"
                                    @click="selectStage(node)"
                                >
                                    <!-- Header Row: Badge & ID -->
                                    <div class="row items-center justify-between q-mb-xs">
                                        <div class="row items-center q-gutter-x-xs">
                                            <q-badge 
                                                :color="getBadgeStyle(node.actionType).color" 
                                                :text-color="getBadgeStyle(node.actionType).textColor"
                                                class="font-mono text-weight-bolder text-caption"
                                                style="font-size: 9px; padding: 2px 4px;"
                                            >
                                                <q-icon :name="getBadgeStyle(node.actionType).icon" size="10px" class="q-mr-xs" />
                                                {{ node.actionType.toUpperCase() }}
                                            </q-badge>
                                            <span class="text-caption text-slate-500 font-mono" style="font-size: 9px;">#{{ node.stageId }}</span>
                                        </div>

                                        <span class="text-slate-500 text-caption font-mono" style="font-size: 8px;">
                                            {{ node.role === 'assistant' ? 'AI' : 'USER' }}
                                        </span>
                                    </div>

                                    <!-- Content Title -->
                                    <div class="text-caption text-weight-bold ellipsis-2-lines text-slate-200 q-mb-xs" style="font-size: 11px; line-height: 1.3;">
                                        {{ node.label }}
                                    </div>

                                    <!-- Target Anchor (if applicable) -->
                                    <div v-if="node.targetArtifactUri" class="text-cyan-4 font-mono ellipsis" style="font-size: 9px;">
                                        {{ node.targetArtifactUri.split('/').pop() }}
                                    </div>
                                </div>

                                <!-- CLICKABLE TRANSITION EDGE CONNECTORS TO CHILDREN -->
                                <template v-if="node.children && node.children.length > 0">
                                    <div 
                                        v-for="child in node.children" 
                                        :key="child.stageId"
                                        class="edge-connector-bridge row items-center justify-center cursor-pointer q-my-xs"
                                        :class="{ 'edge-selected': selectedEdgeId === (node.stageId + '->' + child.stageId) }"
                                        @click.stop="selectEdge(node, child)"
                                    >
                                        <div class="row items-center q-px-xs rounded-borders bg-slate-900 edge-chip" style="border: 1px dashed #0284c7;">
                                            <q-icon name="swap_horiz" size="12px" color="amber-4" class="q-mr-xs" />
                                            <span class="text-caption font-mono text-cyan-3" style="font-size: 9px;">
                                                Transition: #{{ node.stageId }} ➔ #{{ child.stageId }}
                                            </span>
                                        </div>
                                    </div>
                                </template>

                            </div>

                        </div>

                    </div>

                </div>

            </div>
        `
    };

    window.AgiPipelineCanvas = AgiPipelineCanvas;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-pipeline-canvas'] = AgiPipelineCanvas;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('agi-pipeline-canvas', AgiPipelineCanvas);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();