(function () {
    const AgiStudio = {
        name: 'AgiStudio',
        emits: ['close'],
        props: {
            activeArtifact: { type: String, default: '' },
            targetComponentProp: { type: String, default: '' }
        },
        data() {
            return {
                targetComponent: this.targetComponentProp || 'nursinghome',
                activeArtifactLocation: this.activeArtifact || '',
                activeDiscussionId: '',
                selectedStage: null,
                selectedEdge: null,

                // Real-time Resizable Splitter Model (Default 35% DAG / 65% Inspector)
                splitterModel: 240,

                // Viewport Dock State
                activePanel: null,
                stagedXmlSource: '',
                stagedLayoutTree: null,

                viewports: [
                    { name: 'AgiCanvasEditor', label: 'Canvas', icon: 'preview', color: 'cyan-4' },
                    { name: 'AgiScreenEditor', label: 'Screen XML', icon: 'code', color: 'amber-4' },
                    { name: 'AgiServiceEditor', label: 'Service', icon: 'miscellaneous_services', color: 'purple-3' },
                    { name: 'AgiEntityEditor', label: 'Entity', icon: 'storage', color: 'teal-4' }
                ]
            };
        },
        computed: {
            currentArtifactLabel() {
                if (!this.activeArtifactLocation) return 'No Artifact Anchor';
                const parts = this.activeArtifactLocation.split('/');
                return parts[parts.length - 1];
            }
        },
        mounted() {
            const vm = this;
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = (event) => {
                if (!event.data) return;
                if (event.data.event === 'open-screen-artifact' && event.data.artifactUri) {
                    vm.activeArtifactLocation = event.data.artifactUri;
                }
                if (event.data.targetComponent) {
                    vm.targetComponent = event.data.targetComponent;
                }
            };
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },
        methods: {
            setDagHeight(preset) {
                const splitterEl = this.$el?.querySelector('.q-splitter');
                const totalH = splitterEl ? splitterEl.offsetHeight : 700;

                if (preset === 25 || preset === 'compact') {
                    this.splitterModel = Math.max(180, Math.round(totalH * 0.25));
                } else if (preset === 35 || preset === 'balanced') {
                    this.splitterModel = Math.max(240, Math.round(totalH * 0.35));
                } else if (preset === 55 || preset === 'expanded') {
                    this.splitterModel = Math.max(380, Math.round(totalH * 0.55));
                }

                this.$nextTick(() => {
                    if (this.$refs.canvasRef && this.$refs.canvasRef.scheduleRecalcEdges) {
                        this.$refs.canvasRef.scheduleRecalcEdges();
                    }
                });
            },
            onSplitterResize(val) {
                if (typeof val === 'number') {
                    this.splitterModel = val;
                }
            },
            onSplitterPan(phase) {
                if (phase && phase.isFinal) {
                    this.$nextTick(() => {
                        if (this.$refs.canvasRef && this.$refs.canvasRef.scheduleRecalcEdges) {
                            this.$refs.canvasRef.scheduleRecalcEdges();
                        }
                    });
                }
            },
            onPipelineSelected(item) {
                this.activeDiscussionId = String(item.discussionId);
                this.selectedStage = null;
                this.selectedEdge = null;
                if (item.targetArtifactUri) {
                    this.activeArtifactLocation = item.targetArtifactUri;
                }
            },
            onStageSelected(node) {
                this.selectedStage = node;
                this.selectedEdge = null;
            },
            onEdgeSelected(edgeData) {
                this.selectedEdge = edgeData;
                this.selectedStage = null;
            },
            onStageDispatched() {
                if (this.$refs.canvasRef && typeof this.$refs.canvasRef.fetchPipelineGraph === 'function') {
                    this.$refs.canvasRef.fetchPipelineGraph();
                }
            },
            onAdvanceStance(eventData) {
                if (this.selectedStage) {
                    this.selectedStage.actionType = eventData.nextStance;
                }
            },
            focusViewport(panelName) {
                this.activePanel = (this.activePanel === panelName) ? null : panelName;
                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'focus-editor-panel',
                        panelName: panelName
                    });
                }
            }
        },
        template: `
            <div class="fit column no-wrap bg-slate-950 text-white font-mono overflow-hidden" style="height: 100%; min-height: 0; width: 100%;">
                
                <!-- 1. STUDIO HEADER (FIXED 38px) -->
                <div class="row items-center justify-between q-px-sm bg-black" style="border-bottom: 1px solid #1e293b; height: 38px; min-height: 38px; flex: 0 0 38px;">
                    <div class="row items-center q-gutter-x-sm">
                        <q-icon name="view_timeline" color="primary" size="sm" />
                        <span class="text-subtitle2 text-weight-bold text-cyan-3">AGI PIPELINE STUDIO</span>
                        
                        <q-badge v-if="targetComponent" color="deep-purple-8" text-color="white" :label="targetComponent" class="text-caption text-weight-bold" />

                        <q-separator vertical dark class="q-mx-xs" />

                        <!-- WORKING DAG SIZE PRESETS -->
                        <span class="text-caption text-slate-500 font-mono" style="font-size: 10px;">DAG SIZE:</span>
                        <q-btn-group flat dense>
                             <q-btn flat dense size="xs" :color="splitterModel <= 200 ? 'cyan-3' : 'slate-400'" label="Compact (25%)" @click="setDagHeight(25)" />
                             <q-btn flat dense size="xs" :color="splitterModel > 200 && splitterModel <= 320 ? 'cyan-3' : 'slate-400'" label="Balanced (35%)" @click="setDagHeight(35)" />
                             <q-btn flat dense size="xs" :color="splitterModel > 320 ? 'cyan-3' : 'slate-400'" label="Expanded (55%)" @click="setDagHeight(55)" />
                         </q-btn-group>

                        <q-separator vertical dark class="q-mx-xs" />

                        <div class="row items-center q-gutter-x-xs text-caption text-slate-400">
                            <q-icon name="code" size="xs" color="cyan-4" />
                            <span class="text-weight-bold text-slate-300">{{ currentArtifactLabel }}</span>
                        </div>
                    </div>

                    <!-- VIEWPORT DOCKS -->
                    <div class="row items-center q-gutter-x-xs">
                        <span class="text-caption text-slate-500" style="font-size: 10px;">VIEWPORTS:</span>
                        <q-btn 
                            v-for="vp in viewports" 
                            :key="vp.name"
                            flat dense no-caps
                            :icon="vp.icon"
                            :label="vp.label"
                            :color="activePanel === vp.name ? 'white' : vp.color"
                            :class="activePanel === vp.name ? 'bg-slate-800 text-weight-bolder' : ''"
                            size="xs"
                            class="q-px-xs rounded-borders"
                            style="border: 1px solid rgba(255,255,255,0.1);"
                            @click="focusViewport(vp.name)"
                        >
                            <q-tooltip>{{ activePanel === vp.name ? 'Close' : 'Open' }} {{ vp.label }}</q-tooltip>
                        </q-btn>

                        <q-separator vertical dark class="q-mx-xs" />

                        <q-btn flat round dense icon="close" text-color="white" size="xs" @click="$emit('close')">
                            <q-tooltip>Close Studio</q-tooltip>
                        </q-btn>
                    </div>
                </div>

                <!-- 2. MAIN WORKSPACE CONTAINER -->
                <div class="col full-width column no-wrap relative-position overflow-hidden" style="flex: 1 1 0%; min-height: 0; height: calc(100% - 38px);">
                    
                    <!-- TIER 1: MASTER PIPELINE INDEX (COLLAPSIBLE STRIP) -->
                    <agi-pipeline-index 
                        :active-discussion-id="activeDiscussionId"
                        :target-component="targetComponent"
                        @pipeline-selected="onPipelineSelected"
                        @new-pipeline-created="onPipelineSelected"
                    />

                    <!-- TIER 2 & 3: INTERACTIVE VERTICAL SPLITTER IN PIXEL MODE -->
                    <div class="col full-width relative-position overflow-hidden" style="flex: 1 1 0%; min-height: 0; height: 100%;">
                        <q-splitter
                            v-model="splitterModel"
                            horizontal
                            unit="px"
                            style="height: 100%; width: 100%; min-height: 0;"
                            separator-class="bg-cyan-8"
                            separator-style="height: 6px; cursor: row-resize;"
                            :limits="[140, 750]"
                            emit-immediately
                            @pan="onSplitterPan"
                        >
                            <!-- TOP PANE: TIER 2 PIPELINE DAG CANVAS -->
                            <template v-slot:before>
                                <div class="fit relative-position overflow-hidden" style="height: 100%; width: 100%; min-height: 0;">
                                    <agi-pipeline-canvas 
                                        ref="canvasRef"
                                        :discussion-id="activeDiscussionId"
                                        :target-component="targetComponent"
                                        :selected-stage-id="selectedStage?.stageId || ''"
                                        :selected-edge-id="selectedEdge?.edgeId || ''"
                                        @stage-selected="onStageSelected"
                                        @edge-selected="onEdgeSelected"
                                    />
                                </div>
                            </template>

                            <!-- BOTTOM PANE: TIER 3 STAGE INSPECTOR & PAYLOAD STAGING -->
                            <template v-slot:after>
                                <div class="fit relative-position overflow-hidden" style="height: 100%; width: 100%; min-height: 0;">
                                    <agi-stage-inspector 
                                        :discussion-id="activeDiscussionId"
                                        :selected-stage="selectedStage"
                                        :selected-edge="selectedEdge"
                                        :target-component="targetComponent"
                                        @stage-dispatched="onStageDispatched"
                                        @advance-stance="onAdvanceStance"
                                    />
                                </div>
                            </template>
                        </q-splitter>
                    </div>

                    <!-- OPTIONAL DOCKED VIEWPORT PANEL (RIGHT SIDE DOCK) -->
                    <div v-if="activePanel" class="column no-wrap overflow-hidden bg-slate-900 absolute-top-right" style="width: 45%; height: 100%; min-height: 0; border-left: 1px solid #334155; z-index: 50;">
                        <div class="row items-center justify-between q-pa-xs bg-slate-950" style="border-bottom: 1px solid #334155; height: 32px; min-height: 32px; flex: 0 0 32px;">
                            <span class="text-caption text-weight-bold text-cyan-3 font-mono q-ml-xs">
                                {{ activePanel.replace('Agi', '').replace('Editor', '') }} Dock
                            </span>
                            <q-btn flat round dense icon="close" size="xs" color="slate-400" @click="activePanel = null" />
                        </div>

                        <div class="col overflow-hidden relative-position" style="height: calc(100% - 32px); min-height: 0;">
                            <agi-canvas-editor 
                                v-if="activePanel === 'AgiCanvasEditor'"
                                :screen-path="activeArtifactLocation"
                                :layout-tree="stagedLayoutTree"
                            />
                            <agi-screen-editor 
                                v-else-if="activePanel === 'AgiScreenEditor'"
                                :screen-path="activeArtifactLocation"
                                :layout-tree="stagedLayoutTree"
                            />
                            <div v-else class="fit row flex-center text-slate-500 text-caption font-mono">
                                Editor for {{ activePanel }} active on {{ activeArtifactLocation }}
                            </div>
                        </div>
                    </div>

                </div>

            </div>
        `
    };

    window.AgiStudio = AgiStudio;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-studio'] = AgiStudio;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('agi-studio', AgiStudio);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();