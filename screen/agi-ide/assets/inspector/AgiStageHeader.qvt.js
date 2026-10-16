(function () {
    const AgiStageHeader = {
        name: 'AgiStageHeader',
        props: {
            discussionId: { type: String, default: '' },
            selectedStage: { type: Object, default: () => null },
            activePort: { type: String, default: 'OUT' },
            currentActionType: { type: String, default: 'discuss' },
            themeStyle: {
                type: Object,
                default: () => ({ bg: '#0284c7', text: '#ffffff', border: '#0369a1', light: '#e0f2fe', icon: 'chat', label: 'DISCUSS' })
            },
            isDraft: { type: Boolean, default: true },
            stepId: { type: String, default: '' },
            displayTargetArtifactUri: { type: String, default: '' },
            isAdvancing: { type: Boolean, default: false },
            isForking: { type: Boolean, default: false },
            isArchiving: { type: Boolean, default: false },
            egressPayload: { type: Object, default: () => null }
        },
        emits: [
            'update:activePort',
            'advance-to-build',
            'branch-successor',
            'orchestrate-module',
            'fork-step',
            'archive-branch',
            'set-stance',
            'locate-canvas',
            'open-artifact',
            'update-target-artifact'
        ],
        data() {
            return {
                showOrchestrateDialog: false,
                isOrchestrating: false,
                stagedSubplans: [],
                showArtifactModal: false
            };
        },
        computed: {
            isReadyToOrchestrate() {
                if (this.isDraft || !this.selectedStage) return false;
                const p = this.egressPayload || {};
                const rawBody = String(this.selectedStage.egressJsonData || this.selectedStage.message || '');
                return p.readyToOrchestrate === true ||
                    p.status === 'READY_TO_ORCHESTRATE' ||
                    rawBody.includes('"readyToOrchestrate": true') ||
                    rawBody.includes('READY TO ORCHESTRATE: YES') ||
                    rawBody.includes('READY TO ORCHESTRATE:YES');
            },
            discoveredModules() {
                const p = this.egressPayload || {};
                let mods = [];
                if (Array.isArray(p.proposedModules) && p.proposedModules.length > 0) {
                    mods = p.proposedModules;
                } else if (Array.isArray(p.subplans) && p.subplans.length > 0) {
                    mods = p.subplans;
                }
                return mods;
            }
        },
        methods: {
            setPort(port) {
                this.$emit('update:activePort', port);
            },
            advanceStance(stance) {
                this.$emit('set-stance', stance);
            },
            branchStep(stance) {
                this.$emit('branch-successor', {
                    sourceStepId: this.stepId,
                    targetStance: stance
                });
            },
            openOrchestrationModal() {
                const mods = this.discoveredModules;
                this.stagedSubplans = mods.map((m, idx) => ({
                    selected: true,
                    key: m.key || 'module_' + (idx + 1),
                    title: m.title || m.name || 'Sub-Screen ' + (idx + 1),
                    description: m.description || '',
                    suggestedArchetype: m.suggestedArchetype || m.archetype || 'master-detail',
                    targetArtifactUri: m.targetArtifactUri || ''
                }));
                this.showOrchestrateDialog = true;
            },
            confirmOrchestration() {
                const active = this.stagedSubplans.filter(s => s.selected);
                if (active.length === 0) {
                    this.$q?.notify({ type: 'warning', message: 'Select at least one sub-screen to orchestrate.' });
                    return;
                }
                this.showOrchestrateDialog = false;
                this.$emit('orchestrate-module', {
                    sourceStepId: this.stepId,
                    subplans: active
                });
            },
            onArtifactChosenForStep(item) {
                const rawUri = item.value || '';
                let canonical = rawUri;
                if (canonical.includes('runtime/component/')) {
                    canonical = 'component://' + canonical.substring(canonical.indexOf('runtime/component/') + 'runtime/component/'.length());
                } else if (!canonical.startsWith('component://')) {
                    canonical = 'component://' + canonical;
                }

                this.showArtifactModal = false;
                this.$emit('update-target-artifact', {
                    pipelineStepId: this.stepId,
                    targetArtifactUri: canonical
                });
            },
        },
        template: `
            <div 
                class="agi-stage-header column no-wrap q-py-xs q-px-sm font-mono text-white" 
                :style="{ 
                    backgroundColor: '#0f172a',
                    borderBottom: '2px solid ' + (selectedStage ? themeStyle.bg : '#38bdf8'), 
                    flex: '0 0 auto',
                    zIndex: 10
                }"
            >
                <!-- TIER 1: STAGE PROVENANCE, STATUS, & [IN]/[OUT] PORT TOGGLE -->
                <div class="row items-center justify-between full-width q-py-xs" style="min-height: 32px;">
                    
                    <div class="row items-center q-gutter-x-xs no-wrap ellipsis">
                        <template v-if="selectedStage && stepId">
                            <div 
                                v-if="selectedStage.stepNumber" 
                                class="row items-center q-px-xs rounded-borders font-mono text-caption text-weight-bolder" 
                                style="background-color: #020617; color: #38bdf8; border: 1px solid #0284c7; font-size: 10px; height: 24px;"
                            >
                                STEP {{ selectedStage.stepNumber }}{{ selectedStage.totalSteps ? ' / ' + selectedStage.totalSteps : '' }}
                            </div>

                            <div 
                                class="row items-center q-px-xs rounded-borders text-weight-bolder" 
                                :style="{ backgroundColor: themeStyle.bg, color: themeStyle.text, height: '24px' }"
                            >
                                <q-icon :name="themeStyle.icon" size="13px" class="q-mr-xs" />
                                <span class="text-caption font-mono" style="font-size: 10px; letter-spacing: 0.5px;">
                                    {{ themeStyle.label }} #{{ stepId }}
                                </span>
                            </div>

                            <span 
                                class="row items-center q-px-xs rounded-borders text-caption text-weight-bolder" 
                                :style="{
                                    backgroundColor: isDraft ? '#78350f' : '#1e293b',
                                    color: isDraft ? '#fef3c7' : '#94a3b8',
                                    border: isDraft ? '1px solid #d97706' : '1px solid #334155',
                                    fontSize: '9px', height: '24px'
                                }"
                            >
                                {{ isDraft ? 'DRAFT' : 'COMMITTED' }}
                            </span>

                            <!-- [IN] vs [OUT] Toggle -->
                            <div class="row items-center q-gutter-x-none rounded-borders q-ml-xs" style="background-color: #020617; border: 1px solid #334155; padding: 1px;">
                                <button 
                                    type="button"
                                    class="cursor-pointer font-mono text-caption text-weight-bold row items-center"
                                    :style="{
                                        backgroundColor: activePort === 'IN' ? '#0284c7' : '#0f172a',
                                        color: activePort === 'IN' ? '#ffffff' : '#94a3b8',
                                        border: activePort === 'IN' ? '1px solid #38bdf8' : '1px solid transparent',
                                        borderRadius: '3px',
                                        padding: '2px 8px',
                                        fontSize: '9px',
                                        height: '22px'
                                    }"
                                    @click="setPort('IN')"
                                >
                                    <q-icon name="login" size="11px" class="q-mr-xs" :color="activePort === 'IN' ? 'white' : 'cyan-4'" />
                                    <span>[IN] INGRESS</span>
                                    <span v-if="selectedStage?.ingressPayloadId" class="q-ml-xs text-cyan-3" style="font-size: 8px;">#{{ selectedStage.ingressPayloadId }}</span>
                                </button>

                                <button 
                                    type="button"
                                    class="cursor-pointer font-mono text-caption text-weight-bold row items-center"
                                    :style="{
                                        backgroundColor: activePort === 'OUT' ? '#0284c7' : '#0f172a',
                                        color: activePort === 'OUT' ? '#ffffff' : '#94a3b8',
                                        border: activePort === 'OUT' ? '1px solid #38bdf8' : '1px solid transparent',
                                        borderRadius: '3px',
                                        padding: '2px 8px',
                                        fontSize: '9px',
                                        height: '22px'
                                    }"
                                    @click="setPort('OUT')"
                                >
                                    <span>[OUT] EGRESS</span>
                                    <span v-if="selectedStage?.egressPayloadId" class="q-ml-xs text-amber-3" style="font-size: 8px;">#{{ selectedStage.egressPayloadId }}</span>
                                    <q-icon name="logout" size="11px" class="q-ml-xs" :color="activePort === 'OUT' ? 'white' : 'amber-4'" />
                                </button>
                            </div>
                        </template>

                        <!-- Empty Stage Initialization Header -->
                        <template v-else-if="discussionId">
                            <div class="row items-center q-px-xs rounded-borders font-mono text-caption text-weight-bolder" style="background-color: #020617; color: #38bdf8; border: 1px solid #0284c7; font-size: 10px; height: 24px;">
                                STEP 1 (INITIAL)
                            </div>
                            <div class="row items-center q-px-xs rounded-borders text-weight-bolder" style="background-color: #7c3aed; color: #ffffff; height: 24px;">
                                <q-icon name="play_arrow" size="13px" class="q-mr-xs" />
                                <span class="text-caption font-mono" style="font-size: 10px;">ROOT DISPATCH</span>
                            </div>
                            <span class="text-caption text-slate-400 font-mono q-ml-xs" style="font-size: 10px;">Pipeline #{{ discussionId }}</span>
                        </template>
                    </div>

                    <!-- Right: Target Artifact & DAG Locate -->
                    <div v-if="selectedStage && stepId" class="row items-center q-gutter-x-xs no-wrap">
                        <div class="row items-center q-gutter-x-xs text-caption text-cyan-3">
                            <q-icon name="code" size="12px" />
                            <span class="text-weight-bold" style="font-size: 10px;">
                                {{ displayTargetArtifactUri ? displayTargetArtifactUri.split('/').pop() : 'No Target Artifact' }}
                            </span>
                    
                            <!-- Edit/Change Step Target Artifact Button -->
                            <q-btn flat round dense size="xs" icon="edit" color="cyan-3" @click="showArtifactModal = true">
                                <q-tooltip>Change Target Artifact for this Step</q-tooltip>
                            </q-btn>
                    
                            <q-btn v-if="displayTargetArtifactUri" flat round dense size="xs" icon="open_in_new" color="amber-4" @click="$emit('open-artifact', displayTargetArtifactUri)">
                                <q-tooltip>Open in Workspace Viewport</q-tooltip>
                            </q-btn>
                        </div>
                    
                        <q-btn flat round dense size="xs" icon="my_location" color="cyan-3" @click="$emit('locate-canvas', stepId)">
                            <q-tooltip>Scroll to this card on DAG Canvas</q-tooltip>
                        </q-btn>
                    </div>
                </div>

                <!-- TIER 2: ACTIONS & ORCHESTRATION -->
                <div v-if="selectedStage" class="row items-center justify-between full-width q-pt-xs" style="border-top: 1px solid #1e293b; min-height: 30px;">
                    
                    <div class="row items-center q-gutter-x-xs">
                        
                        <!-- ⚡ ORCHESTRATE MODULE (Appears when readyToOrchestrate is confirmed) -->
                        <q-btn 
                            v-if="isReadyToOrchestrate"
                            flat dense no-caps size="xs"
                            icon="bolt"
                            :label="'Orchestrate Sub-Screens' + (discoveredModules.length > 0 ? ' (' + discoveredModules.length + ')' : '')"
                            color="white"
                            class="q-px-sm rounded-borders bg-deep-purple-8 text-weight-bolder q-mr-xs animate-pulse"
                            style="border: 1px solid #a855f7; height: 22px;"
                            @click="openOrchestrationModal"
                        >
                            <q-tooltip>Scope is mature. Decompose and fan out parallel PLAN steps for these sub-screens</q-tooltip>
                        </q-btn>

                        <!-- Standard Branching Hub -->
                        <template v-if="!isDraft">
                            <span class="text-slate-400 font-mono text-caption text-weight-bold q-mr-xs" style="font-size: 10px;">BRANCH:</span>
                            
                            <q-btn flat dense no-caps size="xs" icon="chat" label="+ Discuss" color="cyan-3" class="q-px-xs rounded-borders bg-cyan-10 text-weight-bolder" style="border: 1px solid #0284c7; height: 22px;" :loading="isAdvancing" @click="branchStep('discuss')" />
                            <q-btn flat dense no-caps size="xs" icon="architecture" label="+ Plan" color="purple-3" class="q-px-xs rounded-borders bg-purple-10 text-weight-bolder" style="border: 1px solid #7c3aed; height: 22px;" :loading="isAdvancing" @click="branchStep('plan')" />
                            <q-btn flat dense no-caps size="xs" icon="handyman" label="+ Build" color="amber-3" class="q-px-xs rounded-borders bg-amber-10 text-weight-bolder" style="border: 1px solid #f59e0b; height: 22px;" :loading="isAdvancing" @click="branchStep('build')" />
                        </template>

                        <q-btn flat dense no-caps size="xs" icon="fork_right" label="Fork" color="amber-4" class="q-px-xs rounded-borders q-ml-sm" style="border: 1px solid rgba(251, 191, 36, 0.4); height: 22px;" :loading="isForking" @click="$emit('fork-step')" />
                        <q-btn flat dense no-caps size="xs" icon="archive" label="Archive" color="slate-400" class="q-px-xs rounded-borders" style="border: 1px solid #334155; height: 22px;" :loading="isArchiving" @click="$emit('archive-branch')" />
                    </div>

                    <!-- Stance Selector -->
                    <div class="row items-center q-gutter-x-xs">
                        <span class="text-slate-500 font-mono text-caption" style="font-size: 9px;">STANCE:</span>
                        <q-btn-group flat dense style="border: 1px solid #334155; border-radius: 3px;">
                            <q-btn flat dense size="xs" :color="currentActionType === 'discuss' ? 'cyan-3' : 'slate-400'" :class="currentActionType === 'discuss' ? 'bg-cyan-10 text-weight-bolder' : ''" style="height: 20px; font-size: 9px;" label="Discuss" @click="advanceStance('discuss')" />
                            <q-btn flat dense size="xs" :color="currentActionType === 'plan' ? 'purple-3' : 'slate-400'" :class="currentActionType === 'plan' ? 'bg-purple-10 text-weight-bolder' : ''" style="height: 20px; font-size: 9px;" label="Plan" @click="advanceStance('plan')" />
                            <q-btn flat dense size="xs" :color="currentActionType === 'build' ? 'amber-4' : 'slate-400'" :class="currentActionType === 'build' ? 'bg-amber-10 text-weight-bolder' : ''" style="height: 20px; font-size: 9px;" label="Build" @click="advanceStance('build')" />
                        </q-btn-group>
                    </div>
                </div>

                <!-- ORCHESTRATION STAGING DIALOG -->
                <q-dialog v-model="showOrchestrateDialog" dark persistent>
                    <q-card dark class="bg-slate-950 font-mono text-white" style="min-width: 580px; max-width: 720px; border: 1px solid #7c3aed;">
                        <q-card-section class="row items-center justify-between q-py-sm" style="background-color: #1e1b4b; border-bottom: 1px solid #4338ca;">
                            <div class="row items-center q-gutter-x-sm">
                                <q-icon name="bolt" color="amber-4" size="20px" />
                                <span class="text-subtitle2 font-bold text-cyan-2">ORCHESTRATE MODULE SUB-SCREENS</span>
                            </div>
                            <q-btn flat round dense icon="close" size="sm" color="slate-400" v-close-popup />
                        </q-card-section>

                        <q-card-section class="q-py-md">
                            <div class="text-caption text-slate-300 q-mb-md">
                                The scope for Step #{{ stepId }} has been marked <strong>READY TO ORCHESTRATE</strong>. Select the sub-screens to branch into parallel draft PLAN steps:
                            </div>

                            <div class="column q-gutter-y-sm" style="max-height: 380px; overflow-y: auto;">
                                <div 
                                    v-for="(sub, sIdx) in stagedSubplans" 
                                    :key="sIdx"
                                    class="row items-center justify-between q-pa-sm rounded-borders"
                                    :style="{
                                        backgroundColor: sub.selected ? '#0b1329' : '#0f172a',
                                        border: sub.selected ? '1px solid #0284c7' : '1px solid #1e293b'
                                    }"
                                >
                                    <div class="row items-center q-gutter-x-sm col">
                                        <q-checkbox v-model="sub.selected" dense color="cyan-4" />
                                        <div class="column col">
                                            <div class="row items-center q-gutter-x-xs">
                                                <span class="text-weight-bold text-cyan-2" style="font-size: 11px;">{{ sub.title }}</span>
                                                <span class="text-caption text-slate-500 font-mono">({{ sub.key }})</span>
                                            </div>
                                            <div class="text-caption text-slate-400 ellipsis" style="font-size: 10px;">{{ sub.description || 'No description provided' }}</div>
                                        </div>
                                    </div>

                                    <div class="row items-center q-gutter-x-xs font-mono text-caption" style="font-size: 10px;">
                                        <q-badge color="purple-9" text-color="white">{{ sub.suggestedArchetype }}</q-badge>
                                    </div>
                                </div>
                            </div>
                        </q-card-section>

                        <q-card-actions align="right" class="q-pa-md" style="border-top: 1px solid #1e293b;">
                            <q-btn flat label="Cancel" color="slate-400" dense no-caps class="q-px-sm" v-close-popup />
                            <q-btn 
                                color="deep-purple-7" 
                                text-color="white" 
                                icon="bolt" 
                                label="Spawn Parallel Plans" 
                                dense no-caps 
                                class="text-weight-bold q-px-md"
                                @click="confirmOrchestration"
                            />
                        </q-card-actions>
                    </q-card>
                </q-dialog>

                <!-- ARTIFACT SELECTOR MODAL FOR ACTIVE STEP -->
                <q-dialog v-model="showArtifactModal" position="top">
                    <q-card style="width: 600px; max-width: 90vw;" class="bg-slate-900 text-white shadow-24 border border-slate-700">
                        <q-card-section class="row items-center justify-between bg-black q-pa-sm border-bottom-dark">
                            <div class="text-subtitle2 text-weight-bold font-mono text-cyan-4">
                                <q-icon name="folder_open" class="q-mr-xs" /> ASSIGN TARGET ARTIFACT (STEP #{{ stepId }})
                            </div>
                            <q-btn flat round dense icon="close" text-color="white" v-close-popup />
                        </q-card-section>
                        <q-card-section class="q-pa-sm">
                            <component 
                                :is="'agi-artifact-palette'" 
                                @artifact-selected="onArtifactChosenForStep"
                            ></component>
                        </q-card-section>
                    </q-card>
                </q-dialog>

            </div>
        `
    };

    window.AgiStageHeader = AgiStageHeader;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['AgiStageHeader'] = AgiStageHeader;
    window.AgiComponents['agi-stage-header'] = AgiStageHeader;

    const registerComp = () => {
        const app = window.moqui?.webrootVueApp;
        if (app) {
            if (!app.component('AgiStageHeader')) app.component('AgiStageHeader', AgiStageHeader);
            if (!app.component('agi-stage-header')) app.component('agi-stage-header', AgiStageHeader);
        } else {
            setTimeout(registerComp, 25);
        }
    };
    registerComp();
})();