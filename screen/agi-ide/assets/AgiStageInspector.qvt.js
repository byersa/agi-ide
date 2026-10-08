(function () {
    const AgiStageInspector = {
        name: 'AgiStageInspector',
        emits: ['stage-dispatched', 'stage-mutated', 'advance-stance', 'locate-stage', 'open-artifact'],
        props: {
            discussionId: { type: String, default: '' },
            selectedStage: { type: Object, default: () => null },
            selectedParentStage: { type: Object, default: () => null },
            targetComponent: { type: String, default: 'nursinghome' }
        },
        data() {
            return {
                isDispatching: false,
                loadingPayload: false,
                isForking: false,
                isArchiving: false,

                // Cache for fetched staged payloads: { [payloadId]: parsedObject }
                payloadCache: {},

                // Port Selection: 'IN' (Ingress Contract) | 'OUT' (Egress Artifact)
                activePort: 'OUT',

                // Ingress View: Direct view vs Delta diff toggle
                showIngressDiff: false,

                // Egress View Tab: 'contract' | 'json' | 'prompt' | 'raw'
                activeOutputTab: 'contract',

                // Editable Staging State for Drafting & Forking
                inputDirective: '',
                inputTargetArtifact: '',
                inputMantleInvariants: true
            };
        },
        computed: {
            stepId() {
                if (!this.selectedStage) return '';
                return this.selectedStage.pipelineStepId || this.selectedStage.stageId || '';
            },
            isDraft() {
                if (!this.selectedStage) return false;
                return this.selectedStage.statusId === 'PlsDraft' || !this.selectedStage.egressPayloadId;
            },
            currentActionType() {
                if (!this.selectedStage) return 'discuss';
                return (this.selectedStage.actionType || 'discuss').toLowerCase();
            },
            displayTargetArtifactUri() {
                if (!this.selectedStage) return '';
                return this.selectedStage.targetArtifactUri
                    || this.resolvedEgressPayload?.targetArtifactUri
                    || this.resolvedEgressPayload?.createdArtifactUri
                    || '';
            },
            themeStyle() {
                const type = this.currentActionType;
                if (type === 'build') {
                    return { bg: '#f59e0b', text: '#000000', border: '#b45309', light: '#fef3c7', icon: 'handyman', label: 'BUILD' };
                }
                if (type === 'plan') {
                    return { bg: '#7c3aed', text: '#ffffff', border: '#6d28d9', light: '#ede9fe', icon: 'architecture', label: 'PLAN' };
                }
                return { bg: '#0284c7', text: '#ffffff', border: '#0369a1', light: '#e0f2fe', icon: 'chat', label: 'DISCUSS' };
            },
            rawStageBody() {
                if (!this.selectedStage) return '';
                const s = this.selectedStage;
                return s.egressJsonData || s.fullText || s.content || s.message || s.text || s.directivePrompt || s.label || '';
            },
            resolvedEgressPayload() {
                if (!this.selectedStage) return null;

                const egressId = this.selectedStage.egressPayloadId || this.selectedStage.stagedPayloadId;
                if (egressId && this.payloadCache[String(egressId)]) {
                    return this.payloadCache[String(egressId)];
                }

                if (this.selectedStage.egressJsonData) {
                    const parsed = this.tryParseJson(this.selectedStage.egressJsonData);
                    if (this.isValidPayload(parsed)) return parsed;
                }

                const directParse = this.tryParseJson(this.rawStageBody);
                if (this.isValidPayload(directParse)) return directParse;

                const extractedJson = this.extractJsonFromText(this.rawStageBody);
                if (this.isValidPayload(extractedJson)) return extractedJson;

                return null;
            },
            resolvedIngressPayload() {
                if (!this.selectedStage) return null;

                const ingressId = this.selectedStage.ingressPayloadId;
                if (ingressId && this.payloadCache[String(ingressId)]) {
                    return this.payloadCache[String(ingressId)];
                }

                if (this.selectedStage.ingressJsonData) {
                    const parsed = this.tryParseJson(this.selectedStage.ingressJsonData);
                    if (this.isValidPayload(parsed)) return parsed;
                }

                if (this.selectedParentStage) {
                    const parentEgressId = this.selectedParentStage.egressPayloadId || this.selectedParentStage.stagedPayloadId;
                    if (parentEgressId && this.payloadCache[String(parentEgressId)]) {
                        return this.payloadCache[String(parentEgressId)];
                    }
                    if (this.selectedParentStage.egressJsonData) {
                        return this.tryParseJson(this.selectedParentStage.egressJsonData);
                    }
                }

                return null;
            },
            formattedEgressJsonString() {
                if (!this.resolvedEgressPayload) return '';
                try {
                    return JSON.stringify(this.resolvedEgressPayload, null, 2);
                } catch (e) {
                    return String(this.resolvedEgressPayload);
                }
            },
            formattedIngressJsonString() {
                if (!this.resolvedIngressPayload) return '';
                try {
                    return JSON.stringify(this.resolvedIngressPayload, null, 2);
                } catch (e) {
                    return String(this.resolvedIngressPayload);
                }
            },
            computedDeltaSummary() {
                if (!this.resolvedIngressPayload || !this.resolvedEgressPayload) {
                    return { added: [], removed: [], changed: [] };
                }

                const inKeys = Object.keys(this.resolvedIngressPayload);
                const outKeys = Object.keys(this.resolvedEgressPayload);

                const added = outKeys.filter(k => !inKeys.includes(k));
                const removed = inKeys.filter(k => !outKeys.includes(k));
                const changed = inKeys.filter(k => outKeys.includes(k) && JSON.stringify(this.resolvedIngressPayload[k]) !== JSON.stringify(this.resolvedEgressPayload[k]));

                return { added, removed, changed };
            }
        },
        watch: {
            selectedStage: {
                immediate: true,
                deep: true,
                handler(val) {
                    if (val) {
                        this.inputDirective = val.directivePrompt || val.fullText || val.content || '';
                        this.inputTargetArtifact = this.displayTargetArtifactUri || val.targetArtifactUri || '';

                        if (val.activePort) {
                            this.activePort = val.activePort;
                        } else {
                            this.activePort = (val.statusId === 'PlsDraft' || !val.egressPayloadId) ? 'IN' : 'OUT';
                        }

                        const egressId = val.egressPayloadId || val.stagedPayloadId;
                        if (egressId && !this.payloadCache[String(egressId)]) {
                            this.fetchPayload(egressId);
                        }

                        const ingressId = val.ingressPayloadId;
                        if (ingressId && !this.payloadCache[String(ingressId)]) {
                            this.fetchPayload(ingressId);
                        }

                        this.syncActiveTab();
                    } else {
                        this.inputDirective = '';
                        this.inputTargetArtifact = '';
                    }
                }
            }
        },
        methods: {
            resolveCsrf() {
                return window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || "";
            },

            isValidPayload(obj) {
                if (!obj || typeof obj !== 'object') return false;
                if (Array.isArray(obj.payloadList) && obj.payloadList.length === 0) return false;
                return Object.keys(obj).length > 0;
            },

            tryParseJson(content) {
                if (!content || typeof content !== 'string') return null;
                const trimmed = content.trim();
                if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                    try {
                        return JSON.parse(trimmed);
                    } catch (e) {
                        return null;
                    }
                }
                return null;
            },

            extractJsonFromText(text) {
                if (!text || typeof text !== 'string') return null;
                const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (match && match[1]) {
                    return this.tryParseJson(match[1]);
                }
                return null;
            },

            syncActiveTab() {
                this.$nextTick(() => {
                    const p = this.resolvedEgressPayload;
                    if (p && (p.screenContract || p.suggestedEntities || p.recommendedArchetype || p.formulationSteps || p.subplans)) {
                        this.activeOutputTab = 'contract';
                    } else if (p && Object.keys(p).length > 0) {
                        this.activeOutputTab = 'json';
                    } else {
                        this.activeOutputTab = 'raw';
                    }
                });
            },

            async fetchPayload(payloadId) {
                if (!payloadId || this.payloadCache[String(payloadId)]) return;
                this.loadingPayload = true;
                try {
                    const resp = await axios.get('/rest/s1/agi-ai/payload', {
                        params: { agiPayloadId: payloadId },
                        headers: { 'moquiSessionToken': this.resolveCsrf() }
                    });

                    let data = resp.data;
                    let parsed = null;
                    if (data && data.payload) data = data.payload;

                    const rawPayload = data?.payloadContent || data?.payloadText || data?.content || data;
                    if (typeof rawPayload === 'string') {
                        parsed = this.tryParseJson(rawPayload) || this.extractJsonFromText(rawPayload);
                    } else if (typeof rawPayload === 'object') {
                        parsed = rawPayload;
                    }

                    if (this.isValidPayload(parsed)) {
                        this.payloadCache[String(payloadId)] = parsed;
                    }
                } catch (e) {
                    console.warn(`Could not load payload #${payloadId}:`, e.message);
                } finally {
                    this.loadingPayload = false;
                    this.syncActiveTab();
                }
            },

            copyToClipboard(text, label = 'Content') {
                if (!text) return;
                navigator.clipboard.writeText(text).then(() => {
                    this.$q.notify({
                        type: 'positive',
                        message: `${label} copied to clipboard`,
                        icon: 'content_copy',
                        timeout: 1500
                    });
                });
            },

            locateStageOnCanvas(stageId) {
                const targetId = stageId || this.stepId;
                if (targetId) {
                    const cardEl = document.getElementById('stage-card-' + targetId);
                    if (cardEl) {
                        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                    }
                }
            },

            async executeComputeStage() {
                if (!this.discussionId) {
                    this.$q.notify({ type: 'warning', message: 'No active pipeline selected.' });
                    return;
                }

                this.isDispatching = true;
                const activeStance = this.currentActionType;
                const parentId = this.selectedStage?.parentStepId || this.selectedParentStage?.pipelineStepId || null;

                try {
                    const dispatchResp = await axios.post('/rest/s1/agi-ai/pipeline/step/dispatch', {
                        discussionId: this.discussionId,
                        parentStepId: parentId,
                        stanceEnumId: activeStance,
                        directivePrompt: this.inputDirective,
                        ingressPayloadId: this.selectedStage?.ingressPayloadId || null,
                        targetArtifactUri: this.inputTargetArtifact,
                        stepLabel: this.inputDirective.substring(0, 50)
                    }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                    this.isDispatching = false;
                    this.$q.notify({
                        type: 'positive',
                        message: `Step #${dispatchResp.data?.pipelineStepId} committed cleanly.`,
                        icon: 'bolt'
                    });

                    this.activePort = 'OUT';

                    this.$emit('stage-dispatched', {
                        discussionId: this.discussionId,
                        pipelineStepId: dispatchResp.data?.pipelineStepId,
                        egressPayloadId: dispatchResp.data?.egressPayloadId,
                        completionText: dispatchResp.data?.completionText
                    });
                } catch (e) {
                    this.isDispatching = false;
                    this.$q.notify({
                        type: 'negative',
                        message: 'Compute failed: ' + (e.response?.data?.errors || e.message)
                    });
                }
            },

            async forkCurrentStep() {
                if (!this.stepId) return;

                this.isForking = true;
                try {
                    const resp = await axios.post('/rest/s1/agi-ai/pipeline/step/fork', {
                        sourceStepId: this.stepId,
                        directivePrompt: this.inputDirective,
                        modifiedPayloadJson: this.formattedIngressJsonString || null,
                        stanceEnumId: this.currentActionType
                    }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                    this.isForking = false;
                    this.$q.notify({
                        type: 'positive',
                        message: `Forked branch created: Step #${resp.data?.newStepId} [DRAFT]`,
                        icon: 'fork_right'
                    });

                    this.activePort = 'IN';
                    this.$emit('stage-dispatched', {
                        discussionId: this.discussionId,
                        pipelineStepId: resp.data?.newStepId
                    });
                } catch (e) {
                    this.isForking = false;
                    this.$q.notify({
                        type: 'negative',
                        message: 'Fork failed: ' + (e.response?.data?.errors || e.message)
                    });
                }
            },

            async archiveBranch() {
                if (!this.stepId) return;

                this.$q.dialog({
                    title: 'Archive Pipeline Branch',
                    message: `Archive Step #${this.stepId} and all downstream steps on this branch?`,
                    cancel: true,
                    persistent: true,
                    dark: true
                }).onOk(async () => {
                    this.isArchiving = true;
                    try {
                        const resp = await axios.post('/rest/s1/agi-ai/pipeline/step/archive', {
                            pipelineStepId: this.stepId
                        }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                        this.isArchiving = false;
                        this.$q.notify({
                            type: 'positive',
                            message: `Archived ${resp.data?.archivedCount || 1} steps on branch.`,
                            icon: 'archive'
                        });

                        this.$emit('stage-dispatched', { discussionId: this.discussionId });
                    } catch (e) {
                        this.isArchiving = false;
                        this.$q.notify({
                            type: 'negative',
                            message: 'Archive failed: ' + (e.response?.data?.errors || e.message)
                        });
                    }
                });
            },

            formatOutput(text) {
                if (!text) return '<span class="text-slate-500 italic">No output text recorded.</span>';
                if (window.showdown && typeof window.showdown.Converter === 'function') {
                    const converter = new window.showdown.Converter({ tables: true });
                    return converter.makeHtml(text);
                }
                return text.replace(/\n/g, '<br/>');
            },

            advanceToNext(stance) {
                this.$emit('advance-stance', {
                    nextStance: stance,
                    fromStage: this.selectedStage
                });
            }
        },
        template: `
            <div class="agi-stage-inspector fit column no-wrap font-mono text-white overflow-hidden" style="background-color: #020617; height: 100%; min-height: 0; width: 100%;">
                
                <!-- 1. UNIFIED CONTEXT & PROVENANCE HEADER (FIXED 38px) -->
                <div 
                    class="row items-center justify-between q-px-sm" 
                    :style="{ 
                        backgroundColor: '#0f172a',
                        borderBottom: '2px solid ' + (selectedStage ? themeStyle.bg : '#334155'), 
                        height: '38px', 
                        minHeight: '38px', 
                        flex: '0 0 38px' 
                    }"
                >
                    <div class="row items-center q-gutter-x-sm no-wrap ellipsis">
                        <template v-if="selectedStage && stepId">
                            <div 
                                v-if="selectedStage.stepNumber" 
                                class="row items-center q-px-xs rounded-borders font-mono text-caption text-weight-bolder" 
                                style="background-color: #020617; color: #38bdf8; border: 1px solid #0284c7; font-size: 10px; height: 22px; line-height: 20px;"
                            >
                                STEP {{ selectedStage.stepNumber }}{{ selectedStage.totalSteps ? ' / ' + selectedStage.totalSteps : '' }}
                            </div>

                            <div 
                                class="row items-center q-px-xs rounded-borders text-weight-bolder" 
                                :style="{ backgroundColor: themeStyle.bg, color: themeStyle.text, height: '22px' }"
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
                                    fontSize: '9px', height: '22px'
                                }"
                            >
                                {{ isDraft ? 'DRAFT' : 'COMMITTED' }}
                            </span>

                            <!-- Active Viewport Mode Selector: [IN] vs [OUT] -->
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
                                        fontSize: '9px'
                                    }"
                                    @click="activePort = 'IN'"
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
                                        fontSize: '9px'
                                    }"
                                    @click="activePort = 'OUT'"
                                >
                                    <span>[OUT] EGRESS</span>
                                    <span v-if="selectedStage?.egressPayloadId" class="q-ml-xs text-amber-3" style="font-size: 8px;">#{{ selectedStage.egressPayloadId }}</span>
                                    <q-icon name="logout" size="11px" class="q-ml-xs" :color="activePort === 'OUT' ? 'white' : 'amber-4'" />
                                </button>
                            </div>

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

                            <q-btn flat round dense size="xs" icon="my_location" color="cyan-3" @click="locateStageOnCanvas(stepId)">
                                <q-tooltip>Scroll to this card on DAG Canvas</q-tooltip>
                            </q-btn>
                        </template>

                        <template v-else>
                            <q-icon name="info" color="slate-500" size="16px" />
                            <span class="text-caption italic" style="color: #94a3b8;">No pipeline step selected. Click any node in the DAG above.</span>
                        </template>
                    </div>

                    <div v-if="selectedStage" class="row items-center q-gutter-x-xs">
                        <q-btn 
                            flat dense no-caps size="xs"
                            icon="fork_right"
                            label="Fork Branch"
                            color="amber-4"
                            class="q-px-xs rounded-borders"
                            style="border: 1px solid rgba(251, 191, 36, 0.4);"
                            :loading="isForking"
                            @click="forkCurrentStep"
                        >
                            <q-tooltip>Clone input and branch new execution path</q-tooltip>
                        </q-btn>

                        <q-btn 
                            flat dense no-caps size="xs"
                            icon="archive"
                            label="Archive"
                            color="slate-400"
                            class="q-px-xs rounded-borders"
                            style="border: 1px solid #334155;"
                            :loading="isArchiving"
                            @click="archiveBranch"
                        >
                            <q-tooltip>Soft-archive this step and downstream sub-branch</q-tooltip>
                        </q-btn>

                        <q-separator vertical dark class="q-mx-xs" />

                        <q-btn-group flat dense>
                            <q-btn 
                                flat dense size="xs" 
                                :color="currentActionType === 'discuss' ? 'cyan-3' : 'slate-400'" 
                                :class="currentActionType === 'discuss' ? 'bg-cyan-10 text-weight-bolder' : ''"
                                label="Discuss" 
                                @click="advanceToNext('discuss')" 
                            />
                            <q-btn 
                                flat dense size="xs" 
                                :color="currentActionType === 'plan' ? 'purple-3' : 'slate-400'" 
                                :class="currentActionType === 'plan' ? 'bg-purple-10 text-weight-bolder' : ''"
                                label="Plan" 
                                @click="advanceToNext('plan')" 
                            />
                            <q-btn 
                                flat dense size="xs" 
                                :color="currentActionType === 'build' ? 'amber-4' : 'slate-400'" 
                                :class="currentActionType === 'build' ? 'bg-amber-10 text-weight-bolder' : ''"
                                label="Build" 
                                @click="advanceToNext('build')" 
                            />
                        </q-btn-group>
                    </div>
                </div>

                <!-- 2. SINGLE FULL-WIDTH INSPECTOR VIEWPORT -->
                <div class="col full-width column no-wrap overflow-hidden relative-position" style="flex: 1 1 0%; min-height: 0; height: calc(100% - 38px);">
                    
                    <template v-if="!selectedStage">
                        <div class="fit column flex-center text-slate-500 font-mono">
                            <q-icon name="touch_app" size="32px" class="q-mb-sm text-cyan-4" />
                            <span>Select a pipeline step card in the DAG above.</span>
                        </div>
                    </template>

                    <!-- VIEWPORT A: [IN] INGRESS CONTRACT & DIRECTIVE COMPOSER -->
                    <template v-else-if="activePort === 'IN'">
                        <div class="row items-center justify-between q-px-sm" style="background-color: #0b1329; border-bottom: 1px solid #1e293b; height: 32px; min-height: 32px; flex: 0 0 32px;">
                            <div class="row items-center q-gutter-x-xs">
                                <q-icon name="login" size="13px" color="cyan-4" />
                                <span class="text-caption text-weight-bolder" style="color: #38bdf8; font-size: 10px;">
                                    INGRESS CONTRACT: STEP #{{ stepId }}
                                </span>
                                <span v-if="selectedStage?.parentStepId" class="text-caption text-slate-400" style="font-size: 9px;">
                                    (Inherited from Parent #{{ selectedStage.parentStepId }})
                                </span>
                            </div>

                            <div class="row items-center q-gutter-x-sm">
                                <div class="row items-center q-gutter-x-xs">
                                    <span class="text-caption font-mono" style="color: #94a3b8; font-size: 9px;">DIFF VS PRIOR:</span>
                                    <q-toggle v-model="showIngressDiff" dense color="cyan-4" size="xs" />
                                </div>

                                <q-btn flat round dense size="xs" icon="content_copy" style="color: #94a3b8;" @click="copyToClipboard(inputDirective, 'Ingress Directive')">
                                    <q-tooltip>Copy Directive</q-tooltip>
                                </q-btn>
                            </div>
                        </div>

                        <div class="col q-pa-md overflow-auto" style="flex: 1 1 0%; min-height: 0; height: 100%; overflow-y: auto !important;">
                            <div class="column q-gutter-y-md" style="max-width: 1200px; margin: 0 auto;">
                                
                                <div class="column q-gutter-y-xs">
                                    <label class="text-caption font-mono text-weight-bold" style="color: #94a3b8; font-size: 10px;">TARGET ARTIFACT LOCATION:</label>
                                    <q-input 
                                        v-model="inputTargetArtifact" 
                                        dense dark outlined 
                                        color="cyan-3"
                                        class="font-mono text-caption"
                                        input-class="font-mono text-cyan-2"
                                        style="background-color: #020617; border-radius: 4px;"
                                        placeholder="component://nursinghome/screen/..."
                                    />
                                </div>

                                <div class="column q-gutter-y-xs">
                                    <div class="row items-center justify-between">
                                        <label class="text-caption font-mono text-weight-bold" style="color: #94a3b8; font-size: 10px;">DIRECTIVE / DISPATCH PROMPT:</label>
                                        <span v-if="!isDraft" class="text-caption text-slate-500 font-mono" style="font-size: 9px;">(Committed Prompt)</span>
                                    </div>
                                    <q-input 
                                        v-model="inputDirective" 
                                        type="textarea" 
                                        rows="5" 
                                        dense dark outlined 
                                        color="cyan-3"
                                        class="font-mono text-caption"
                                        input-class="font-mono text-slate-100"
                                        style="background-color: #020617; border-radius: 4px;"
                                        placeholder="Enter step directive or transition instructions..."
                                    />
                                </div>

                                <div v-if="showIngressDiff" class="column q-gutter-y-xs q-pa-sm rounded-borders" style="background-color: #0f172a; border: 1px solid #0284c7;">
                                    <div class="row items-center justify-between">
                                        <span class="text-caption text-weight-bold text-cyan-3" style="font-size: 10px;">DELTA COMPARISON (INGRESS VS EGRESS):</span>
                                        <div class="row items-center q-gutter-x-xs text-caption font-mono" style="font-size: 9px;">
                                            <span class="text-teal-4">+{{ computedDeltaSummary.added.length }} added</span>
                                            <span class="text-amber-4">~{{ computedDeltaSummary.changed.length }} changed</span>
                                            <span class="text-rose-4">-{{ computedDeltaSummary.removed.length }} removed</span>
                                        </div>
                                    </div>

                                    <div class="row q-col-gutter-sm q-mt-xs">
                                        <div class="col-6">
                                            <div class="text-caption text-slate-400 font-bold q-mb-xs" style="font-size: 9px;">PREDECESSOR CONTRACT (INPUT):</div>
                                            <pre class="bg-black q-pa-xs rounded font-mono text-caption text-slate-300" style="max-height: 220px; overflow: auto; font-size: 10px;">{{ formattedIngressJsonString || 'No ingress contract payload.' }}</pre>
                                        </div>
                                        <div class="col-6">
                                            <div class="text-caption text-slate-400 font-bold q-mb-xs" style="font-size: 9px;">CURRENT STAGE EGRESS (OUTPUT):</div>
                                            <pre class="bg-black q-pa-xs rounded font-mono text-caption text-cyan-2" style="max-height: 220px; overflow: auto; font-size: 10px;">{{ formattedEgressJsonString || 'Awaiting compute execution.' }}</pre>
                                        </div>
                                    </div>
                                </div>

                                <div class="row items-center justify-between q-pa-sm rounded-borders" style="background-color: #0f172a; border: 1px solid #1e293b;">
                                    <div class="row items-center q-gutter-x-xs">
                                        <span class="text-caption font-mono" style="color: #cbd5e1; font-size: 10px;">Mantle UDM Invariants Enforced</span>
                                        <q-toggle v-model="inputMantleInvariants" dense color="cyan-4" size="xs" />
                                    </div>

                                    <q-btn 
                                        :color="currentActionType === 'build' ? 'amber-9' : (currentActionType === 'plan' ? 'deep-purple-7' : 'primary')"
                                        :text-color="currentActionType === 'build' ? 'black' : 'white'"
                                        icon="bolt" 
                                        :label="'Dispatch ' + currentActionType.toUpperCase() + ' Compute'" 
                                        dense no-caps 
                                        class="text-weight-bold q-px-md q-py-xs font-mono"
                                        :loading="isDispatching"
                                        @click="executeComputeStage"
                                    />
                                </div>

                            </div>
                        </div>
                    </template>

                    <!-- VIEWPORT B: [OUT] EGRESS ARTIFACT & MOQUI SPEC CONTRACT -->
                    <template v-else>
                        <div class="row items-center justify-between q-px-sm" style="background-color: #0b1329; border-bottom: 1px solid #1e293b; height: 32px; min-height: 32px; flex: 0 0 32px;">
                            <div class="row items-center q-gutter-x-xs no-wrap ellipsis">
                                <q-icon name="output" size="13px" color="amber-4" />
                                <span class="text-caption text-weight-bolder" style="color: #38bdf8; font-size: 10px;">
                                    EGRESS ARTIFACT: STEP #{{ stepId }}
                                </span>
                                <span 
                                    v-if="selectedStage?.egressPayloadId" 
                                    class="q-px-xs rounded font-mono text-weight-bolder" 
                                    style="background-color: #581c87; color: #f3e8ff; font-size: 9px; border: 1px solid #7e22ce;"
                                >
                                    PAYLOAD #{{ selectedStage.egressPayloadId }}
                                </span>
                                <q-spinner-dots v-if="loadingPayload" color="cyan-4" size="14px" />
                            </div>

                            <div class="row items-center q-gutter-x-xs">
                                <div class="row items-center q-gutter-x-none rounded-borders" style="background-color: #020617; border: 1px solid #334155; padding: 1px;">
                                    <button 
                                        type="button"
                                        class="cursor-pointer font-mono text-caption text-weight-bold"
                                        :style="{
                                            backgroundColor: activeOutputTab === 'contract' ? '#0284c7' : '#0f172a',
                                            color: activeOutputTab === 'contract' ? '#ffffff' : '#cbd5e1',
                                            border: activeOutputTab === 'contract' ? '1px solid #38bdf8' : '1px solid transparent',
                                            borderRadius: '3px',
                                            padding: '2px 8px',
                                            fontSize: '9px',
                                            opacity: resolvedEgressPayload ? '1' : '0.4',
                                            cursor: resolvedEgressPayload ? 'pointer' : 'not-allowed'
                                        }"
                                        :disabled="!resolvedEgressPayload"
                                        @click="activeOutputTab = 'contract'"
                                    >
                                        Moqui Spec
                                    </button>

                                    <button 
                                        type="button"
                                        class="cursor-pointer font-mono text-caption text-weight-bold"
                                        :style="{
                                            backgroundColor: activeOutputTab === 'json' ? '#0284c7' : '#0f172a',
                                            color: activeOutputTab === 'json' ? '#ffffff' : '#cbd5e1',
                                            border: activeOutputTab === 'json' ? '1px solid #38bdf8' : '1px solid transparent',
                                            borderRadius: '3px',
                                            padding: '2px 8px',
                                            fontSize: '9px',
                                            opacity: resolvedEgressPayload ? '1' : '0.4',
                                            cursor: resolvedEgressPayload ? 'pointer' : 'not-allowed'
                                        }"
                                        :disabled="!resolvedEgressPayload"
                                        @click="activeOutputTab = 'json'"
                                    >
                                        JSON
                                    </button>

                                    <button 
                                        type="button"
                                        class="cursor-pointer font-mono text-caption text-weight-bold"
                                        :style="{
                                            backgroundColor: activeOutputTab === 'prompt' ? '#0284c7' : '#0f172a',
                                            color: activeOutputTab === 'prompt' ? '#ffffff' : '#cbd5e1',
                                            border: activeOutputTab === 'prompt' ? '1px solid #38bdf8' : '1px solid transparent',
                                            borderRadius: '3px',
                                            padding: '2px 8px',
                                            fontSize: '9px'
                                        }"
                                        @click="activeOutputTab = 'prompt'"
                                    >
                                        Prompt
                                    </button>

                                    <button 
                                        type="button"
                                        class="cursor-pointer font-mono text-caption text-weight-bold"
                                        :style="{
                                            backgroundColor: activeOutputTab === 'raw' ? '#0284c7' : '#0f172a',
                                            color: activeOutputTab === 'raw' ? '#ffffff' : '#cbd5e1',
                                            border: activeOutputTab === 'raw' ? '1px solid #38bdf8' : '1px solid transparent',
                                            borderRadius: '3px',
                                            padding: '2px 8px',
                                            fontSize: '9px'
                                        }"
                                        @click="activeOutputTab = 'raw'"
                                    >
                                        Raw
                                    </button>
                                </div>

                                <q-btn 
                                    flat round dense size="xs" 
                                    icon="content_copy" 
                                    style="color: #94a3b8;"
                                    @click="copyToClipboard(formattedEgressJsonString || rawStageBody, 'Output Artifact')"
                                >
                                    <q-tooltip>Copy Output</q-tooltip>
                                </q-btn>
                            </div>
                        </div>

                        <div class="col q-pa-md overflow-auto" style="flex: 1 1 0%; min-height: 0; height: 100%; overflow-y: auto !important;">
                            <div style="max-width: 1200px; margin: 0 auto;">
                                
                                <div v-if="isDraft && !resolvedEgressPayload" class="column flex-center q-my-xl text-slate-500 font-mono">
                                    <q-icon name="pending" size="36px" color="amber-4" class="q-mb-sm" />
                                    <div class="text-weight-bold text-slate-300">Step #{{ stepId }} is in DRAFT state.</div>
                                    <div class="text-caption text-slate-500 q-mb-md">No output artifact has been generated yet.</div>
                                    <q-btn color="cyan-8" text-color="white" icon="login" label="Switch to [IN] to review and dispatch" no-caps dense @click="activePort = 'IN'" />
                                </div>

                                <div v-else-if="activeOutputTab === 'contract' && resolvedEgressPayload" class="column q-gutter-y-sm">
                                    <div class="row items-center justify-between q-pa-xs rounded-borders" style="background-color: #0f172a; border: 1px solid #1e293b;">
                                        <div class="row items-center q-gutter-x-xs">
                                            <span class="text-caption font-bold" style="color: #94a3b8; font-size: 10px;">ARCHETYPE:</span>
                                            <span class="q-px-xs rounded font-mono text-caption text-weight-bold" style="background-color: #581c87; color: #ffffff; font-size: 9px;">
                                                {{ resolvedEgressPayload.recommendedArchetype || 'default' }}
                                            </span>
                                        </div>
                                        <span v-if="resolvedEgressPayload.status" class="text-caption font-bold" style="color: #38bdf8; font-size: 10px;">
                                            STATUS: {{ resolvedEgressPayload.status }}
                                        </span>
                                    </div>

                                    <div v-if="resolvedEgressPayload.suggestedEntities && resolvedEgressPayload.suggestedEntities.length > 0" class="column q-gutter-y-xs q-pa-xs rounded-borders" style="background-color: #0f172a; border: 1px solid #1e293b;">
                                        <span class="text-caption font-bold" style="color: #94a3b8; font-size: 10px;">ENTITIES BOUND:</span>
                                        <div class="row q-gutter-xs">
                                            <span 
                                                v-for="ent in resolvedEgressPayload.suggestedEntities" 
                                                :key="ent"
                                                class="q-px-xs rounded font-mono text-caption text-weight-bold" 
                                                style="background-color: #020617; border: 1px solid #0284c7; color: #38bdf8; font-size: 9px;"
                                            >
                                                {{ ent }}
                                            </span>
                                        </div>
                                    </div>

                                    <div v-if="resolvedEgressPayload.screenContract" class="column q-gutter-y-xs q-pa-xs rounded-borders" style="background-color: #0f172a; border: 1px solid #1e293b;">
                                        <div v-if="resolvedEgressPayload.screenContract.requiredPermissions && resolvedEgressPayload.screenContract.requiredPermissions.length > 0">
                                            <span class="text-caption font-bold" style="color: #94a3b8; font-size: 10px;">REQUIRED PERMISSIONS:</span>
                                            <div class="row q-gutter-xs">
                                                <span 
                                                    v-for="perm in resolvedEgressPayload.screenContract.requiredPermissions" 
                                                    :key="perm"
                                                    class="q-px-xs rounded font-mono text-caption text-weight-bold" 
                                                    style="background-color: #020617; border: 1px solid #d97706; color: #fde047; font-size: 9px;"
                                                >
                                                    {{ perm }}
                                                </span>
                                            </div>
                                        </div>

                                        <div v-if="resolvedEgressPayload.screenContract.requiredParameters && resolvedEgressPayload.screenContract.requiredParameters.length > 0" class="q-mt-xs">
                                            <span class="text-caption font-bold" style="color: #94a3b8; font-size: 10px;">REQUIRED PARAMETERS:</span>
                                            <div class="row q-gutter-xs">
                                                <span 
                                                    v-for="param in resolvedEgressPayload.screenContract.requiredParameters" 
                                                    :key="param"
                                                    class="q-px-xs rounded font-mono text-caption text-weight-bold" 
                                                    style="background-color: #020617; border: 1px solid #0d9488; color: #5eead4; font-size: 9px;"
                                                >
                                                    {{ param }}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div v-if="resolvedEgressPayload.entityFieldBindings && resolvedEgressPayload.entityFieldBindings.length > 0" class="column q-gutter-y-xs q-pa-xs rounded-borders" style="background-color: #0f172a; border: 1px solid #1e293b;">
                                        <span class="text-caption font-bold" style="color: #94a3b8; font-size: 10px;">FIELD BINDINGS:</span>
                                        <div v-for="(b, bIdx) in resolvedEgressPayload.entityFieldBindings" :key="bIdx" class="q-pa-xs rounded font-mono text-caption" style="background-color: #020617; border: 1px solid #334155; font-size: 10px;">
                                            <div class="row items-center justify-between">
                                                <span class="text-weight-bold" style="color: #38bdf8;">{{ b.entity }}</span>
                                                <span style="color: #fbbf24;">{{ b.targetWidget }}</span>
                                            </div>
                                            <div class="q-mt-xs text-caption" style="color: #94a3b8; font-size: 9px;">
                                                Fields: {{ b.fields ? b.fields.join(', ') : 'All' }}
                                            </div>
                                        </div>
                                    </div>

                                    <div v-if="resolvedEgressPayload.architectureSummary || resolvedEgressPayload.message" class="q-pa-xs rounded-borders text-caption" style="background-color: #0f172a; border: 1px solid #1e293b; color: #e2e8f0;">
                                        <div class="text-weight-bold q-mb-xs" style="color: #38bdf8;">Architecture Summary:</div>
                                        <div class="font-mono text-caption" style="line-height: 1.4;">
                                            {{ resolvedEgressPayload.architectureSummary || resolvedEgressPayload.message }}
                                        </div>
                                    </div>

                                    <div v-if="resolvedEgressPayload.formulationSteps && resolvedEgressPayload.formulationSteps.length > 0" class="column q-gutter-y-xs q-pa-xs rounded-borders" style="background-color: #0f172a; border: 1px solid #1e293b;">
                                        <span class="text-caption font-bold" style="color: #94a3b8; font-size: 10px;">FORMULATION STEPS:</span>
                                        <div v-for="(step, sIdx) in resolvedEgressPayload.formulationSteps" :key="sIdx" class="row no-wrap items-start q-gutter-x-xs font-mono text-caption" style="color: #cbd5e1; font-size: 10px;">
                                            <q-icon name="check_circle" size="12px" color="cyan-4" class="q-mt-xs" />
                                            <span>{{ step }}</span>
                                        </div>
                                    </div>
                                </div>

                                <div v-else-if="activeOutputTab === 'json' && resolvedEgressPayload" class="q-pa-sm rounded-borders font-mono text-caption" style="background-color: #0f172a; border: 1px solid #1e3a5f;">
                                    <pre class="q-ma-none" style="color: #38bdf8; white-space: pre-wrap; font-size: 11px; line-height: 1.4;">{{ formattedEgressJsonString }}</pre>
                                </div>

                                <div v-else class="q-pa-xs rounded-borders font-mono text-caption" style="background-color: #0f172a; border: 1px solid #1e3a5f; color: #f1f5f9;">
                                    <div class="markdown-body font-mono text-caption" v-html="formatOutput(rawStageBody)"></div>
                                </div>

                            </div>
                        </div>
                    </template>

                </div>

            </div>
        `
    };

    window.AgiStageInspector = AgiStageInspector;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-stage-inspector'] = AgiStageInspector;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('agi-stage-inspector', AgiStageInspector);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();