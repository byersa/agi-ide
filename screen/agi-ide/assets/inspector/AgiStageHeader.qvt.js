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
            isArchiving: { type: Boolean, default: false }
        },
        emits: [
            'update:activePort',
            'advance-to-build',
            'fork-step',
            'archive-branch',
            'set-stance',
            'locate-canvas',
            'open-artifact'
        ],
        methods: {
            setPort(port) {
                this.$emit('update:activePort', port);
            },
            advanceStance(stance) {
                this.$emit('set-stance', stance);
            }
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
                    
                    <!-- Left: Badges & Viewport Port Toggle -->
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

                        <template v-else>
                            <q-icon name="info" color="slate-500" size="16px" />
                            <span class="text-caption italic q-ml-xs" style="color: #94a3b8;">Select or create a pipeline initiative.</span>
                        </template>
                    </div>

                    <!-- Right: Target Artifact & DAG Locate -->
                    <div v-if="selectedStage && stepId" class="row items-center q-gutter-x-xs no-wrap">
                        <div v-if="displayTargetArtifactUri" class="row items-center q-gutter-x-xs text-caption text-cyan-3">
                            <q-icon name="code" size="12px" />
                            <span class="text-weight-bold" style="font-size: 10px;">{{ displayTargetArtifactUri.split('/').pop() }}</span>
                            <q-btn 
                                flat round dense size="xs" 
                                icon="open_in_new" 
                                color="amber-4" 
                                @click="$emit('open-artifact', displayTargetArtifactUri)"
                            >
                                <q-tooltip>Open in Workspace Viewport</q-tooltip>
                            </q-btn>
                        </div>

                        <q-btn flat round dense size="xs" icon="my_location" color="cyan-3" @click="$emit('locate-canvas', stepId)">
                            <q-tooltip>Scroll to this card on DAG Canvas</q-tooltip>
                        </q-btn>
                    </div>
                </div>

                <!-- TIER 2: ACTIONS (ADVANCE, FORK, ARCHIVE) & STANCE CONTROLS -->
                <div v-if="selectedStage" class="row items-center justify-between full-width q-pt-xs" style="border-top: 1px solid #1e293b; min-height: 30px;">
                    <div class="row items-center q-gutter-x-xs">
                        <q-btn 
                            v-if="!isDraft && currentActionType === 'plan'"
                            flat dense no-caps size="xs"
                            icon="handyman"
                            label="Advance to BUILD"
                            color="amber-3"
                            class="q-px-xs rounded-borders bg-amber-10 text-weight-bolder"
                            style="border: 1px solid #f59e0b; height: 22px;"
                            :loading="isAdvancing"
                            @click="$emit('advance-to-build')"
                        >
                            <q-tooltip>Spawn a downstream BUILD step inheriting this plan's egress contract</q-tooltip>
                        </q-btn>

                        <q-btn 
                            flat dense no-caps size="xs"
                            icon="fork_right"
                            label="Fork Branch"
                            color="amber-4"
                            class="q-px-xs rounded-borders"
                            style="border: 1px solid rgba(251, 191, 36, 0.4); height: 22px;"
                            :loading="isForking"
                            @click="$emit('fork-step')"
                        >
                            <q-tooltip>Clone input and branch new execution path</q-tooltip>
                        </q-btn>

                        <q-btn 
                            flat dense no-caps size="xs"
                            icon="archive"
                            label="Archive"
                            color="slate-400"
                            class="q-px-xs rounded-borders"
                            style="border: 1px solid #334155; height: 22px;"
                            :loading="isArchiving"
                            @click="$emit('archive-branch')"
                        >
                            <q-tooltip>Soft-archive this step and downstream sub-branch</q-tooltip>
                        </q-btn>
                    </div>

                    <!-- Stance Selector -->
                    <div class="row items-center q-gutter-x-xs">
                        <span class="text-slate-500 font-mono text-caption" style="font-size: 9px;">STANCE:</span>
                        <q-btn-group flat dense style="border: 1px solid #334155; border-radius: 3px;">
                            <q-btn 
                                flat dense size="xs" 
                                :color="currentActionType === 'discuss' ? 'cyan-3' : 'slate-400'" 
                                :class="currentActionType === 'discuss' ? 'bg-cyan-10 text-weight-bolder' : ''"
                                style="height: 20px; font-size: 9px;"
                                label="Discuss" 
                                @click="advanceStance('discuss')" 
                            />
                            <q-btn 
                                flat dense size="xs" 
                                :color="currentActionType === 'plan' ? 'purple-3' : 'slate-400'" 
                                :class="currentActionType === 'plan' ? 'bg-purple-10 text-weight-bolder' : ''"
                                style="height: 20px; font-size: 9px;"
                                label="Plan" 
                                @click="advanceStance('plan')" 
                            />
                            <q-btn 
                                flat dense size="xs" 
                                :color="currentActionType === 'build' ? 'amber-4' : 'slate-400'" 
                                :class="currentActionType === 'build' ? 'bg-amber-10 text-weight-bolder' : ''"
                                style="height: 20px; font-size: 9px;"
                                label="Build" 
                                @click="advanceStance('build')" 
                            />
                        </q-btn-group>
                    </div>
                </div>
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
