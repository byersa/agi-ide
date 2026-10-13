(function () {
    const AgiDiscussionViewer = {
        name: 'AgiDiscussionViewer',
        props: {
            payload: { type: Object, default: () => ({}) }
        },
        emits: ['module-action'],
        computed: {
            // Normalize payload whether fields sit at root or inside architectureSummary/planDetails
            d() {
                let base = this.payload || {};

                // If nested inside architectureSummary as an object or JSON string
                if (base.architectureSummary) {
                    if (typeof base.architectureSummary === 'object') {
                        base = Object.assign({}, base, base.architectureSummary);
                    } else if (typeof base.architectureSummary === 'string' && base.architectureSummary.trim().startsWith('{')) {
                        try {
                            const parsed = JSON.parse(base.architectureSummary);
                            base = Object.assign({}, base, parsed);
                        } catch (e) { }
                    }
                }

                // If nested inside planDetails or payload
                if (base.planDetails && typeof base.planDetails === 'object') {
                    base = Object.assign({}, base, base.planDetails);
                }
                if (base.payload && typeof base.payload === 'object') {
                    base = Object.assign({}, base, base.payload);
                }

                return {
                    scopeMaturity: base.scopeMaturity || 'EXPLORATORY',
                    readyToOrchestrate: Boolean(base.readyToOrchestrate),
                    replyMessage: base.replyMessage || base.message || '',
                    proposedModules: Array.isArray(base.proposedModules) ? base.proposedModules : [],
                    clarifyingQuestions: Array.isArray(base.clarifyingQuestions) ? base.clarifyingQuestions : [],
                    architecturalConsiderations: Array.isArray(base.architecturalConsiderations) ? base.architecturalConsiderations : []
                };
            }
        },
        methods: {
            formatMarkdown(text) {
                if (!text) return '<span class="text-slate-500 italic">No message recorded.</span>';
                if (window.showdown && typeof window.showdown.Converter === 'function') {
                    const converter = new window.showdown.Converter({ tables: true, simplifiedAutoLink: true });
                    return converter.makeHtml(text);
                }
                return text.replace(/\n/g, '<br/>');
            }
        },
        template: `
            <div class="agi-discussion-viewer column q-gutter-y-md font-mono text-white">
                
                <!-- 1. MATURITY & READINESS STATUS STRIP -->
                <div class="row items-center justify-between q-pa-sm rounded-borders" style="background-color: #0f172a; border: 1px solid #1e293b;">
                    <div class="row items-center q-gutter-x-sm">
                        <span class="text-caption font-bold text-slate-400" style="font-size: 11px;">SCOPE MATURITY:</span>
                        <q-badge color="deep-purple-9" text-color="white" class="font-mono text-weight-bold" style="font-size: 10px;">
                            {{ d.scopeMaturity }}
                        </q-badge>
                    </div>
                    <div class="row items-center q-gutter-x-sm">
                        <span class="text-caption text-slate-400 font-bold" style="font-size: 11px;">READY TO ORCHESTRATE:</span>
                        <q-badge :color="d.readyToOrchestrate ? 'teal-9' : 'amber-9'" text-color="white" class="font-mono text-weight-bold" style="font-size: 10px;">
                            {{ d.readyToOrchestrate ? 'YES' : 'IN REFINEMENT' }}
                        </q-badge>
                    </div>
                </div>

                <!-- 2. NARRATIVE / ANALYSIS (MARKDOWN) -->
                <div v-if="d.replyMessage" class="q-pa-md rounded-borders" style="background-color: #0b1329; border: 1px solid #1e3a5f;">
                    <div class="markdown-body font-mono text-caption text-slate-200" style="line-height: 1.6;" v-html="formatMarkdown(d.replyMessage)"></div>
                </div>

                <!-- 3. PROPOSED MODULES (THE 5 PILLARS) -->
                <div v-if="d.proposedModules.length > 0" class="column q-gutter-y-sm">
                    <div class="row items-center justify-between">
                        <span class="text-caption font-bold text-cyan-3" style="font-size: 12px;">
                            PROPOSED CORE PILLARS &amp; ARCHITECTURAL MODULES ({{ d.proposedModules.length }})
                        </span>
                        <span class="text-caption font-mono text-slate-400" style="font-size: 10px;">Target: component://nursinghome/screen/nursinghome/...</span>
                    </div>

                    <div class="column q-gutter-y-xs">
                        <div 
                            v-for="(mod, mIdx) in d.proposedModules" 
                            :key="mod.key" 
                            class="q-pa-md rounded-borders column q-gutter-y-xs" 
                            style="background-color: #0f172a; border: 1px solid #334155;"
                        >
                            <div class="row items-center justify-between">
                                <div class="row items-center q-gutter-x-sm">
                                    <div class="row items-center justify-center font-bold text-white rounded bg-cyan-9" style="width: 22px; height: 22px; font-size: 11px;">
                                        {{ mIdx + 1 }}
                                    </div>
                                    <span class="text-weight-bold text-white font-mono" style="font-size: 12px;">{{ mod.title }}</span>
                                    <q-badge color="slate-900" text-color="cyan-3" class="font-mono text-caption" style="border: 1px solid #0284c7;">
                                        {{ mod.key }}
                                    </q-badge>
                                </div>
                                <span class="text-caption font-mono text-amber-3 text-weight-bold" style="font-size: 11px;">
                                    Archetype: {{ mod.suggestedArchetype }}
                                </span>
                            </div>
                            <div class="text-caption text-slate-300 font-mono q-mt-xs" style="font-size: 11px; line-height: 1.5;">
                                {{ mod.description }}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 4. CLARIFYING QUESTIONS CALLOUT -->
                <div v-if="d.clarifyingQuestions.length > 0" class="column q-gutter-y-xs q-pa-md rounded-borders" style="background-color: #1a1528; border: 1px solid #7c3aed;">
                    <div class="row items-center q-gutter-x-xs text-purple-3 font-bold text-caption" style="font-size: 11px;">
                        <q-icon name="psychology" size="16px" />
                        <span>CLARIFYING QUESTIONS FOR REFINEMENT:</span>
                    </div>
                    <div class="column q-gutter-y-xs q-mt-xs">
                        <div v-for="(q, qIdx) in d.clarifyingQuestions" :key="qIdx" class="row items-start no-wrap q-gutter-x-sm text-caption text-slate-200 font-mono" style="font-size: 11px; line-height: 1.5;">
                            <q-icon name="arrow_right" size="16px" color="purple-4" class="q-mt-xs" />
                            <span>{{ q }}</span>
                        </div>
                    </div>
                </div>

                <!-- 5. ARCHITECTURAL & COMPLIANCE CONSIDERATIONS -->
                <div v-if="d.architecturalConsiderations.length > 0" class="column q-gutter-y-xs q-pa-md rounded-borders" style="background-color: #0f172a; border: 1px solid #1e293b;">
                    <div class="row items-center q-gutter-x-xs text-cyan-3 font-bold text-caption" style="font-size: 11px;">
                        <q-icon name="verified_user" size="16px" />
                        <span>ARCHITECTURAL &amp; COMPLIANCE CONSIDERATIONS:</span>
                    </div>
                    <div class="column q-gutter-y-xs q-mt-xs">
                        <div v-for="(c, cIdx) in d.architecturalConsiderations" :key="cIdx" class="row items-start no-wrap q-gutter-x-sm text-caption text-slate-300 font-mono" style="font-size: 11px; line-height: 1.5;">
                            <q-icon name="check" size="14px" color="cyan-4" class="q-mt-xs" />
                            <span>{{ c }}</span>
                        </div>
                    </div>
                </div>

            </div>
        `
    };

    window.AgiDiscussionViewer = AgiDiscussionViewer;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-discussion-viewer'] = AgiDiscussionViewer;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('agi-discussion-viewer', AgiDiscussionViewer);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();