(function () {
    const AgiStudio = {
        name: 'AgiStudio',
        emits: ['close', 'toggle-fullscreen'],
        props: {
            activeArtifact: { type: String, default: '' },
            targetComponentProp: { type: String, default: '' },
            isFullscreen: { type: Boolean, default: false }
        },
        data() {
            return {
                targetComponent: this.targetComponentProp || 'nursinghome',
                activeArtifactLocation: this.activeArtifact || '',
                activeDiscussionId: '',
                selectedStage: null,
                selectedEdge: null,

                // DAG vs Inspector Height Presets
                dagHeightPreset: 'balanced', // 'full-dag' (60%) | 'balanced' (45%) | 'focus-inspector' (25%) | 'compact' (240px)

                // Viewport Dock State
                activePanel: null, // 'AgiCanvasEditor' | 'AgiScreenEditor' | 'AgiServiceEditor' | 'AgiEntityEditor' | null
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
            },
            dagContainerStyle() {
                if (this.dagHeightPreset === 'full-dag') {
                    return { flex: '0 0 60%', height: '60%', minHeight: '260px' };
                }
                if (this.dagHeightPreset === 'focus-inspector') {
                    return { flex: '0 0 25%', height: '25%', minHeight: '160px' };
                }
                if (this.dagHeightPreset === 'compact') {
                    return { flex: '0 0 240px', height: '240px', minHeight: '240px' };
                }
                // default 'balanced'
                return { flex: '0 0 45%', height: '45%', minHeight: '220px' };
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
        template: `
            <div class="fit column no-wrap bg-slate-950 text-white font-mono overflow-hidden" style="height: 100%; max-height: 100%; min-height: 0; width: 100%; border-top: 1px solid #334155;">
                
                <!-- 1. STUDIO HEADER (FIXED 42px) -->
                <div class="row items-center justify-between q-pa-xs bg-black" style="border-bottom: 1px solid #1e293b; height: 42px; min-height: 42px; max-height: 42px; flex: 0 0 42px;">
                    <div class="row items-center q-gutter-x-sm">
                        <q-icon name="view_timeline" color="primary" size="sm" />
                        <span class="text-subtitle2 text-weight-bold text-cyan-3">AGI PIPELINE STUDIO</span>
                        
                        <q-badge v-if="targetComponent" color="deep-purple-8" text-color="white" :label="targetComponent" class="text-caption text-weight-bold" />

                        <q-separator vertical dark class="q-mx-xs" />

                        <!-- LAYOUT PRESET SWITCHER -->
                        <span class="text-caption text-slate-500 font-mono" style="font-size: 9px;">DAG VIEW:</span>
                        <q-btn-toggle
                            v-model="dagHeightPreset"
                            dense rounded no-caps
                            toggle-color="primary"
                            color="slate-900"
                            text-color="slate-400"
                            size="xs"
                            class="text-weight-bold"
                            style="border: 1px solid #334155;"
                            :options="[
                                { label: 'Full DAG (60%)', value: 'full-dag' },
                                { label: 'Balanced (45%)', value: 'balanced' },
                                { label: 'Focus Inspector', value: 'focus-inspector' },
                                { label: 'Compact', value: 'compact' }
                            ]"
                        />

                        <q-separator vertical dark class="q-mx-xs" />

                        <div class="row items-center q-gutter-x-xs text-caption text-slate-400">
                            <q-icon name="code" size="xs" color="cyan-4" />
                            <span class="text-weight-bold text-slate-300">{{ currentArtifactLabel }}</span>
                        </div>
                    </div>

                    <!-- VIEWPORT TOGGLES & FULLSCREEN -->
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

                        <!-- Fullscreen Studio Toggle -->
                        <q-btn 
                            flat dense round
                            :icon="isFullscreen ? 'fullscreen_exit' : 'fullscreen'" 
                            :color="isFullscreen ? 'amber-4' : 'cyan-4'" 
                            size="xs" 
                            @click="$emit('toggle-fullscreen')"
                        >
                            <q-tooltip>{{ isFullscreen ? 'Restore Split View' : 'Maximize Studio (Occupies Full Workspace)' }}</q-tooltip>
                        </q-btn>

                        <!-- Close Button -->
                        <q-btn flat round dense icon="close" text-color="white" size="xs" @click="$emit('close')">
                            <q-tooltip>Close Studio</q-tooltip>
                        </q-btn>
                    </div>
                </div>

                <!-- 2. MAIN 3-TIER WORKSPACE (HORIZONTAL + SPLIT VERTICAL) -->
                <div class="col row no-wrap overflow-hidden" style="height: calc(100% - 42px); min-height: 0; width: 100%;">
                    
                    <!-- PIPELINE ORCHESTRATOR COLUMN -->
                    <div class="col column no-wrap overflow-hidden" style="height: 100%; min-height: 0;">
                        
                        <!-- TIER 1: MASTER PIPELINE INDEX (COLLAPSIBLE MASTER Q-LIST) -->
                        <agi-pipeline-index 
                            :active-discussion-id="activeDiscussionId"
                            :target-component="targetComponent"
                            @pipeline-selected="onPipelineSelected"
                            @new-pipeline-created="onPipelineSelected"
                        />

                        <!-- TIER 2: HORIZONTAL BRANCHING DAG VIEWPORT (DYNAMIC HEIGHT PRESETS) -->
                        <div class="column no-wrap overflow-hidden" :style="dagContainerStyle">
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

                        <!-- TIER 3: STAGE INSPECTOR & PAYLOAD STAGING (SPLIT PANE) -->
                        <div class="col column no-wrap overflow-hidden" style="flex: 1 1 0%; min-height: 0;">
                            <agi-stage-inspector 
                                :discussion-id="activeDiscussionId"
                                :selected-stage="selectedStage"
                                :selected-edge="selectedEdge"
                                :target-component="targetComponent"
                                @stage-dispatched="onStageDispatched"
                                @advance-stance="onAdvanceStance"
                            />
                        </div>

                    </div>

                    <!-- DOCKED VIEWPORT PANEL (RIGHT SIDE DOCK) -->
                    <div v-if="activePanel" class="col column no-wrap overflow-hidden bg-slate-900" style="max-width: 45%; height: 100%; min-height: 0; border-left: 1px solid #334155;">
                        <div class="row items-center justify-between q-pa-xs bg-slate-950" style="border-bottom: 1px solid #334155; height: 32px; min-height: 32px; max-height: 32px; flex: 0 0 32px;">
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
        `,
        methods: {
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
            onStageDispatched(payload) {
                if (this.$refs.canvasRef && typeof this.$refs.canvasRef.fetchPipelineGraph === 'function') {
                    this.$refs.canvasRef.fetchPipelineGraph();
                }
            },
            onAdvanceStance(eventData) {
                if (this.selectedStage) {
                    this.selectedStage.actionType = eventData.nextStance;
                }
            },
            async onTurnDispatched(turnPayload) {
                let targetUri = turnPayload?.targetArtifactUri || turnPayload?.createdArtifactUri;
                if (!targetUri) {
                    targetUri = this.activeArtifactLocation || (this.targetComponent ? `component://${this.targetComponent}/screen/${this.targetComponent}.xml` : '');
                }

                this.activeArtifactLocation = targetUri;

                if (turnPayload?.rawXmlContent) {
                    this.stagedXmlSource = turnPayload.rawXmlContent;

                    if (!this.activePanel) {
                        this.activePanel = 'AgiScreenEditor';
                    }

                    try {
                        const headers = {};
                        if (window.AGI_SERVER_CSRF_TOKEN) headers['X-CSRF-Token'] = window.AGI_SERVER_CSRF_TOKEN;
                        const resp = await axios.post('/rest/s1/agi-ide/parseXmlToTree', {
                            xmlText: this.stagedXmlSource,
                            artifactLocation: targetUri
                        }, { headers });
                        this.stagedLayoutTree = resp.data?.layoutTree || null;
                    } catch (e) {
                        console.warn("Could not parse XML to AST layout tree:", e);
                    }
                }

                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'artifact-state-mutated',
                        artifactUri: targetUri,
                        rawXmlText: turnPayload?.rawXmlContent || ''
                    });
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
        }
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