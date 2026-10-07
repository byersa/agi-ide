(function () {
    const AgiPipelineCanvas = {
        name: 'AgiPipelineCanvas',
        emits: ['stage-selected'],
        props: {
            discussionId: { type: String, default: '' },
            targetComponent: { type: String, default: 'nursinghome' },
            selectedStageId: { type: String, default: '' }
        },
        data() {
            return {
                rawNodes: [],
                rawEdges: [],
                loading: false,
                edgePaths: [],
                svgDimensions: { width: 1400, height: 800 }
            };
        },
        computed: {
            dagLayout() {
                if (!this.rawNodes || this.rawNodes.length === 0) return { columns: [], nodeMap: {} };

                const nodeMap = {};
                this.rawNodes.forEach(n => {
                    nodeMap[String(n.stageId)] = Object.assign({}, n, {
                        depth: 0,
                        row: 0,
                        parents: [],
                        children: []
                    });
                });

                this.rawEdges.forEach(e => {
                    const parent = nodeMap[String(e.from)];
                    const child = nodeMap[String(e.to)];
                    if (parent && child) {
                        parent.children.push(child);
                        child.parents.push(parent);
                    }
                });

                const assignDepth = (node, currentDepth) => {
                    if (node.depth < currentDepth) {
                        node.depth = currentDepth;
                    }
                    node.children.forEach(ch => assignDepth(ch, currentDepth + 1));
                };

                const rootNodes = Object.values(nodeMap).filter(n => !n.parentStageId);
                rootNodes.forEach(r => assignDepth(r, 0));

                const depthColumns = [];
                Object.values(nodeMap).forEach(n => {
                    if (!depthColumns[n.depth]) depthColumns[n.depth] = [];
                    depthColumns[n.depth].push(n);
                });

                depthColumns.forEach((col) => {
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
                        this.edgePaths = [];
                    }
                }
            }
        },
        mounted() {
            window.addEventListener('resize', this.scheduleRecalcEdges);
        },
        beforeUnmount() {
            window.removeEventListener('resize', this.scheduleRecalcEdges);
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

                    if (!this.selectedStageId && this.rawNodes.length > 0) {
                        this.selectStage(this.rawNodes[this.rawNodes.length - 1]);
                    }
                    this.scheduleRecalcEdges();
                } catch (e) {
                    console.error("Failed to load pipeline DAG graph:", e);
                } finally {
                    this.loading = false;
                }
            },

            scheduleRecalcEdges() {
                this.$nextTick(() => {
                    setTimeout(this.computeOrthogonalEdges, 100);
                });
            },

            computeOrthogonalEdges() {
                const container = this.$refs.canvasScrollArea;
                if (!container || !this.rawEdges || this.rawEdges.length === 0) {
                    this.edgePaths = [];
                    return;
                }

                const containerRect = container.getBoundingClientRect();
                const scrollLeft = container.scrollLeft || 0;
                const scrollTop = container.scrollTop || 0;

                this.svgDimensions = {
                    width: Math.max(container.scrollWidth, 1400),
                    height: Math.max(container.scrollHeight, 700)
                };

                const computed = [];
                const nodeMap = this.dagLayout.nodeMap || {};

                this.rawEdges.forEach(edge => {
                    const sourceEl = document.getElementById('stage-badge-' + edge.from);
                    const targetEl = document.getElementById('stage-badge-' + edge.to);

                    if (!sourceEl || !targetEl) return;

                    const sRect = sourceEl.getBoundingClientRect();
                    const tRect = targetEl.getBoundingClientRect();

                    const x1 = (sRect.right - containerRect.left) + scrollLeft;
                    const y1 = (sRect.top + (sRect.height / 2) - containerRect.top) + scrollTop;

                    const x2 = (tRect.left - containerRect.left) + scrollLeft;
                    const y2 = (tRect.top + (tRect.height / 2) - containerRect.top) + scrollTop;

                    const turnX = x1 + 24;

                    const pathData = `M ${x1} ${y1} L ${turnX} ${y1} L ${turnX} ${y2} L ${x2} ${y2}`;
                    const edgeKey = `${edge.from}->${edge.to}`;
                    const isSelected = String(this.selectedStageId) === String(edge.to);

                    computed.push({
                        edgeId: edgeKey,
                        from: edge.from,
                        to: edge.to,
                        d: pathData,
                        isSelected: isSelected
                    });
                });

                this.edgePaths = computed;
            },

            selectStage(node) {
                if (!node) return;

                const nodeMap = this.dagLayout.nodeMap || {};
                const mappedNode = nodeMap[String(node.stageId)] || node;

                // Locate primary upstream parent node to form the pair
                let parentNode = null;
                if (mappedNode.parents && mappedNode.parents.length > 0) {
                    parentNode = mappedNode.parents[0];
                } else if (node.parentStageId && nodeMap[String(node.parentStageId)]) {
                    parentNode = nodeMap[String(node.parentStageId)];
                }

                const enrichedPayload = {
                    stage: Object.assign({}, mappedNode, {
                        stepNumber: (mappedNode.depth || 0) + 1,
                        totalSteps: this.dagLayout.columns.length
                    }),
                    parentStage: parentNode ? Object.assign({}, parentNode) : null
                };

                this.$emit('stage-selected', enrichedPayload);
                this.scheduleRecalcEdges();

                // Smoothly center the active node horizontally
                this.$nextTick(() => {
                    const badgeEl = document.getElementById('stage-card-' + node.stageId);
                    const container = this.$refs.canvasScrollArea;
                    if (badgeEl && container) {
                        const bRect = badgeEl.getBoundingClientRect();
                        const cRect = container.getBoundingClientRect();
                        const offset = bRect.left - cRect.left - (cRect.width / 2) + (bRect.width / 2);
                        container.scrollBy({ left: offset, behavior: 'smooth' });
                    }
                });
            },

            scrollCanvas(deltaX) {
                const el = this.$refs.canvasScrollArea;
                if (el) el.scrollBy({ left: deltaX, behavior: 'smooth' });
            },

            scrollCanvasY(deltaY) {
                const el = this.$refs.canvasScrollArea;
                if (el) el.scrollBy({ top: deltaY, behavior: 'smooth' });
            },

            getBadgeStyle(type) {
                if (type === 'build') {
                    return { bg: '#f59e0b', fg: '#000000', titleColor: '#fde68a', icon: 'handyman', border: '#f59e0b' };
                }
                if (type === 'plan') {
                    return { bg: '#7c3aed', fg: '#ffffff', titleColor: '#ddd6fe', icon: 'architecture', border: '#a78bfa' };
                }
                return { bg: '#0284c7', fg: '#ffffff', titleColor: '#bae6fd', icon: 'chat', border: '#38bdf8' };
            }
        },
        template: `
            <div class="agi-pipeline-canvas fit column no-wrap bg-slate-950 font-mono text-white relative-position overflow-hidden" style="height: 100%; min-height: 0; width: 100%;">
                
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

                    .leader-line-svg {
                        pointer-events: none !important;
                    }
                    .leader-line-path {
                        fill: none;
                        stroke: #0284c7;
                        stroke-width: 1.5;
                        stroke-dasharray: 4, 3;
                        pointer-events: none !important;
                    }
                    .leader-line-selected {
                        stroke: #38bdf8 !important;
                        stroke-width: 2.5 !important;
                        stroke-dasharray: none !important;
                    }
                </component>

                <!-- TOP CONTROLS & BREADCRUMB STRIP (FIXED 32px) -->
                <div class="row items-center justify-between q-px-sm bg-black" style="border-bottom: 1px solid #1e293b; height: 32px; min-height: 32px; max-height: 32px; flex: 0 0 32px; z-index: 30;">
                    <div class="row items-center q-gutter-x-xs">
                        <q-icon name="account_tree" color="cyan-4" size="16px" />
                        <span class="text-caption text-weight-bold text-cyan-2" style="font-size: 11px;">PIPELINE DAG</span>
                        <span class="text-caption text-slate-500 q-ml-xs" style="font-size: 10px;">
                            ({{ dagLayout.columns.length }} columns • {{ rawNodes.length }} compute steps)
                        </span>
                    </div>

                    <div class="row items-center q-gutter-x-xs">
                        <span class="text-slate-500 font-mono text-caption q-mr-xs" style="font-size: 9px;">PAN:</span>
                        <q-btn flat dense icon="arrow_back" size="xs" color="cyan-3" label="Left" no-caps class="text-weight-bold" @click="scrollCanvas(-300)" />
                        <q-btn flat dense icon-right="arrow_forward" size="xs" color="cyan-3" label="Right" no-caps class="text-weight-bold" @click="scrollCanvas(300)" />
                        
                        <q-separator vertical dark class="q-mx-xs" />

                        <q-btn flat dense icon="arrow_upward" size="xs" color="amber-4" label="Up" no-caps class="text-weight-bold" @click="scrollCanvasY(-200)" />
                        <q-btn flat dense icon-right="arrow_downward" size="xs" color="amber-4" label="Down" no-caps class="text-weight-bold" @click="scrollCanvasY(200)" />

                        <q-separator vertical dark class="q-mx-xs" />
                        <q-btn flat round dense icon="refresh" size="xs" color="slate-400" @click="fetchPipelineGraph" />
                    </div>
                </div>

                <!-- 2-AXIS DUAL SCROLLABLE VIEWPORT -->
                <div 
                    ref="canvasScrollArea" 
                    class="col full-width agi-dag-viewport relative-position" 
                    style="flex: 1 1 0%; min-height: 0; height: calc(100% - 40px); overflow: auto !important; scroll-behavior: smooth;"
                    @scroll="computeOrthogonalEdges"
                >
                    <div class="relative-position q-pa-md" style="min-width: max-content; width: max-content; min-height: 100%;">
                        
                        <!-- OVERLAY SVG LAYER FOR ORTHOGONAL 90° LEADER LINES -->
                        <svg 
                            class="absolute-top-left pointer-events-none leader-line-svg"
                            :style="{ width: svgDimensions.width + 'px', height: svgDimensions.height + 'px', zIndex: 10 }"
                        >
                            <defs>
                                <marker id="dag-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#0284c7" />
                                </marker>
                                <marker id="dag-arrow-selected" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
                                </marker>
                            </defs>
                            <path 
                                v-for="edge in edgePaths" 
                                :key="edge.edgeId" 
                                :d="edge.d" 
                                class="leader-line-path"
                                :class="{ 'leader-line-selected': edge.isSelected }"
                                :marker-end="edge.isSelected ? 'url(#dag-arrow-selected)' : 'url(#dag-arrow)'"
                            />
                        </svg>

                        <div v-if="loading" class="q-pa-xl row flex-center">
                            <q-spinner-dots color="cyan-4" size="2em" />
                            <span class="q-ml-sm text-caption text-slate-400">Loading Pipeline Graph...</span>
                        </div>

                        <div v-else-if="dagLayout.columns.length === 0" class="q-pa-xl text-slate-500 italic text-caption">
                            No compute stages in this pipeline.
                        </div>

                        <!-- THE HORIZONTAL COLUMN STACK -->
                        <div v-else class="row no-wrap items-start q-gutter-x-xl">
                            
                            <div 
                                v-for="(col, colIndex) in dagLayout.columns" 
                                :key="colIndex"
                                class="column q-gutter-y-lg items-center relative-position"
                                style="min-width: 290px; max-width: 320px;"
                            >
                                <div class="text-overline text-slate-400 font-mono text-center q-mb-xs" style="font-size: 11px; line-height: 1; letter-spacing: 1px;">
                                    STEP {{ colIndex + 1 }}
                                </div>

                                <div 
                                    v-for="node in col" 
                                    :key="node.stageId"
                                    class="column full-width relative-position"
                                >
                                    <!-- STAGE PROCESS CARD WITH INTEGRATED IN/OUT PORTS -->
                                    <div 
                                        :id="'stage-card-' + node.stageId"
                                        class="rounded-borders cursor-pointer transition-all shadow-4 relative-position overflow-hidden"
                                        :class="String(selectedStageId) === String(node.stageId) ? 'border-active-node' : 'border-dim-node'"
                                        :style="{
                                            backgroundColor: '#0f172a',
                                            zIndex: 25,
                                            pointerEvents: 'auto',
                                            border: String(selectedStageId) === String(node.stageId) 
                                                ? '2px solid ' + getBadgeStyle(node.actionType).border 
                                                : '1px solid #334155',
                                            boxShadow: String(selectedStageId) === String(node.stageId) 
                                                ? '0 0 14px rgba(56, 189, 248, 0.45)' 
                                                : '0 2px 6px rgba(0,0,0,0.5)'
                                        }"
                                        @click="selectStage(node)"
                                    >
                                        <!-- INGRESS PORT (UPSTREAM LINK INDICATOR) -->
                                        <div 
                                            class="row items-center justify-between q-px-xs font-mono pointer-events-none" 
                                            style="background-color: #020617; border-bottom: 1px solid #1e293b; height: 18px; min-height: 18px; font-size: 9px;"
                                        >
                                            <div class="row items-center q-gutter-x-xs text-slate-500">
                                                <q-icon name="login" size="10px" color="cyan-4" />
                                                <span>{{ node.parentStageId ? 'IN: #' + node.parentStageId : 'ROOT PIPELINE INGRESS' }}</span>
                                            </div>
                                            <span v-if="node.depth > 0" class="text-cyan-4 font-bold">DEPTH {{ node.depth }}</span>
                                        </div>

                                        <!-- SOLID ACTION BADGE BAR -->
                                        <div 
                                            :id="'stage-badge-' + node.stageId"
                                            class="row items-center justify-between q-px-sm q-py-xs font-mono text-weight-bolder"
                                            :style="{
                                                backgroundColor: getBadgeStyle(node.actionType).bg + ' !important',
                                                color: getBadgeStyle(node.actionType).fg + ' !important',
                                                height: '24px',
                                                minHeight: '24px'
                                            }"
                                        >
                                            <div class="row items-center q-gutter-x-xs no-wrap ellipsis pointer-events-none" :style="{ color: getBadgeStyle(node.actionType).fg + ' !important' }">
                                                <q-icon :name="getBadgeStyle(node.actionType).icon" size="13px" :style="{ color: getBadgeStyle(node.actionType).fg + ' !important' }" />
                                                <span class="text-caption text-weight-bolder" :style="{ color: getBadgeStyle(node.actionType).fg + ' !important', fontSize: '10px' }">
                                                    {{ node.actionType.toUpperCase() }} #{{ node.stageId }}
                                                </span>
                                            </div>
                                            <span 
                                                class="q-px-xs rounded-borders text-caption text-weight-bolder pointer-events-none" 
                                                :style="{
                                                    backgroundColor: 'rgba(0,0,0,0.25)',
                                                    color: getBadgeStyle(node.actionType).fg + ' !important',
                                                    fontSize: '9px',
                                                    letterSpacing: '0.5px'
                                                }"
                                            >
                                                {{ node.role === 'assistant' ? 'AI' : 'USER' }}
                                            </span>
                                        </div>

                                        <!-- CARD BODY & TITLE -->
                                        <div class="q-pa-xs pointer-events-none" style="background-color: #0b1329;">
                                            <div 
                                                class="text-caption text-weight-bold ellipsis-2-lines q-px-xs q-py-xs" 
                                                :style="{ 
                                                    color: getBadgeStyle(node.actionType).titleColor + ' !important',
                                                    fontSize: '11px', 
                                                    lineHeight: '1.35' 
                                                }"
                                            >
                                                {{ node.label }}
                                            </div>

                                            <div v-if="node.targetArtifactUri" class="q-px-xs q-pb-xs font-mono text-caption ellipsis text-cyan-3" style="font-size: 9px;">
                                                <q-icon name="link" size="10px" color="cyan-3" class="q-mr-xs" />
                                                {{ node.targetArtifactUri.split('/').pop() }}
                                            </div>
                                        </div>

                                        <!-- EGRESS PORT (DOWNSTREAM CONTRACT EMISSION) -->
                                        <div 
                                            class="row items-center justify-between q-px-xs font-mono pointer-events-none" 
                                            style="background-color: #020617; border-top: 1px solid #1e293b; height: 18px; min-height: 18px; font-size: 9px;"
                                        >
                                            <span class="text-slate-500">
                                                {{ node.children && node.children.length > 0 ? node.children.length + ' DOWNSTREAM TRANSITIONS' : 'PIPELINE HEAD' }}
                                            </span>
                                            <q-icon name="logout" size="10px" color="amber-4" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 3. BOTTOM GUTTER STRIP -->
                <div class="row items-center justify-between q-px-xs bg-slate-950 font-mono text-slate-500" style="height: 8px; min-height: 8px; max-height: 8px; flex: 0 0 8px; border-top: 1px solid #1e293b;">
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