(function () {
    const AgiPlanSpecViewer = {
        name: 'AgiPlanSpecViewer',
        props: {
            payload: { type: Object, default: () => ({}) }
        },
        emits: ['open-artifact'],
        computed: {
            plan() {
                let p = this.payload || {};

                const parseIfString = (val) => {
                    if (typeof val !== 'string') return val;
                    const trimmed = val.trim();
                    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                        try { return JSON.parse(trimmed); } catch (e) { return null; }
                    }
                    return null;
                };

                if (p.payloadDetails && typeof p.payloadDetails === 'object') {
                    p = Object.assign({}, p, p.payloadDetails);
                }
                if (p.payload && typeof p.payload === 'object') {
                    p = Object.assign({}, p, p.payload);
                }

                if (p.message) {
                    const parsedMsg = parseIfString(p.message);
                    if (parsedMsg && typeof parsedMsg === 'object') {
                        p = Object.assign({}, p, parsedMsg);
                    }
                }

                if (p.planDetails) {
                    const parsedPlan = parseIfString(p.planDetails) || (typeof p.planDetails === 'object' ? p.planDetails : null);
                    if (parsedPlan && typeof parsedPlan === 'object') {
                        p = Object.assign({}, p, parsedPlan);
                    }
                }

                if (p.architectureSummary) {
                    const parsedArch = parseIfString(p.architectureSummary) || (typeof p.architectureSummary === 'object' ? p.architectureSummary : null);
                    if (parsedArch && typeof parsedArch === 'object') {
                        p = Object.assign({}, p, parsedArch);
                    }
                }

                return {
                    status: p.status || 'PLANNED',
                    recommendedArchetype: p.recommendedArchetype || 'default',
                    recommendedArchetypeUri: p.recommendedArchetypeUri || '',
                    targetArtifactUri: p.targetArtifactUri || p.createdArtifactUri || '',
                    suggestedEntities: Array.isArray(p.suggestedEntities) ? p.suggestedEntities : [],
                    screenContract: p.screenContract && typeof p.screenContract === 'object' ? p.screenContract : null,
                    entityFieldBindings: Array.isArray(p.entityFieldBindings) ? p.entityFieldBindings : [],
                    securityAndHipaaRules: Array.isArray(p.securityAndHipaaRules) ? p.securityAndHipaaRules : [],
                    architectureSummary: typeof p.architectureSummary === 'string' ? p.architectureSummary : (p.message && typeof p.message === 'string' && !p.message.trim().startsWith('{') ? p.message : ''),
                    formulationSteps: Array.isArray(p.formulationSteps) ? p.formulationSteps : []
                };
            }
        },
        template: `
            <div class="agi-plan-spec-viewer column q-gutter-y-md font-mono text-white">
                
                <!-- 1. ARCHETYPE & STATUS STRIP -->
                <div class="row items-center justify-between q-pa-sm rounded-borders" style="background-color: #0f172a; border: 1px solid #1e293b;">
                    <div class="row items-center q-gutter-x-sm">
                        <span class="text-caption font-bold text-slate-400" style="font-size: 11px;">RECOMMENDED ARCHETYPE:</span>
                        <span class="q-px-sm rounded font-mono text-caption text-weight-bold" style="background-color: #581c87; color: #ffffff; font-size: 11px; padding: 2px 8px;">
                            {{ plan.recommendedArchetype }}
                        </span>
                        <span v-if="plan.recommendedArchetypeUri" class="text-caption text-slate-500 font-mono" style="font-size: 10px;">
                            ({{ plan.recommendedArchetypeUri.split('/').pop() }})
                        </span>
                    </div>
                    <div class="row items-center q-gutter-x-sm">
                        <span class="text-caption font-bold text-cyan-3" style="font-size: 11px;">
                            STATUS: {{ plan.status }}
                        </span>
                    </div>
                </div>

                <!-- 2. BOUND UDM ENTITIES -->
                <div v-if="plan.suggestedEntities.length > 0" class="column q-gutter-y-xs q-pa-sm rounded-borders" style="background-color: #0f172a; border: 1px solid #1e293b;">
                    <span class="text-caption font-bold text-slate-400 q-mb-xs block" style="font-size: 11px;">BOUND UDM ENTITIES:</span>
                    <div class="row q-gutter-xs">
                        <span 
                            v-for="ent in plan.suggestedEntities" 
                            :key="ent"
                            class="q-px-sm rounded font-mono text-caption text-weight-bold" 
                            style="background-color: #020617; border: 1px solid #0284c7; color: #38bdf8; font-size: 10px; padding: 2px 8px;"
                        >
                            {{ ent }}
                        </span>
                    </div>
                </div>

                <!-- 3. SCREEN CONTRACT: PARAMETERS & PERMISSIONS -->
                <div v-if="plan.screenContract" class="column q-gutter-y-sm q-pa-sm rounded-borders" style="background-color: #0f172a; border: 1px solid #1e293b;">
                    <span class="text-caption font-bold text-cyan-3 block" style="font-size: 11px;">SCREEN CONTRACT:</span>
                    
                    <!-- Permissions -->
                    <div v-if="plan.screenContract.requiredPermissions && plan.screenContract.requiredPermissions.length > 0">
                        <span class="text-caption font-bold text-slate-400 q-mb-xs block" style="font-size: 10px;">REQUIRED PERMISSIONS:</span>
                        <div class="row q-gutter-xs">
                            <span 
                                v-for="perm in plan.screenContract.requiredPermissions" 
                                :key="perm"
                                class="q-px-sm rounded font-mono text-caption text-weight-bold" 
                                style="background-color: #020617; border: 1px solid #d97706; color: #fde047; font-size: 10px; padding: 2px 8px;"
                            >
                                {{ perm }}
                            </span>
                        </div>
                    </div>

                    <!-- Required / Optional Parameters -->
                    <div class="row q-col-gutter-sm q-mt-xs">
                        <div v-if="plan.screenContract.requiredParameters && plan.screenContract.requiredParameters.length > 0" class="col-6">
                            <span class="text-caption font-bold text-slate-400 q-mb-xs block" style="font-size: 10px;">REQUIRED PARAMETERS:</span>
                            <div class="row q-gutter-xs">
                                <span 
                                    v-for="param in plan.screenContract.requiredParameters" 
                                    :key="param"
                                    class="q-px-sm rounded font-mono text-caption text-weight-bold" 
                                    style="background-color: #020617; border: 1px solid #0d9488; color: #5eead4; font-size: 10px; padding: 2px 8px;"
                                >
                                    {{ param }}
                                </span>
                            </div>
                        </div>

                        <div v-if="plan.screenContract.optionalParameters && plan.screenContract.optionalParameters.length > 0" class="col-6">
                            <span class="text-caption font-bold text-slate-400 q-mb-xs block" style="font-size: 10px;">OPTIONAL PARAMETERS:</span>
                            <div class="row q-gutter-xs">
                                <span 
                                    v-for="param in plan.screenContract.optionalParameters" 
                                    :key="param"
                                    class="q-px-sm rounded font-mono text-caption text-weight-bold" 
                                    style="background-color: #020617; border: 1px solid #334155; color: #94a3b8; font-size: 10px; padding: 2px 8px;"
                                >
                                    {{ param }}
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- Contract Transitions -->
                    <div v-if="plan.screenContract.transitions && plan.screenContract.transitions.length > 0" class="column q-gutter-y-xs q-mt-xs">
                        <span class="text-caption font-bold text-slate-400 block" style="font-size: 10px;">DECLARED TRANSITIONS:</span>
                        <div class="column q-gutter-y-xs">
                            <div 
                                v-for="(tr, tIdx) in plan.screenContract.transitions" 
                                :key="tIdx"
                                class="row items-center justify-between q-pa-xs rounded font-mono text-caption"
                                style="background-color: #020617; border: 1px solid #1e293b;"
                            >
                                <span class="text-weight-bold text-cyan-2" style="font-size: 10px;">{{ tr.name }}</span>
                                <span class="text-amber-3" style="font-size: 10px;">{{ tr.service || tr.method }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 4. ENTITY FIELD BINDINGS (POLYMORPHIC) -->
                <div v-if="plan.entityFieldBindings.length > 0" class="column q-gutter-y-xs q-pa-sm rounded-borders" style="background-color: #0f172a; border: 1px solid #1e293b;">
                    <span class="text-caption font-bold text-slate-400 q-mb-xs block" style="font-size: 11px;">FIELD BINDINGS:</span>
                    <div class="column q-gutter-y-xs">
                        <div 
                            v-for="(b, bIdx) in plan.entityFieldBindings" 
                            :key="bIdx" 
                            class="q-pa-sm rounded font-mono text-caption" 
                            style="background-color: #020617; border: 1px solid #334155;"
                        >
                            <!-- Mode 1: Discrete Field Binding (fieldName present) -->
                            <template v-if="b.fieldName">
                                <div class="row items-center justify-between">
                                    <div class="row items-center q-gutter-x-xs no-wrap ellipsis">
                                        <span class="text-weight-bold text-cyan-3" style="font-size: 11px;">{{ b.entityName || b.entity }}</span>
                                        <span class="text-slate-400">.</span>
                                        <span class="text-weight-bold text-white" style="font-size: 11px;">{{ b.fieldName }}</span>
                                    </div>
                                    <div class="row items-center q-gutter-x-xs">
                                        <q-badge v-if="b.encrypt" color="purple-9" text-color="white" style="font-size: 9px; padding: 1px 4px;">
                                            ENCRYPTED
                                        </q-badge>
                                        <span v-if="b.label" class="text-amber-3 text-caption" style="font-size: 10px;">
                                            {{ b.label }}
                                        </span>
                                    </div>
                                </div>
                            </template>

                            <!-- Mode 2: Grouped Entity-to-Widget Binding (fields list or targetWidget present) -->
                            <template v-else>
                                <div class="row items-center justify-between">
                                    <span class="text-weight-bold text-cyan-3" style="font-size: 11px;">{{ b.entity || b.entityName }}</span>
                                    <span v-if="b.targetWidget || b.targetForm" class="text-amber-3 text-weight-bold" style="font-size: 11px;">
                                        Target: {{ b.targetWidget || b.targetForm }}
                                    </span>
                                </div>
                                <div class="q-mt-xs text-caption text-slate-400" style="font-size: 10px;">
                                    Fields: <span class="text-slate-200">{{ Array.isArray(b.fields) ? b.fields.join(', ') : 'All' }}</span>
                                </div>
                            </template>
                        </div>
                    </div>
                </div>

                <!-- 5. SECURITY & HIPAA RULES -->
                <div v-if="plan.securityAndHipaaRules.length > 0" class="column q-gutter-y-xs q-pa-md rounded-borders" style="background-color: #1a1528; border: 1px solid #7c3aed;">
                    <div class="row items-center q-gutter-x-xs text-purple-3 font-bold text-caption" style="font-size: 11px;">
                        <q-icon name="security" size="16px" />
                        <span>SECURITY &amp; HIPAA INVARIANTS:</span>
                    </div>
                    <div class="column q-gutter-y-xs q-mt-xs">
                        <div v-for="(rule, rIdx) in plan.securityAndHipaaRules" :key="rIdx" class="row items-start no-wrap q-gutter-x-sm text-caption text-slate-200 font-mono" style="font-size: 11px; line-height: 1.5;">
                            <q-icon name="shield" size="14px" color="purple-4" class="q-mt-xs" />
                            <span>{{ rule }}</span>
                        </div>
                    </div>
                </div>

                <!-- 6. ARCHITECTURE SUMMARY -->
                <div v-if="plan.architectureSummary" class="q-pa-md rounded-borders text-caption" style="background-color: #0f172a; border: 1px solid #1e293b; color: #e2e8f0;">
                    <div class="text-weight-bold text-cyan-3 q-mb-sm" style="font-size: 11px;">Architecture Summary:</div>
                    <div class="font-mono text-caption text-slate-200" style="line-height: 1.6; font-size: 11px;">
                        {{ plan.architectureSummary }}
                    </div>
                </div>

                <!-- 7. FORMULATION STEPS -->
                <div v-if="plan.formulationSteps.length > 0" class="column q-gutter-y-sm q-pa-md rounded-borders" style="background-color: #0f172a; border: 1px solid #1e293b;">
                    <span class="text-caption font-bold text-cyan-3 q-mb-xs block" style="font-size: 11px;">FORMULATION STEPS:</span>
                    <div class="column q-gutter-y-xs">
                        <div v-for="(step, sIdx) in plan.formulationSteps" :key="sIdx" class="row no-wrap items-start q-gutter-x-sm font-mono text-caption" style="color: #cbd5e1; font-size: 11px; line-height: 1.5;">
                            <q-icon name="check_circle" size="14px" color="cyan-4" class="q-mt-xs" />
                            <span>{{ step }}</span>
                        </div>
                    </div>
                </div>

            </div>
        `
    };

    window.AgiPlanSpecViewer = AgiPlanSpecViewer;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['AgiPlanSpecViewer'] = AgiPlanSpecViewer;
    window.AgiComponents['agi-plan-spec-viewer'] = AgiPlanSpecViewer;

    const registerComp = () => {
        const app = window.moqui?.webrootVueApp;
        if (app) {
            if (!app.component('AgiPlanSpecViewer')) app.component('AgiPlanSpecViewer', AgiPlanSpecViewer);
            if (!app.component('agi-plan-spec-viewer')) app.component('agi-plan-spec-viewer', AgiPlanSpecViewer);
        } else {
            setTimeout(registerComp, 25);
        }
    };
    registerComp();
})();