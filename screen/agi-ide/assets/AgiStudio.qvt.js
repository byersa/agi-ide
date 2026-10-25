(function () {
    const AgiStudio = {
        name: 'AgiStudio',
        emits: [
            'close', 'set-width', 'open-artifact', 'toggle-discussion', 'toggle-dag',
            'toggle-blueprint', 'pipeline-selected', 'stage-selected', 'stage-dispatched',
            'seed-pipeline-step'
        ],
        props: {
            activeArtifact: { type: String, default: '' },
            targetComponentProp: { type: String, default: 'nursinghome' },
            widthPercent: { type: Number, default: 50 },
            showDiscussionDrawer: { type: Boolean, default: false },
            showDagDrawer: { type: Boolean, default: false },
            showBlueprintDrawer: { type: Boolean, default: false },
            activeDiscussionIdProp: { type: String, default: '' },
            activeDiscussionTitleProp: { type: String, default: '' },
            selectedStageProp: { type: Object, default: () => null }
        },
        data() {
            return {
                targetComponent: this.targetComponentProp || 'nursinghome',
                activeArtifactLocation: this.activeArtifact || '',
                activeDiscussionId: this.activeDiscussionIdProp || '',
                activeDiscussionTitle: this.activeDiscussionTitleProp || '',
                selectedStage: this.selectedStageProp || null,
                selectedParentStage: null,

                currentWidthPercent: this.widthPercent || 50,
                stagedXmlSource: '',
                stagedLayoutTree: null
            };
        },
        computed: {
            currentArtifactLabel() {
                if (!this.activeArtifactLocation) return 'No Artifact Anchor';
                const parts = this.activeArtifactLocation.split('/');
                return parts[parts.length - 1];
            },
            discussionButtonLabel() {
                if (this.activeDiscussionTitle) {
                    return this.activeDiscussionTitle.length > 20
                        ? this.activeDiscussionTitle.substring(0, 18) + '...'
                        : this.activeDiscussionTitle;
                }
                if (this.activeDiscussionId) {
                    return `Pipeline #${this.activeDiscussionId}`;
                }
                return 'Discussions';
            },
            dagButtonLabel() {
                if (!this.selectedStage) return 'DAG Canvas';
                const stepNum = this.selectedStage.stepNumber || this.selectedStage.stepSequenceNum;
                const stance = (this.selectedStage.actionType || this.selectedStage.stanceEnumId || 'STEP').toUpperCase().replace('AAM', '');
                const stepId = this.selectedStage.pipelineStepId || this.selectedStage.stageId || '';
                const label = this.selectedStage.label || this.selectedStage.stepLabel || '';

                let title = `${stance} #${stepId}`;
                if (stepNum) title = `Step ${stepNum}: ${title}`;
                if (label && !label.startsWith('Step #')) {
                    const cleanLabel = label.length > 16 ? label.substring(0, 14) + '...' : label;
                    title += ` (${cleanLabel})`;
                }
                return title;
            }
        },
        watch: {
            widthPercent(newVal) {
                if (newVal !== undefined && newVal !== null) {
                    this.currentWidthPercent = Number(newVal);
                }
            },
            activeDiscussionIdProp(val) {
                this.activeDiscussionId = val || '';
            },
            activeDiscussionTitleProp(val) {
                this.activeDiscussionTitle = val || '';
            },
            selectedStageProp(val) {
                this.selectedStage = val;
            },
            activeArtifact(val) {
                this.activeArtifactLocation = val || '';
            },
            targetComponentProp(val) {
                this.targetComponent = val || 'nursinghome';
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
                    if (event.data.layoutTree) vm.stagedLayoutTree = event.data.layoutTree;
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
            setWidth(pct) {
                this.currentWidthPercent = pct;
                this.$emit('set-width', pct);
                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'set-studio-width',
                        widthPercent: pct
                    });
                }
            },
            toggleDiscussion() {
                this.$emit('toggle-discussion');
            },
            toggleDag() {
                this.$emit('toggle-dag');
            },
            toggleBlueprint() {
                this.$emit('toggle-blueprint');
            },
            onPipelineSelected(item) {
                if (!item) return;
                this.activeDiscussionId = String(item.discussionId);
                this.activeDiscussionTitle = item.title || item.topic || `Pipeline #${item.discussionId}`;
                this.selectedStage = null;
                this.selectedParentStage = null;
                this.stagedXmlSource = '';
                this.stagedLayoutTree = null;
                if (item.targetArtifactUri) {
                    this.activeArtifactLocation = item.targetArtifactUri;
                }
                this.$emit('pipeline-selected', item);
            },
            onStageSelected(payload) {
                if (payload && payload.stage) {
                    this.selectedStage = payload.stage;
                    this.selectedParentStage = payload.parentStage;
                } else {
                    this.selectedStage = payload;
                    this.selectedParentStage = null;
                }
                this.$emit('stage-selected', payload);
            },
            async onStageDispatched(eventData) {
                this.$emit('stage-dispatched', eventData);
            },
            onAdvanceStance(eventData) {
                if (this.selectedStage) {
                    this.selectedStage.actionType = eventData.nextStance;
                }
            },
            onOpenArtifact(eventData) {
                this.$emit('open-artifact', eventData);
                if (this.contextBus) {
                    const uri = (typeof eventData === 'string') ? eventData : (eventData?.artifactUri || '');
                    const xml = (typeof eventData === 'object') ? (eventData?.rawXmlContent || '') : '';
                    const tree = (typeof eventData === 'object') ? (eventData?.astTree || null) : null;
                    this.contextBus.postMessage({
                        event: 'open-screen-artifact',
                        artifactUri: uri || this.activeArtifactLocation,
                        stagedXml: xml || this.stagedXmlSource,
                        layoutTree: tree || this.stagedLayoutTree,
                        isVirtual: Boolean(xml || tree)
                    });
                }
            },
            onArtifactSelected(uri) {
                this.activeArtifactLocation = uri;
                this.$emit('open-artifact', { artifactUri: uri });
            },
            onSeedPipelineStep(payload) {
                this.$emit('seed-pipeline-step', payload);
            }
        },
        template: `
            <div class="fit column no-wrap bg-slate-950 text-white font-mono overflow-hidden relative-position" style="height: 100%; min-height: 0; width: 100%;">
                
                <!-- 1. STUDIO HEADER (FIXED 32px) -->
                <div class="row items-center justify-between q-px-sm bg-black" style="border-bottom: 1px solid #1e293b; height: 32px; min-height: 32px; flex: 0 0 32px; z-index: 30;">
                    
                    <!-- Left: Navigation Drawers (Blueprint, Discussion, DAG) -->
                    <div class="row items-center q-gutter-x-xs no-wrap ellipsis">
                        <!-- APP BLUEPRINT / PROGRESS MATRIX TRIGGER BUTTON -->
                        <q-btn 
                            flat dense no-caps size="xs"
                            :color="showBlueprintDrawer ? 'teal-3' : 'slate-300'"
                            :class="showBlueprintDrawer ? 'bg-slate-800 text-weight-bolder' : ''"
                            icon="dashboard_customize"
                            label="Blueprint"
                            class="q-px-xs rounded-borders"
                            style="border: 1px solid rgba(20, 184, 166, 0.4); max-width: 140px;"
                            @click="toggleBlueprint"
                        >
                            <q-icon :name="showBlueprintDrawer ? 'expand_less' : 'expand_more'" size="14px" class="q-ml-xs" />
                            <q-tooltip class="bg-slate-900 text-teal-2 font-mono">App Blueprint &amp; Screen Progress Matrix</q-tooltip>
                        </q-btn>

                        <!-- DISCUSSION FULL-WIDTH TRIGGER BUTTON -->
                        <q-btn 
                            flat dense no-caps size="xs"
                            :color="showDiscussionDrawer ? 'cyan-3' : 'slate-300'"
                            :class="showDiscussionDrawer ? 'bg-slate-800 text-weight-bolder' : ''"
                            icon="forum"
                            :label="discussionButtonLabel"
                            class="q-px-xs rounded-borders"
                            style="border: 1px solid rgba(56, 189, 248, 0.3); max-width: 190px;"
                            @click="toggleDiscussion"
                        >
                            <q-icon :name="showDiscussionDrawer ? 'expand_less' : 'expand_more'" size="14px" class="q-ml-xs" />
                            <q-tooltip class="bg-slate-900 text-cyan-2 font-mono">Initiatives &amp; Discussions</q-tooltip>
                        </q-btn>

                        <!-- DAG FULL-WIDTH TRIGGER BUTTON -->
                        <q-btn 
                            flat dense no-caps size="xs"
                            :color="showDagDrawer ? 'amber-3' : 'slate-300'"
                            :class="showDagDrawer ? 'bg-slate-800 text-weight-bolder' : ''"
                            icon="account_tree"
                            :label="dagButtonLabel"
                            class="q-px-xs rounded-borders"
                            style="border: 1px solid rgba(245, 158, 11, 0.3); max-width: 210px;"
                            @click="toggleDag"
                        >
                            <q-icon :name="showDagDrawer ? 'expand_less' : 'expand_more'" size="14px" class="q-ml-xs" />
                            <q-tooltip class="bg-slate-900 text-amber-2 font-mono">Pipeline DAG Canvas</q-tooltip>
                        </q-btn>
                    </div>

                    <!-- Right: 5-Point Width Ratio Controls (0, 35, 50, 65, 100%) -->
                    <div class="row items-center q-gutter-x-none rounded-borders bg-slate-900" style="border: 1px solid #334155;">
                        <q-btn 
                            v-for="preset in [0, 35, 50, 65, 100]" 
                            :key="preset"
                            flat dense size="xs"
                            :label="preset + '%'"
                            :color="currentWidthPercent === preset ? 'cyan-3' : 'grey-5'"
                            :class="currentWidthPercent === preset ? 'bg-slate-800 text-weight-bolder' : ''"
                            class="q-px-xs"
                            @click="setWidth(preset)"
                        >
                            <q-tooltip>Set Studio Width to {{ preset }}%</q-tooltip>
                        </q-btn>
                    </div>
                </div>

                <!-- 2. SLIDING DRAWER: BLUEPRINT & SCREEN PROGRESS MATRIX -->
                <q-slide-transition>
                    <div 
                        v-if="showBlueprintDrawer" 
                        class="full-width column no-wrap bg-slate-950 shadow-10 relative-position overflow-hidden" 
                        style="height: 380px; min-height: 380px; max-height: 380px; border-bottom: 2px solid #0d9488; z-index: 35; flex: 0 0 380px;"
                    >
                        <div class="row items-center justify-between q-px-sm bg-black" style="height: 26px; min-height: 26px; flex: 0 0 26px; border-bottom: 1px solid #1e293b;">
                            <span class="text-caption font-mono text-teal-3 text-weight-bold" style="font-size: 11px;">
                                <q-icon name="dashboard_customize" size="14px" class="q-mr-xs" /> APP BLUEPRINT &amp; PROGRESS MATRIX
                            </span>
                            <q-btn flat round dense icon="close" size="xs" color="slate-400" @click="toggleBlueprint" />
                        </div>
                        <div class="col full-width overflow-hidden relative-position" style="flex: 1 1 0%; min-height: 0;">
                            <component 
                                :is="'agi-artifact-palette'"
                                :target-component="targetComponent"
                                :active-artifact-uri="activeArtifactLocation"
                                @artifact-selected="onArtifactSelected"
                                @seed-pipeline-step="onSeedPipelineStep"
                            />
                        </div>
                    </div>
                </q-slide-transition>

                <!-- 3. MAIN WORKSPACE VIEWPORT: AgiStageInspector -->
                <div class="col full-width column no-wrap relative-position overflow-hidden" style="flex: 1 1 0%; min-height: 0; height: calc(100% - 32px);">
                    <component 
                        :is="'agi-stage-inspector'"
                        :discussion-id="activeDiscussionId"
                        :selected-stage="selectedStage"
                        :selected-parent-stage="selectedParentStage"
                        :target-component="targetComponent"
                        @stage-dispatched="onStageDispatched"
                        @advance-stance="onAdvanceStance"
                        @open-artifact="onOpenArtifact"
                    />
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