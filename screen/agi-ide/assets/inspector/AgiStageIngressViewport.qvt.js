(function () {
    const AgiStageIngressViewport = {
        name: 'AgiStageIngressViewport',
        props: {
            selectedStage: { type: Object, default: () => null },
            selectedParentStage: { type: Object, default: () => null },
            ingressPayload: { type: Object, default: () => null },
            formattedIngressJsonString: { type: String, default: '' },
            formattedEgressJsonString: { type: String, default: '' },
            computedDeltaSummary: {
                type: Object,
                default: () => ({ added: [], removed: [], changed: [] })
            },
            currentActionType: { type: String, default: 'discuss' },
            isDraft: { type: Boolean, default: true },
            isDispatching: { type: Boolean, default: false },
            stepId: { type: String, default: '' },
            modelValueDirective: { type: String, default: '' },
            modelValueTargetArtifact: { type: String, default: '' },
            modelValueMantleInvariants: { type: Boolean, default: true }
        },
        emits: [
            'update:modelValueDirective',
            'update:modelValueTargetArtifact',
            'update:modelValueMantleInvariants',
            'dispatch-stage',
            'copy-clipboard'
        ],
        data() {
            return {
                showIngressDiff: false,
                editIngressSpec: false,
                customArchetype: '',
                customEntitiesText: '',
                customRawJson: ''
            };
        },
        computed: {
            directiveProxy: {
                get() { return this.modelValueDirective; },
                set(val) { this.$emit('update:modelValueDirective', val); }
            },
            targetArtifactProxy: {
                get() { return this.modelValueTargetArtifact; },
                set(val) { this.$emit('update:modelValueTargetArtifact', val); }
            },
            mantleInvariantsProxy: {
                get() { return this.modelValueMantleInvariants; },
                set(val) { this.$emit('update:modelValueMantleInvariants', val); }
            },
            // Robust unwrapping for parent context
            parentContext() {
                let p = this.ingressPayload || {};

                const parseIfString = (val) => {
                    if (typeof val !== 'string') return val;
                    const trimmed = val.trim();
                    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                        try { return JSON.parse(trimmed); } catch (e) { return null; }
                    }
                    return null;
                };

                // 1. If the entire payload is a string
                const directParsed = parseIfString(p);
                if (directParsed && typeof directParsed === 'object') {
                    p = directParsed;
                }

                // 2. Unpack known Moqui envelope wrappers
                if (p.payloadDetails) {
                    const parsed = parseIfString(p.payloadDetails) || p.payloadDetails;
                    if (typeof parsed === 'object') p = Object.assign({}, p, parsed);
                }
                if (p.payload) {
                    const parsed = parseIfString(p.payload) || p.payload;
                    if (typeof parsed === 'object') p = Object.assign({}, p, parsed);
                }
                if (p.payloadContent || p.payloadText || p.content) {
                    const parsed = parseIfString(p.payloadContent || p.payloadText || p.content);
                    if (parsed && typeof parsed === 'object') p = Object.assign({}, p, parsed);
                }

                // 3. 🎯 CRITICAL: Unpack `message` where DISCUSS stores the structured JSON string
                if (p.message) {
                    const parsed = parseIfString(p.message);
                    if (parsed && typeof parsed === 'object') {
                        p = Object.assign({}, p, parsed);
                    }
                }

                // 4. Unpack architectureSummary
                if (p.architectureSummary) {
                    const parsed = parseIfString(p.architectureSummary) || (typeof p.architectureSummary === 'object' ? p.architectureSummary : null);
                    if (parsed && typeof parsed === 'object') {
                        p = Object.assign({}, p, parsed);
                    }
                }

                // 5. Unpack planDetails if present
                if (p.planDetails) {
                    const parsed = parseIfString(p.planDetails) || (typeof p.planDetails === 'object' ? p.planDetails : null);
                    if (parsed && typeof parsed === 'object') {
                        p = Object.assign({}, p, parsed);
                    }
                }

                return {
                    status: p.status || p.scopeMaturity || 'INHERITED SPEC',
                    proposedModules: Array.isArray(p.proposedModules) ? p.proposedModules : [],
                    clarifyingQuestions: Array.isArray(p.clarifyingQuestions) ? p.clarifyingQuestions : [],
                    recommendedArchetype: p.recommendedArchetype || '',
                    suggestedEntities: Array.isArray(p.suggestedEntities) ? p.suggestedEntities : []
                };
            },
        },
        watch: {
            ingressPayload: {
                immediate: true,
                handler(val) {
                    if (val) {
                        this.customArchetype = val.recommendedArchetype || '';
                        this.customEntitiesText = Array.isArray(val.suggestedEntities) ? val.suggestedEntities.join(', ') : '';
                        this.customRawJson = JSON.stringify(val, null, 2);
                    }
                }
            }
        },
        methods: {
            appendDirectiveSnippet(text) {
                if (!text) return;
                const current = (this.directiveProxy || '').trim();
                this.directiveProxy = current ? `${current}\n\n${text}` : text;
                this.$q?.notify({
                    type: 'info',
                    message: 'Context inserted into directive prompt.',
                    icon: 'add_comment',
                    timeout: 1000
                });
            },
            dispatchCompute() {
                this.$emit('dispatch-stage', {
                    editIngressSpec: this.editIngressSpec,
                    customArchetype: this.customArchetype,
                    customEntitiesText: this.customEntitiesText,
                    customRawJson: this.customRawJson
                });
            }
        },
        template: `
            <div class="agi-stage-ingress-viewport fit column no-wrap font-mono text-white overflow-hidden">
                
                <!-- TOP STRIP -->
                <div class="row items-center justify-between q-px-md" style="background-color: #0b1329; border-bottom: 1px solid #1e293b; height: 36px; min-height: 36px; flex: 0 0 36px;">
                    <div class="row items-center q-gutter-x-sm">
                        <q-icon name="login" size="15px" color="cyan-4" />
                        <span class="text-caption text-weight-bolder text-cyan-3" style="font-size: 11px;">
                            INGRESS CONTRACT: STEP #{{ stepId }}
                        </span>
                        <span v-if="selectedStage?.parentStepId" class="text-caption text-slate-400" style="font-size: 10px;">
                            (Inherited from Parent #{{ selectedStage.parentStepId }})
                        </span>
                    </div>

                    <div class="row items-center q-gutter-x-md">
                        <div v-if="isDraft" class="row items-center q-gutter-x-xs">
                            <span class="text-caption font-mono text-weight-bold" :class="editIngressSpec ? 'text-amber-3' : 'text-slate-400'" style="font-size: 10px;">EDIT SPEC OVERRIDES:</span>
                            <q-toggle v-model="editIngressSpec" dense color="amber-4" size="xs" />
                        </div>

                        <div class="row items-center q-gutter-x-xs">
                            <span class="text-caption font-mono text-slate-300" style="font-size: 10px;">DIFF VS PRIOR:</span>
                            <q-toggle v-model="showIngressDiff" dense color="cyan-4" size="xs" />
                        </div>

                        <q-btn flat round dense size="xs" icon="content_copy" style="color: #94a3b8;" @click="$emit('copy-clipboard', directiveProxy, 'Ingress Directive')">
                            <q-tooltip>Copy Directive</q-tooltip>
                        </q-btn>
                    </div>
                </div>

                <!-- SCROLLABLE BODY -->
                <div class="col q-pa-lg overflow-auto" style="flex: 1 1 0%; min-height: 0; height: 100%; overflow-y: auto !important;">
                    <div class="column q-gutter-y-lg" style="max-width: 1200px; margin: 0 auto;">

                        <!-- INHERITED UPSTREAM CONTEXT CARD (BRIDGE) -->
                        <div v-if="ingressPayload" class="column q-gutter-y-sm q-pa-md rounded-borders" style="background-color: #0b1329; border: 1px solid #0284c7;">
                            <div class="row items-center justify-between">
                                <div class="row items-center q-gutter-x-xs">
                                    <q-icon name="account_tree" size="14px" color="cyan-3" />
                                    <span class="text-caption font-bold text-cyan-2" style="font-size: 11px;">
                                        INHERITED UPSTREAM CONTEXT (PARENT STEP #{{ selectedStage?.parentStepId || selectedParentStage?.pipelineStepId }}):
                                    </span>
                                </div>
                                <q-badge color="cyan-9" text-color="white" class="font-mono text-weight-bold" style="font-size: 9px;">
                                    {{ parentContext.status }}
                                </q-badge>
                            </div>

                            <!-- Proposed Modules Shortcuts -->
                            <div v-if="parentContext.proposedModules.length > 0" class="column q-gutter-y-xs q-mt-xs">
                                <span class="text-caption text-slate-400 font-bold" style="font-size: 10px;">PROPOSED MODULES FOR ORCHESTRATION:</span>
                                <div class="row q-gutter-xs">
                                    <q-chip 
                                        v-for="mod in parentContext.proposedModules" 
                                        :key="mod.key"
                                        clickable dark dense
                                        color="slate-900"
                                        text-color="cyan-3"
                                        style="border: 1px solid #1e293b; font-size: 10px;"
                                        @click="appendDirectiveSnippet('Orchestrate implementation for module: ' + mod.title + ' (' + mod.key + ') with ' + mod.suggestedArchetype + ' archetype.')"
                                    >
                                        <q-icon name="add" size="10px" class="q-mr-xs" color="cyan-4" />
                                        <strong>{{ mod.title }}</strong>
                                        <q-tooltip>Click to add module requirements to your directive prompt below</q-tooltip>
                                    </q-chip>
                                </div>
                            </div>

                            <!-- Clarifying Questions Callout -->
                            <div v-if="parentContext.clarifyingQuestions.length > 0" class="column q-gutter-y-xs q-mt-xs">
                                <span class="text-caption text-amber-3 font-bold" style="font-size: 10px;">KEY ARCHITECTURAL QUESTIONS ANSWERED / TO RESOLVE:</span>
                                <div v-for="(q, qIdx) in parentContext.clarifyingQuestions" :key="qIdx" class="row items-start no-wrap q-gutter-x-xs text-caption text-slate-300 font-mono" style="font-size: 10px;">
                                    <q-icon name="help_outline" size="12px" color="amber-4" class="q-mt-xs" />
                                    <span>{{ q }}</span>
                                </div>
                            </div>

                            <!-- Plan Specs -->
                            <div v-if="parentContext.recommendedArchetype || parentContext.suggestedEntities.length > 0" class="row items-center q-gutter-x-sm text-caption text-slate-300 font-mono" style="font-size: 10px;">
                                <span v-if="parentContext.recommendedArchetype">Archetype: <strong>{{ parentContext.recommendedArchetype }}</strong></span>
                                <span v-if="parentContext.suggestedEntities.length > 0">Entities: <strong>{{ parentContext.suggestedEntities.join(', ') }}</strong></span>
                            </div>
                        </div>

                        <!-- TARGET ARTIFACT INPUT -->
                        <div class="column q-gutter-y-sm">
                            <label class="text-caption font-mono text-weight-bold text-slate-300" style="font-size: 11px;">TARGET ARTIFACT LOCATION:</label>
                            <q-input 
                                v-model="targetArtifactProxy" 
                                dense dark outlined 
                                color="cyan-3"
                                class="font-mono text-caption"
                                input-class="font-mono text-cyan-2"
                                style="background-color: #020617; border-radius: 4px;"
                                placeholder="component://nursinghome/screen/..."
                            />
                        </div>

                        <!-- DIRECTIVE PROMPT TEXTAREA -->
                        <div class="column q-gutter-y-sm">
                            <div class="row items-center justify-between">
                                <label class="text-caption font-mono text-weight-bold text-slate-300" style="font-size: 11px;">DIRECTIVE / DISPATCH PROMPT:</label>
                                <span v-if="!isDraft" class="text-caption text-slate-500 font-mono" style="font-size: 10px;">(Committed Prompt)</span>
                            </div>
                            <q-input 
                                v-model="directiveProxy" 
                                type="textarea" 
                                rows="6" 
                                dense dark outlined 
                                color="cyan-3"
                                class="font-mono text-caption"
                                input-class="font-mono text-slate-100"
                                style="background-color: #020617; border-radius: 4px;"
                                placeholder="Enter step directive or transition instructions..."
                            />
                        </div>

                        <!-- SPEC OVERRIDES PANEL -->
                        <div v-if="editIngressSpec" class="column q-gutter-y-md q-pa-md rounded-borders" style="background-color: #0f172a; border: 1px solid #f59e0b;">
                            <div class="row items-center justify-between">
                                <span class="text-caption text-weight-bold text-amber-3" style="font-size: 11px;">
                                    INGRESS SPEC OVERRIDES (PRE-FLIGHT CONFIGURATION FOR BUILD):
                                </span>
                                <span class="text-caption font-mono text-slate-400" style="font-size: 10px;">Editing will clone and isolate the ingress contract</span>
                            </div>

                            <div class="row q-col-gutter-md">
                                <div class="col-6">
                                    <label class="text-caption font-mono text-slate-300 q-mb-xs block" style="font-size: 10px;">OVERRIDE ARCHETYPE:</label>
                                    <q-input v-model="customArchetype" dense dark outlined color="amber-4" class="font-mono text-caption" input-class="font-mono text-amber-2" style="background-color: #020617;" placeholder="master-detail, single-form, etc." />
                                </div>
                                <div class="col-6">
                                    <label class="text-caption font-mono text-slate-300 q-mb-xs block" style="font-size: 10px;">BOUND ENTITIES (COMMA-SEPARATED):</label>
                                    <q-input v-model="customEntitiesText" dense dark outlined color="amber-4" class="font-mono text-caption" input-class="font-mono text-cyan-2" style="background-color: #020617;" placeholder="mantle.facility.Facility, mantle.party.Person..." />
                                </div>
                            </div>

                            <div class="column q-gutter-y-xs q-mt-sm">
                                <label class="text-caption font-mono text-slate-300" style="font-size: 10px;">CLEANSED INGRESS JSON CONTRACT:</label>
                                <q-input v-model="customRawJson" type="textarea" rows="10" dense dark outlined color="amber-4" class="font-mono text-caption" input-class="font-mono text-slate-200" style="background-color: #020617; font-size: 11px;" />
                            </div>
                        </div>

                        <!-- DELTA DIFF VIEW -->
                        <div v-if="showIngressDiff" class="column q-gutter-y-sm q-pa-md rounded-borders" style="background-color: #0f172a; border: 1px solid #0284c7;">
                            <div class="row items-center justify-between">
                                <span class="text-caption text-weight-bold text-cyan-3" style="font-size: 11px;">DELTA COMPARISON (INGRESS VS EGRESS):</span>
                                <div class="row items-center q-gutter-x-sm text-caption font-mono" style="font-size: 10px;">
                                    <span class="text-teal-4 text-weight-bold">+{{ computedDeltaSummary.added.length }} added</span>
                                    <span class="text-amber-4 text-weight-bold">~{{ computedDeltaSummary.changed.length }} changed</span>
                                    <span class="text-rose-4 text-weight-bold">-{{ computedDeltaSummary.removed.length }} removed</span>
                                </div>
                            </div>

                            <div class="row q-col-gutter-md q-mt-xs">
                                <div class="col-6">
                                    <div class="text-caption text-slate-400 font-bold q-mb-xs" style="font-size: 10px;">PREDECESSOR CONTRACT (INPUT):</div>
                                    <pre class="bg-black q-pa-sm rounded font-mono text-caption text-slate-300" style="min-height: 200px; max-height: 360px; overflow: auto; font-size: 11px; line-height: 1.4;">{{ formattedIngressJsonString || 'No ingress contract payload.' }}</pre>
                                </div>
                                <div class="col-6">
                                    <div class="text-caption text-slate-400 font-bold q-mb-xs" style="font-size: 10px;">CURRENT STAGE EGRESS (OUTPUT):</div>
                                    <pre class="bg-black q-pa-sm rounded font-mono text-caption text-cyan-2" style="min-height: 200px; max-height: 360px; overflow: auto; font-size: 11px; line-height: 1.4;">{{ formattedEgressJsonString || 'Awaiting compute execution.' }}</pre>
                                </div>
                            </div>
                        </div>

                        <!-- ACTIONS FOOTER -->
                        <div class="row items-center justify-between q-pa-md rounded-borders q-mt-sm" style="background-color: #0f172a; border: 1px solid #1e293b;">
                            <div class="row items-center q-gutter-x-sm">
                                <span class="text-caption font-mono text-slate-200" style="font-size: 11px;">Mantle UDM Invariants Enforced</span>
                                <q-toggle v-model="mantleInvariantsProxy" dense color="cyan-4" size="sm" />
                            </div>

                            <q-btn 
                                :color="currentActionType === 'build' ? 'amber-9' : (currentActionType === 'plan' ? 'deep-purple-7' : 'primary')"
                                :text-color="currentActionType === 'build' ? 'black' : 'white'"
                                icon="bolt" 
                                :label="'Dispatch ' + currentActionType.toUpperCase() + ' Compute'" 
                                dense no-caps 
                                class="text-weight-bold q-px-lg q-py-xs font-mono"
                                style="height: 32px;"
                                :loading="isDispatching"
                                @click="dispatchCompute"
                            />
                        </div>

                    </div>
                </div>

            </div>
        `
    };

    window.AgiStageIngressViewport = AgiStageIngressViewport;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['AgiStageIngressViewport'] = AgiStageIngressViewport;
    window.AgiComponents['agi-stage-ingress-viewport'] = AgiStageIngressViewport;

    const registerComp = () => {
        const app = window.moqui?.webrootVueApp;
        if (app) {
            if (!app.component('AgiStageIngressViewport')) app.component('AgiStageIngressViewport', AgiStageIngressViewport);
            if (!app.component('agi-stage-ingress-viewport')) app.component('agi-stage-ingress-viewport', AgiStageIngressViewport);
        } else {
            setTimeout(registerComp, 25);
        }
    };
    registerComp();
})();