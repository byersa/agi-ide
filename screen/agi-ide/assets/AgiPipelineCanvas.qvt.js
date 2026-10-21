(function () {
    const AgiPipelineCanvas = {
        name: 'AgiPipelineCanvas',
        emits: ['stage-selected', 'open-artifact'],
        props: {
            discussionId: { type: String, default: '' },
            targetComponent: { type: String, default: 'nursinghome' },
            selectedStageId: { type: String, default: '' },
            selectedPort: { type: String, default: 'OUT' }
        },
        data() {
            return {
                rawNodes: [],
                rawEdges: [],
                loading: false,
                edgePaths: [],
                svgDimensions: { width: 800, height: 400 },
                activePortSelection: this.selectedPort || 'OUT',
                collapsedNodeIds: [],
                zoomScale: 1.0,
                // Layout geometry constants
                slotRowHeight: 125, // vertical pitch per leaf row unit
                columnWidth: 320,   // horizontal pitch per column step
                cardHeight: 90
            };
        },
        computed: {
            dagLayout() {
                if (!this.rawNodes || this.rawNodes.length === 0) {
                    return { columns: [], nodeMap: {}, totalRows: 0 };
                }

                const nodeMap = {};
                this.rawNodes.forEach(n => {
                    const sId = String(n.pipelineStepId || n.stageId);
                    nodeMap[sId] = Object.assign({}, n, {
                        stepId: sId,
                        depth: 0,
                        slotRow: 0,
                        weight: 1,
                        parents: [],
                        children: [],
                        isVisible: true
                    });
                });

                // Establish bidirectional parent-child links
                this.rawEdges.forEach(e => {
                    const parent = nodeMap[String(e.from)];
                    const child = nodeMap[String(e.to)];
                    if (parent && child) {
                        parent.children.push(child);
                        child.parents.push(parent);
                    }
                });

                // Identify roots (nodes without incoming parents)
                const rootNodes = Object.values(nodeMap).filter(n => n.parents.length === 0);

                // 1. Recursive visibility filter (hide transitive children of collapsed nodes)
                const markVisibility = (node, isParentVisible) => {
                    node.isVisible = isParentVisible;
                    const isCollapsed = this.collapsedNodeIds.includes(node.stepId);
                    node.children.forEach(ch => {
                        markVisibility(ch, isParentVisible && !isCollapsed);
                    });
                };
                rootNodes.forEach(r => markVisibility(r, true));

                // 2. Compute subtree slot weights (for lane spacing)
                const computeWeight = (node) => {
                    if (!node.isVisible) {
                        node.weight = 0;
                        return 0;
                    }
                    const isCollapsed = this.collapsedNodeIds.includes(node.stepId);
                    const visibleChildren = node.children.filter(c => c.isVisible);

                    if (isCollapsed || visibleChildren.length === 0) {
                        node.weight = 1;
                        return 1;
                    }

                    let sumWeight = 0;
                    visibleChildren.forEach(ch => {
                        sumWeight += computeWeight(ch);
                    });
                    node.weight = Math.max(1, sumWeight);
                    return node.weight;
                };

                let totalRows = 0;
                rootNodes.forEach(r => {
                    totalRows += computeWeight(r);
                });

                // 3. Assign depths and swimlane row slots (centering parents)
                const assignLanes = (node, depth, startRow) => {
                    if (!node.isVisible) return;

                    node.depth = depth;
                    const visibleChildren = node.children.filter(c => c.isVisible);
                    const isCollapsed = this.collapsedNodeIds.includes(node.stepId);

                    if (isCollapsed || visibleChildren.length === 0) {
                        node.slotRow = startRow;
                    } else {
                        // Parent centers within its children's collective swimlane
                        let childRowAccumulator = startRow;
                        let firstChildRow = 0;
                        let lastChildRow = 0;

                        visibleChildren.forEach((ch, idx) => {
                            assignLanes(ch, depth + 1, childRowAccumulator);
                            if (idx === 0) firstChildRow = ch.slotRow;
                            if (idx === visibleChildren.length - 1) lastChildRow = ch.slotRow;
                            childRowAccumulator += ch.weight;
                        });

                        node.slotRow = (firstChildRow + lastChildRow) / 2;
                    }
                };

                let rowCursor = 0;
                rootNodes.forEach(r => {
                    assignLanes(r, 0, rowCursor);
                    rowCursor += r.weight;
                });

                // Group visible nodes by column depth
                const depthColumns = [];
                Object.values(nodeMap).forEach(n => {
                    if (n.isVisible) {
                        if (!depthColumns[n.depth]) depthColumns[n.depth] = [];
                        depthColumns[n.depth].push(n);
                    }
                });

                return {
                    columns: depthColumns.filter(Boolean),
                    nodeMap,
                    totalRows: Math.max(1, totalRows)
                };
            },

            // Dynamic bounding size to eliminate residual whitespace
            canvasContentWidth() {
                const colCount = this.dagLayout.columns ? this.dagLayout.columns.length : 0;
                return Math.max(colCount * this.columnWidth + 80, 600);
            },
            canvasContentHeight() {
                const totalRows = this.dagLayout.totalRows || 1;
                return Math.max(totalRows * this.slotRowHeight + 70, 320);
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
                        this.collapsedNodeIds = [];
                    }
                }
            },
            selectedPort(newPort) {
                if (newPort) this.activePortSelection = newPort;
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

                    window.__agiCurrentPipelineGraph = {
                        discussionId: this.discussionId,
                        nodes: this.rawNodes,
                        edges: this.rawEdges
                    };

                    if (!window.__agiPipelinePayloadMap) window.__agiPipelinePayloadMap = {};
                    this.rawNodes.forEach(n => {
                        const sId = String(n.id || n.stepId || n.pipelineStepId || n.stageId || '');
                        const egressId = n.egressPayloadId || n.stagedPayloadId;
                        const ingressId = n.ingressPayloadId;
                        if (sId && egressId) {
                            window.__agiPipelinePayloadMap[sId] = String(egressId);
                        }
                        if (sId && ingressId) {
                            window.__agiPipelinePayloadMap[sId + '_in'] = String(ingressId);
                        }
                    });

                    if (!this.selectedStageId && this.rawNodes.length > 0) {
                        const lastNode = this.rawNodes[this.rawNodes.length - 1];
                        this.selectStage(lastNode, lastNode.egressPayloadId ? 'OUT' : 'IN');
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
                const scale = this.zoomScale || 1.0;

                // Sync SVG bounds tightly to content dimensions
                this.svgDimensions = {
                    width: Math.max(this.canvasContentWidth, container.clientWidth / scale),
                    height: Math.max(this.canvasContentHeight, container.clientHeight / scale)
                };

                const computed = [];

                this.rawEdges.forEach(edge => {
                    const parentNode = this.dagLayout.nodeMap[String(edge.from)];
                    const childNode = this.dagLayout.nodeMap[String(edge.to)];

                    // Skip edges pointing to or originating from hidden nodes
                    if (!parentNode || !childNode || !parentNode.isVisible || !childNode.isVisible) {
                        return;
                    }

                    const sourceEl = document.getElementById('port-out-' + edge.from) || document.getElementById('stage-badge-' + edge.from);
                    const targetEl = document.getElementById('port-in-' + edge.to) || document.getElementById('stage-badge-' + edge.to);

                    if (!sourceEl || !targetEl) return;

                    const sRect = sourceEl.getBoundingClientRect();
                    const tRect = targetEl.getBoundingClientRect();

                    const x1 = ((sRect.right - containerRect.left) + scrollLeft) / scale;
                    const y1 = ((sRect.top + (sRect.height / 2) - containerRect.top) + scrollTop) / scale;

                    const x2 = ((tRect.left - containerRect.left) + scrollLeft) / scale;
                    const y2 = ((tRect.top + (tRect.height / 2) - containerRect.top) + scrollTop) / scale;

                    const turnX = x1 + 28;
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

            // 🎯 Precise 2-Axis Viewport Centering on Targeted Node
            centerOnStage(stepId, smooth = true) {
                this.$nextTick(() => {
                    setTimeout(() => {
                        const targetId = String(stepId);
                        const cardEl = document.getElementById('stage-card-' + targetId);
                        const container = this.$refs.canvasScrollArea;
                        if (!cardEl || !container) return;

                        const bRect = cardEl.getBoundingClientRect();
                        const cRect = container.getBoundingClientRect();

                        const offsetX = (bRect.left - cRect.left) - (cRect.width / 2) + (bRect.width / 2);
                        const offsetY = (bRect.top - cRect.top) - (cRect.height / 2) + (bRect.height / 2);

                        container.scrollBy({
                            left: offsetX,
                            top: offsetY,
                            behavior: smooth ? 'smooth' : 'auto'
                        });
                    }, 60);
                });
            },

            toggleCollapse(node, event) {
                if (event) event.stopPropagation();
                const sId = String(node.stepId);
                const idx = this.collapsedNodeIds.indexOf(sId);
                if (idx !== -1) {
                    this.collapsedNodeIds.splice(idx, 1);
                } else {
                    this.collapsedNodeIds.push(sId);
                }

                // Select and center node immediately in its compacted lane
                this.selectStage(node);
                this.centerOnStage(node.stepId, true);
                this.scheduleRecalcEdges();
            },

            collapseAllBranches() {
                const branchIds = [];
                Object.values(this.dagLayout.nodeMap).forEach(n => {
                    if (n.children && n.children.length > 0) {
                        branchIds.push(n.stepId);
                    }
                });
                this.collapsedNodeIds = branchIds;
                if (this.selectedStageId) {
                    this.centerOnStage(this.selectedStageId, true);
                }
                this.scheduleRecalcEdges();
            },

            expandAllBranches() {
                this.collapsedNodeIds = [];
                if (this.selectedStageId) {
                    this.centerOnStage(this.selectedStageId, true);
                }
                this.scheduleRecalcEdges();
            },

            setZoom(scale) {
                this.zoomScale = scale;
                if (this.selectedStageId) {
                    this.centerOnStage(this.selectedStageId, false);
                }
                this.scheduleRecalcEdges();
            },

            getTransitiveChildCount(node) {
                let count = 0;
                const countFn = (curr) => {
                    curr.children.forEach(c => {
                        count++;
                        countFn(c);
                    });
                };
                countFn(node);
                return count;
            },

            selectStage(node, port = null) {
                if (!node) return;

                const targetStepId = String(node.pipelineStepId || node.stageId);
                const nodeMap = this.dagLayout.nodeMap || {};
                const mappedNode = nodeMap[targetStepId] || node;

                if (port) {
                    this.activePortSelection = port;
                } else if (!this.activePortSelection) {
                    this.activePortSelection = mappedNode.egressPayloadId ? 'OUT' : 'IN';
                }

                let parentNode = null;
                if (mappedNode.parents && mappedNode.parents.length > 0) {
                    parentNode = mappedNode.parents[0];
                } else if ((mappedNode.parentStepId || mappedNode.parentStageId) && nodeMap[String(mappedNode.parentStepId || mappedNode.parentStageId)]) {
                    parentNode = nodeMap[String(mappedNode.parentStepId || mappedNode.parentStageId)];
                }

                if (!window.__agiPipelinePayloadMap) window.__agiPipelinePayloadMap = {};
                if (targetStepId && (mappedNode.egressPayloadId || mappedNode.stagedPayloadId)) {
                    window.__agiPipelinePayloadMap[targetStepId] = String(mappedNode.egressPayloadId || mappedNode.stagedPayloadId);
                }
                if (parentNode) {
                    const pStepId = String(parentNode.stepId || parentNode.pipelineStepId || parentNode.stageId);
                    const pEgressId = parentNode.egressPayloadId || parentNode.stagedPayloadId;
                    if (pStepId && pEgressId) {
                        window.__agiPipelinePayloadMap[pStepId] = String(pEgressId);
                    }
                }

                const enrichedPayload = {
                    stage: Object.assign({}, mappedNode, {
                        stepId: targetStepId,
                        stageId: targetStepId,
                        parentStepId: parentNode ? String(parentNode.stepId || parentNode.pipelineStepId || parentNode.stageId) : (mappedNode.parentStepId || null),
                        parentEgressPayloadId: parentNode?.egressPayloadId || (parentNode ? window.__agiPipelinePayloadMap[String(parentNode.stepId || parentNode.pipelineStepId)] : null),
                        stepNumber: mappedNode.stepSequenceNum || (mappedNode.depth || 0) + 1,
                        totalSteps: this.dagLayout.columns.length,
                        activePort: this.activePortSelection
                    }),
                    parentStage: parentNode ? Object.assign({}, parentNode) : null,
                    selectedPort: this.activePortSelection
                };

                this.$emit('stage-selected', enrichedPayload);

                if (this.activePortSelection === 'OUT') {
                    const targetUri = mappedNode.targetArtifactUri
                        || mappedNode.createdArtifactUri
                        || mappedNode.egressPayload?.targetArtifactUri
                        || '';

                    if (targetUri || mappedNode.egressPayloadId) {
                        this.$emit('open-artifact', {
                            artifactUri: targetUri,
                            stepId: targetStepId,
                            egressPayloadId: mappedNode.egressPayloadId,
                            autoFocusEditor: true
                        });
                    }
                }

                this.centerOnStage(targetStepId, true);
                this.scheduleRecalcEdges();
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
            },

            async branchFromCanvas(node, targetStance) {
                if (!node) return;
                const stepId = String(node.pipelineStepId || node.stageId || node.stepId);
                const stanceEnumId = targetStance === 'build' ? 'AamBuild' : (targetStance === 'plan' ? 'AamPlan' : 'AamDiscuss');

                try {
                    const resp = await axios.post('/rest/s1/agi-ai/pipeline/step/fork', {
                        sourceStepId: stepId,
                        targetStanceEnumId: stanceEnumId,
                        ingressPayloadId: node.egressPayloadId || null,
                        directivePrompt: `Continue with ${targetStance.toUpperCase()} following Step #${stepId}.`
                    }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                    const newStepId = resp.data?.newStepId;
                    this.$q?.notify({
                        type: 'positive',
                        message: `Child ${targetStance.toUpperCase()} Step #${newStepId} spawned.`,
                        icon: 'account_tree'
                    });

                    await this.fetchPipelineGraph();

                    const newNode = this.rawNodes.find(n => String(n.pipelineStepId || n.stepId) === String(newStepId));
                    if (newNode) {
                        this.selectStage(newNode, 'IN');
                    }
                } catch (e) {
                    this.$q?.notify({
                        type: 'negative',
                        message: 'Branch failed: ' + (e.response?.data?.errors || e.message)
                    });
                }
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

                    .port-btn {
                        transition: all 0.15s ease-in-out;
                    }
                    .port-btn:hover {
                        filter: brightness(1.25);
                    }
                    
                    .collapse-toggle-btn {
                        background: rgba(0, 0, 0, 0.4);
                        border: 1px solid rgba(255, 255, 255, 0.25);
                        cursor: pointer;
                        border-radius: 3px;
                        padding: 1px 4px;
                        font-size: 9px;
                        color: #ffffff;
                    }
                    .collapse-toggle-btn:hover {
                        background: rgba(255, 255, 255, 0.2);
                    }

                    .stage-card-positioner {
                        transition: top 0.25s cubic-bezier(0.4, 0, 0.2, 1), left 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                </component>

                <!-- TOP CONTROLS & BREADCRUMB STRIP (FIXED 32px) -->
                <div class="row items-center justify-between q-px-sm bg-black" style="border-bottom: 1px solid #1e293b; height: 32px; min-height: 32px; max-height: 32px; flex: 0 0 32px; z-index: 30;">
                    <div class="row items-center q-gutter-x-xs">
                        <q-icon name="account_tree" color="cyan-4" size="16px" />
                        <span class="text-caption text-weight-bold text-cyan-2" style="font-size: 11px;">PIPELINE DAG</span>
                        <span class="text-caption text-slate-500 q-ml-xs" style="font-size: 10px;">
                            ({{ dagLayout.columns.length }} steps • {{ rawNodes.length }} stages • {{ dagLayout.totalRows }} lanes)
                        </span>

                        <q-separator vertical dark class="q-mx-xs" />

                        <!-- Zoom Controls -->
                        <span class="text-slate-500 text-caption" style="font-size: 9px;">ZOOM:</span>
                        <q-btn flat dense size="xs" :color="zoomScale === 1.0 ? 'amber-4' : 'slate-400'" label="100%" @click="setZoom(1.0)" />
                        <q-btn flat dense size="xs" :color="zoomScale === 0.8 ? 'amber-4' : 'slate-400'" label="80%" @click="setZoom(0.8)" />
                        <q-btn flat dense size="xs" :color="zoomScale === 0.6 ? 'amber-4' : 'slate-400'" label="60%" @click="setZoom(0.6)" />

                        <q-separator vertical dark class="q-mx-xs" />

                        <!-- Global Branch Toggles -->
                        <q-btn flat dense size="xs" color="cyan-3" icon="unfold_less" label="Fold All" no-caps @click="collapseAllBranches">
                            <q-tooltip>Collapse all branching subtrees</q-tooltip>
                        </q-btn>
                        <q-btn flat dense size="xs" color="cyan-3" icon="unfold_more" label="Expand All" no-caps @click="expandAllBranches">
                            <q-tooltip>Expand all branches to full visibility</q-tooltip>
                        </q-btn>
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
                    style="flex: 1 1 0%; min-height: 0; height: calc(100% - 32px); overflow: auto !important; scroll-behavior: smooth;"
                    @scroll="computeOrthogonalEdges"
                >
                    <div 
                        class="relative-position q-pa-md transition-all" 
                        :style="{
                            transform: 'scale(' + zoomScale + ')',
                            transformOrigin: 'top left',
                            width: canvasContentWidth + 'px',
                            height: canvasContentHeight + 'px',
                            minWidth: canvasContentWidth + 'px',
                            minHeight: canvasContentHeight + 'px'
                        }"
                    >
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

                        <div v-else-if="dagLayout.columns.length === 0" class="q-pa-xl column flex-center font-mono">
                            <q-icon name="hub" size="36px" color="cyan-4" class="q-mb-sm" />
                            <div class="text-slate-300 text-caption text-weight-bold q-mb-xs">No compute stages in this pipeline.</div>
                            <div class="text-slate-500 text-caption q-mb-md">Initialize the root compute stage to start the DAG.</div>
                            <q-btn 
                                color="primary" 
                                text-color="white" 
                                icon="bolt" 
                                label="Initialize Step 1" 
                                dense no-caps 
                                class="text-weight-bold q-px-sm"
                                @click="$emit('stage-selected', { stage: null, selectedPort: 'IN' })" 
                            />
                        </div>

                        <!-- ABSOLUTE SWIMLANE CANVAS PLACEMENT -->
                        <div v-else class="relative-position fit">
                            <!-- Column Header Labels -->
                            <div 
                                v-for="(col, colIndex) in dagLayout.columns" 
                                :key="'col-header-' + colIndex"
                                class="absolute-top text-overline text-slate-400 font-mono text-center"
                                :style="{
                                    left: (colIndex * columnWidth) + 'px',
                                    width: (columnWidth - 40) + 'px',
                                    top: '0px',
                                    height: '24px',
                                    fontSize: '11px',
                                    letterSpacing: '1px'
                                }"
                            >
                                STEP {{ colIndex + 1 }}
                            </div>

                            <!-- Geometric Placement of Each Node in its Isolated Swimlane -->
                            <div 
                                v-for="col in dagLayout.columns" 
                                :key="'col-' + col[0].depth"
                            >
                                <div 
                                    v-for="node in col" 
                                    :key="node.stepId"
                                    class="absolute stage-card-positioner"
                                    :style="{
                                        left: (node.depth * columnWidth) + 'px',
                                        top: (node.slotRow * slotRowHeight + 30) + 'px',
                                        width: (columnWidth - 40) + 'px',
                                        height: cardHeight + 'px',
                                        zIndex: 25
                                    }"
                                >
                                    <!-- FIRST-CLASS PROCESS STEP CARD -->
                                    <div 
                                        :id="'stage-card-' + node.stepId"
                                        class="rounded-borders transition-all shadow-4 relative-position overflow-hidden"
                                        :style="{
                                            backgroundColor: '#0f172a',
                                            border: String(selectedStageId) === String(node.stepId) 
                                                ? '2px solid ' + getBadgeStyle(node.actionType).border 
                                                : (node.statusId === 'PlsDraft' ? '1px dashed #d97706' : '1px solid #334155'),
                                            boxShadow: String(selectedStageId) === String(node.stepId) 
                                                ? '0 0 14px rgba(56, 189, 248, 0.45)' 
                                                : '0 2px 6px rgba(0,0,0,0.5)'
                                        }"
                                    >
                                        <!-- CARD TOP HEADER & ACTION STANCE -->
                                        <div 
                                            :id="'stage-badge-' + node.stepId"
                                            class="row items-center justify-between q-px-sm q-py-xs font-mono text-weight-bolder cursor-pointer"
                                            :style="{
                                                backgroundColor: getBadgeStyle(node.actionType).bg + ' !important',
                                                color: getBadgeStyle(node.actionType).fg + ' !important',
                                                height: '24px',
                                                minHeight: '24px'
                                            }"
                                            @click="selectStage(node)"
                                        >
                                            <div class="row items-center q-gutter-x-xs no-wrap ellipsis">
                                                <q-icon :name="getBadgeStyle(node.actionType).icon" size="13px" />
                                                <span class="text-caption text-weight-bolder" style="font-size: 10px;">
                                                    {{ node.actionType.toUpperCase() }} #{{ node.stepId }}
                                                </span>

                                                <!-- Collapsible Subtree Toggle Button -->
                                                <button 
                                                    v-if="node.children && node.children.length > 0"
                                                    type="button"
                                                    class="collapse-toggle-btn row items-center justify-center q-ml-xs"
                                                    :title="collapsedNodeIds.includes(node.stepId) ? 'Expand subtree' : 'Collapse subtree'"
                                                    @click="toggleCollapse(node, $event)"
                                                >
                                                    {{ collapsedNodeIds.includes(node.stepId) ? '+' : '–' }}
                                                </button>
                                            </div>

                                            <div class="row items-center q-gutter-x-xs">
                                                <!-- Collapsed indicator badge -->
                                                <span 
                                                    v-if="collapsedNodeIds.includes(node.stepId)" 
                                                    class="q-px-xs rounded font-mono text-weight-bold" 
                                                    style="background-color: #0369a1; color: #e0f2fe; font-size: 8px;"
                                                >
                                                    +{{ getTransitiveChildCount(node) }} hidden
                                                </span>
                                                <span 
                                                    v-if="node.statusId === 'PlsDraft'" 
                                                    class="q-px-xs rounded font-mono text-weight-bold" 
                                                    style="background-color: #78350f; color: #fef3c7; font-size: 8px;"
                                                >
                                                    DRAFT
                                                </span>
                                                <span 
                                                    v-else-if="node.statusId === 'PlsExecuting'" 
                                                    class="q-px-xs rounded font-mono text-weight-bold" 
                                                    style="background-color: #0369a1; color: #e0f2fe; font-size: 8px;"
                                                >
                                                    RUNNING
                                                </span>
                                                <span 
                                                    class="q-px-xs rounded-borders text-caption text-weight-bolder" 
                                                    style="background-color: rgba(0,0,0,0.25); font-size: 9px;"
                                                >
                                                    STEP {{ node.stepSequenceNum || (node.depth + 1) }}
                                                </span>
                                            </div>
                                        </div>

                                        <!-- CARD BODY & TITLE -->
                                        <div class="q-pa-xs cursor-pointer" style="background-color: #0b1329;" @click="selectStage(node)">
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

                                        <!-- DUAL INTERACTIVE PORT TOOLBAR: [IN] & [OUT] -->
                                        <div 
                                            class="row items-center justify-between q-px-xs font-mono" 
                                            style="background-color: #020617; border-top: 1px solid #1e293b; height: 26px; min-height: 26px;"
                                        >
                                            <!-- LEFT: [IN] INGRESS PORT BUTTON -->
                                            <button
                                                :id="'port-in-' + node.stepId"
                                                type="button"
                                                class="port-btn row items-center q-px-xs rounded cursor-pointer"
                                                :style="{
                                                    backgroundColor: (String(selectedStageId) === String(node.stepId) && activePortSelection === 'IN') ? '#0284c7' : '#0f172a',
                                                    border: (String(selectedStageId) === String(node.stepId) && activePortSelection === 'IN') ? '1px solid #38bdf8' : '1px solid #334155',
                                                    color: (String(selectedStageId) === String(node.stepId) && activePortSelection === 'IN') ? '#ffffff' : '#94a3b8',
                                                    fontSize: '9px',
                                                    lineHeight: '16px',
                                                    height: '18px'
                                                }"
                                                @click.stop="selectStage(node, 'IN')"
                                            >
                                                <q-icon name="login" size="10px" class="q-mr-xs" color="cyan-4" />
                                                <span class="text-weight-bold">IN</span>
                                                <span v-if="node.ingressPayloadId" class="q-ml-xs text-cyan-3" style="font-size: 8px;">
                                                    #{{ node.ingressPayloadId }}
                                                </span>
                                            </button>

                                            <span class="text-slate-600 font-mono" style="font-size: 8px;">──►</span>

                                            <!-- RIGHT: [OUT] EGRESS PORT BUTTON WITH BRANCHING POPUP -->
                                            <button
                                                :id="'port-out-' + node.stepId"
                                                type="button"
                                                class="port-btn row items-center q-px-xs rounded cursor-pointer relative-position"
                                                :style="{
                                                    backgroundColor: (String(selectedStageId) === String(node.stepId) && activePortSelection === 'OUT') ? '#0284c7' : '#0f172a',
                                                    border: (String(selectedStageId) === String(node.stepId) && activePortSelection === 'OUT') ? '1px solid #38bdf8' : '1px solid #334155',
                                                    color: (String(selectedStageId) === String(node.stepId) && activePortSelection === 'OUT') ? '#ffffff' : '#94a3b8',
                                                    fontSize: '9px',
                                                    lineHeight: '16px',
                                                    height: '18px'
                                                }"
                                                @click.stop="selectStage(node, 'OUT')"
                                            >
                                                <span class="text-weight-bold">OUT</span>
                                                <span v-if="node.egressPayloadId" class="q-ml-xs text-amber-3" style="font-size: 8px;">
                                                    #{{ node.egressPayloadId }}
                                                </span>
                                                <span v-else class="q-ml-xs text-slate-500" style="font-size: 8px;">
                                                    [DRAFT]
                                                </span>
                                                <q-icon name="logout" size="11px" class="q-ml-xs" color="amber-4" />

                                                <q-menu v-if="node.egressPayloadId" context-menu dark class="bg-slate-950 font-mono text-white" style="border: 1px solid #0284c7; min-width: 170px;">
                                                    <q-list dense style="font-size: 11px;">
                                                        <q-item-label header class="text-cyan-3 font-bold text-caption" style="font-size: 10px; padding: 4px 8px;">
                                                            BRANCH FROM STEP #{{ node.stepId }}
                                                        </q-item-label>
                                                        <q-separator dark class="q-mb-xs" />
                                                        
                                                        <q-item clickable v-close-popup @click="branchFromCanvas(node, 'discuss')">
                                                            <q-item-section avatar style="min-width: 22px;">
                                                                <q-icon name="chat" size="13px" color="cyan-3" />
                                                            </q-item-section>
                                                            <q-item-section>+ Child DISCUSS</q-item-section>
                                                        </q-item>

                                                        <q-item clickable v-close-popup @click="branchFromCanvas(node, 'plan')">
                                                            <q-item-section avatar style="min-width: 22px;">
                                                                <q-icon name="architecture" size="13px" color="purple-3" />
                                                            </q-item-section>
                                                            <q-item-section>+ Child PLAN</q-item-section>
                                                        </q-item>

                                                        <q-item clickable v-close-popup @click="branchFromCanvas(node, 'build')">
                                                            <q-item-section avatar style="min-width: 22px;">
                                                                <q-icon name="handyman" size="13px" color="amber-3" />
                                                            </q-item-section>
                                                            <q-item-section>+ Child BUILD</q-item-section>
                                                        </q-item>
                                                    </q-list>
                                                </q-menu>
                                            </button>
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