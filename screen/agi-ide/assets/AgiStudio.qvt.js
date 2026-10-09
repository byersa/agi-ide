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
                selectedParentStage: null,

                // Workspace Orientation: 'horizontal' (Top/Bottom Stack) | 'vertical' (Side-by-Side)
                layoutOrientation: 'horizontal',

                // Splitter Models: Pixel height for stacked, percentage width for side-by-side
                splitterModelStacked: 250,
                splitterModelSideBySide: 48,

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
            },
            isSideBySide() {
                return this.layoutOrientation === 'vertical';
            },
            activeSplitterModel: {
                get() {
                    return this.isSideBySide ? this.splitterModelSideBySide : this.splitterModelStacked;
                },
                set(val) {
                    if (this.isSideBySide) {
                        this.splitterModelSideBySide = val;
                    } else {
                        this.splitterModelStacked = val;
                    }
                }
            }
        },
        mounted() {
            const vm = this;
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = (event) => {
                if (!event.data) return;
                if (event.data.event === 'open-screen-artifact' && event.data.artifactUri) {
                    vm.activeArtifactLocation = event.data.artifactUri;
                    if (event.data.stagedXml) vm.stagedXmlSource = event.data.stagedXml;
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
            toggleOrientation() {
                this.layoutOrientation = this.layoutOrientation === 'horizontal' ? 'vertical' : 'horizontal';
                this.$nextTick(() => {
                    if (this.$refs.canvasRef && typeof this.$refs.canvasRef.scheduleRecalcEdges === 'function') {
                        this.$refs.canvasRef.scheduleRecalcEdges();
                    }
                });
            },
            setDagHeight(preset) {
                if (this.isSideBySide) {
                    if (preset === 25 || preset === 'compact') this.splitterModelSideBySide = 35;
                    else if (preset === 35 || preset === 'balanced') this.splitterModelSideBySide = 48;
                    else if (preset === 55 || preset === 'expanded') this.splitterModelSideBySide = 60;
                } else {
                    const splitterEl = this.$el?.querySelector('.q-splitter');
                    const totalH = splitterEl ? splitterEl.offsetHeight : 700;

                    if (preset === 25 || preset === 'compact') {
                        this.splitterModelStacked = Math.max(180, Math.round(totalH * 0.25));
                    } else if (preset === 35 || preset === 'balanced') {
                        this.splitterModelStacked = Math.max(240, Math.round(totalH * 0.35));
                    } else if (preset === 55 || preset === 'expanded') {
                        this.splitterModelStacked = Math.max(380, Math.round(totalH * 0.55));
                    }
                }

                this.$nextTick(() => {
                    if (this.$refs.canvasRef && typeof this.$refs.canvasRef.scheduleRecalcEdges === 'function') {
                        this.$refs.canvasRef.scheduleRecalcEdges();
                    }
                });
            },
            onSplitterPan(phase) {
                if (phase && phase.isFinal) {
                    this.$nextTick(() => {
                        if (this.$refs.canvasRef && typeof this.$refs.canvasRef.scheduleRecalcEdges === 'function') {
                            this.$refs.canvasRef.scheduleRecalcEdges();
                        }
                    });
                }
            },
            onPipelineSelected(item) {
                if (!item) return;
                this.activeDiscussionId = String(item.discussionId);
                this.selectedStage = null;
                this.selectedParentStage = null;
                this.stagedXmlSource = '';
                if (item.targetArtifactUri) {
                    this.activeArtifactLocation = item.targetArtifactUri;
                }
            },
            onStageSelected(payload) {
                if (payload && payload.stage) {
                    this.selectedStage = payload.stage;
                    this.selectedParentStage = payload.parentStage;
                } else {
                    this.selectedStage = payload;
                    this.selectedParentStage = null;
                }
            },
            async onStageDispatched(eventData) {
                if (this.$refs.canvasRef && typeof this.$refs.canvasRef.fetchPipelineGraph === 'function') {
                    await this.$refs.canvasRef.fetchPipelineGraph();
                    const newStepId = eventData?.pipelineStepId;
                    if (newStepId && this.$refs.canvasRef.dagLayout?.nodeMap) {
                        const targetNode = this.$refs.canvasRef.dagLayout.nodeMap[String(newStepId)];
                        if (targetNode) {
                            this.$refs.canvasRef.selectStage(targetNode, 'OUT');
                        }
                    }
                }
            },
            onAdvanceStance(eventData) {
                if (this.selectedStage) {
                    this.selectedStage.actionType = eventData.nextStance;
                }
            },
            onOpenArtifact(eventData) {
                let uri = '';
                let xml = '';

                if (typeof eventData === 'string') {
                    uri = eventData;
                } else if (eventData && typeof eventData === 'object') {
                    uri = eventData.artifactUri || '';
                    xml = eventData.rawXmlContent || '';
                }

                if (!uri) return;
                this.activeArtifactLocation = uri;
                this.stagedXmlSource = xml || '';

                if (uri.endsWith('.xml') || xml) {
                    this.activePanel = 'AgiScreenEditor';
                }

                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'open-screen-artifact',
                        artifactUri: uri,
                        stagedXml: xml,
                        isVirtual: Boolean(xml)
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

                        <!-- ORIENTATION TOGGLE -->
                        <q-btn 
                            flat dense no-caps size="xs"
                            :icon="isSideBySide ? 'table_chart' : 'view_stream'"
                            :label="isSideBySide ? 'Side-by-Side (50/50)' : 'Stacked (Top/Bottom)'"
                            color="cyan-3"
                            class="q-px-xs rounded-borders"
                            style="border: 1px solid rgba(56, 189, 248, 0.3);"
                            @click="toggleOrientation"
                        >
                            <q-tooltip>Toggle Workspace Split Orientation</q-tooltip>
                        </q-btn>

                        <!-- WORKING DAG SIZE PRESETS -->
                        <q-btn-group flat dense class="q-ml-xs">
                            <q-btn flat dense size="xs" label="Compact" @click="setDagHeight(25)" />
                            <q-btn flat dense size="xs" label="Balanced" @click="setDagHeight(35)" />
                            <q-btn flat dense size="xs" label="Expanded" @click="setDagHeight(55)" />
                        </q-btn-group>

                        <q-separator vertical dark class="q-mx-xs" />

                        <div class="row items-center q-gutter-x-xs text-caption text-slate-400">
                            <q-icon name="code" size="xs" color="cyan-4" />
                            <span class="text-weight-bold text-slate-300">{{ currentArtifactLabel }}</span>
                            <span v-if="stagedXmlSource" class="q-px-xs rounded font-mono text-weight-bolder bg-amber-10 text-amber-3" style="font-size: 8px; border: 1px solid #d97706;">
                                STAGED VIRTUAL
                            </span>
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

                    <!-- TIER 2 & 3: ADAPTIVE DUAL-MODE SPLITTER (STACKED OR SIDE-BY-SIDE) -->
                    <div class="col full-width relative-position overflow-hidden" style="flex: 1 1 0%; min-height: 0; height: 100%;">
                        
                        <component :is="'style'">
                            .agi-studio-splitter.q-splitter--horizontal > .q-splitter__panel.q-splitter__before {
                                flex: none !important;
                                min-height: 0 !important;
                                max-height: 100% !important;
                                overflow: hidden !important;
                            }
                            .agi-studio-splitter.q-splitter--horizontal > .q-splitter__panel.q-splitter__after {
                                flex: 1 1 0% !important;
                                min-height: 0 !important;
                                height: auto !important;
                                overflow: hidden !important;
                            }
                            .agi-studio-splitter.q-splitter--vertical > .q-splitter__panel {
                                overflow: hidden !important;
                                min-width: 0 !important;
                            }

                            .agi-studio-splitter > .q-splitter__separator {
                                z-index: 15 !important;
                            }
                        </component>

                        <q-splitter
                            v-model="activeSplitterModel"
                            :horizontal="!isSideBySide"
                            :unit="isSideBySide ? '%' : 'px'"
                            class="fit agi-studio-splitter"
                            style="height: 100%; width: 100%; min-height: 0;"
                            separator-class="bg-cyan-8"
                            :separator-style="isSideBySide ? 'width: 6px; cursor: col-resize;' : 'height: 6px; cursor: row-resize;'"
                            :limits="isSideBySide ? [25, 75] : [140, 750]"
                            emit-immediately
                            @pan="onSplitterPan"
                        >
                            <!-- PANE 1: TIER 2 PIPELINE DAG CANVAS -->
                            <template v-slot:before>
                                <div class="fit relative-position overflow-hidden" style="height: 100%; width: 100%; min-height: 0;">
                                    <agi-pipeline-canvas 
                                        ref="canvasRef"
                                        :discussion-id="activeDiscussionId"
                                        :target-component="targetComponent"
                                        :selected-stage-id="selectedStage?.pipelineStepId || selectedStage?.stageId || ''"
                                        @stage-selected="onStageSelected"
                                    />
                                </div>
                            </template>

                            <!-- PANE 2: TIER 3 STAGE INSPECTOR & CONTRACT PAIR STUDIO -->
                            <template v-slot:after>
                                <div class="fit relative-position overflow-hidden" style="height: 100%; width: 100%; min-height: 0;">
                                    <agi-stage-inspector 
                                        :discussion-id="activeDiscussionId"
                                        :selected-stage="selectedStage"
                                        :selected-parent-stage="selectedParentStage"
                                        :target-component="targetComponent"
                                        @stage-dispatched="onStageDispatched"
                                        @advance-stance="onAdvanceStance"
                                        @open-artifact="onOpenArtifact"
                                    />
                                </div>
                            </template>
                        </q-splitter>
                    </div>

                    <!-- OPTIONAL DOCKED VIEWPORT PANEL (RIGHT SIDE DOCK) -->
                    <div v-if="activePanel" class="column no-wrap overflow-hidden bg-slate-900 absolute-top-right" style="width: 50%; height: 100%; min-height: 0; border-left: 1px solid #334155; z-index: 50;">
                        <div class="row items-center justify-between q-pa-xs bg-slate-950" style="border-bottom: 1px solid #334155; height: 32px; min-height: 32px; flex: 0 0 32px;">
                            <div class="row items-center q-gutter-x-xs">
                                <span class="text-caption text-weight-bold text-cyan-3 font-mono q-ml-xs">
                                    {{ activePanel.replace('Agi', '').replace('Editor', '') }} Dock
                                </span>
                                <span v-if="stagedXmlSource" class="q-px-xs rounded font-mono text-weight-bolder bg-amber-10 text-amber-3" style="font-size: 8px;">
                                    [VIRTUAL BUFFER]
                                </span>
                            </div>
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
                                :staged-xml-source="stagedXmlSource"
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