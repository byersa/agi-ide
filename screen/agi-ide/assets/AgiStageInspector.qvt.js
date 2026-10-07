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
                splitRatio: 50,
                isDispatching: false,
                loadingPayload: false,

                // Cache for fetched staged payloads: { [payloadId]: parsedObject }
                payloadCache: {},

                // Right Pane View Mode: 'contract' | 'json' | 'prompt' | 'raw'
                activeOutputTab: 'contract',

                // Input Staging State (Editable for leaf/head stages)
                inputDirective: '',
                inputTargetArtifact: '',
                inputMantleInvariants: true
            };
        },
        computed: {
            isCompletedArtifact() {
                if (!this.selectedStage) return false;
                return this.selectedStage.role === 'assistant'
                    || !!this.resolvedPayload
                    || (this.selectedStage.children && this.selectedStage.children.length > 0);
            },
            isHeadStage() {
                if (!this.selectedStage) return false;
                return (!this.selectedStage.children || this.selectedStage.children.length === 0)
                    && !this.isCompletedArtifact;
            },
            currentActionType() {
                return (this.selectedStage?.actionType || 'discuss').toLowerCase();
            },
            displayTargetArtifactUri() {
                return this.selectedStage?.targetArtifactUri
                    || this.resolvedPayload?.targetArtifactUri
                    || this.resolvedPayload?.createdArtifactUri
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
            parentThemeStyle() {
                if (!this.selectedParentStage) return null;
                const type = (this.selectedParentStage.actionType || 'discuss').toLowerCase();
                if (type === 'build') return { bg: '#f59e0b', text: '#000000', icon: 'handyman', label: 'BUILD' };
                if (type === 'plan') return { bg: '#7c3aed', text: '#ffffff', icon: 'architecture', label: 'PLAN' };
                return { bg: '#0284c7', text: '#ffffff', icon: 'chat', label: 'DISCUSS' };
            },
            rawStageBody() {
                if (!this.selectedStage) return '';
                const s = this.selectedStage;
                return s.fullText || s.content || s.message || s.text || s.directive || s.label || '';
            },
            rawParentBody() {
                if (!this.selectedParentStage) return '';
                const p = this.selectedParentStage;
                return p.fullText || p.content || p.message || p.text || p.directive || p.label || '';
            },
            resolvedPayload() {
                if (!this.selectedStage) return null;

                // 1. Direct parsed JSON from fullText/message (already in memory from /pipeline-graph)
                const directParse = this.tryParseJson(this.rawStageBody);
                if (this.isValidPayload(directParse)) return directParse;

                // 2. Embedded markdown code block JSON (```json ... ```)
                const extractedJson = this.extractJsonFromText(this.rawStageBody);
                if (this.isValidPayload(extractedJson)) return extractedJson;

                // 3. Direct embedded payload object if present on node
                if (this.selectedStage.payload && typeof this.selectedStage.payload === 'object') {
                    if (this.isValidPayload(this.selectedStage.payload)) return this.selectedStage.payload;
                }

                // 4. Check fetched payload cache
                const payloadId = this.selectedStage.stagedPayloadId;
                if (payloadId && this.payloadCache[String(payloadId)]) {
                    const cached = this.payloadCache[String(payloadId)];
                    if (this.isValidPayload(cached)) return cached;
                }

                return null;
            },
            formattedJsonString() {
                if (!this.resolvedPayload) return '';
                try {
                    return JSON.stringify(this.resolvedPayload, null, 2);
                } catch (e) {
                    return String(this.resolvedPayload);
                }
            }
        },
        watch: {
            selectedStage: {
                immediate: true,
                deep: true,
                handler(val) {
                    if (val) {
                        const raw = val.fullText || val.content || val.message || val.text || val.label || '';
                        this.inputDirective = raw;
                        this.inputTargetArtifact = this.displayTargetArtifactUri || val.targetArtifactUri || '';

                        // Only fetch remotely if fullText did NOT yield a valid payload
                        if (!this.resolvedPayload && val.stagedPayloadId && !this.payloadCache[String(val.stagedPayloadId)]) {
                            this.fetchStagedPayload(val.stagedPayloadId);
                        } else {
                            this.syncActiveTab();
                        }
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
                    const p = this.resolvedPayload;
                    if (p && (p.screenContract || p.suggestedEntities || p.recommendedArchetype || p.formulationSteps || p.subplans)) {
                        this.activeOutputTab = 'contract';
                    } else if (p && Object.keys(p).length > 0) {
                        this.activeOutputTab = 'json';
                    } else {
                        this.activeOutputTab = 'raw';
                    }
                });
            },

            async fetchStagedPayload(payloadId) {
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
                    console.warn(`Could not load remote payload #${payloadId}:`, e.message);
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
                const targetId = stageId || this.selectedStage?.stageId;
                if (targetId) {
                    const badgeEl = document.getElementById('stage-card-' + targetId);
                    if (badgeEl) {
                        badgeEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                    }
                }
            },

            forwardUpstreamToDirective() {
                if (!this.selectedParentStage) return;
                const body = this.rawParentBody;
                this.inputDirective = `Based on output from Stage #${this.selectedParentStage.stageId}:\n${body.substring(0, 400)}...`;
                this.$q.notify({
                    type: 'positive',
                    message: `Forwarded Stage #${this.selectedParentStage.stageId} contract into directive.`,
                    icon: 'forward',
                    timeout: 2000
                });
            },

            async executeComputeStage() {
                if (!this.discussionId) {
                    this.$q.notify({ type: 'warning', message: 'No active pipeline selected.' });
                    return;
                }

                this.isDispatching = true;
                const activeMode = this.currentActionType;
                const parentId = this.selectedParentStage?.stageId || this.selectedStage?.stageId || null;

                try {
                    const userTurnResp = await axios.post('/rest/s1/agi-ai/discussions/message', {
                        discussionId: this.discussionId,
                        parentMessageId: parentId,
                        senderRoleEnumId: 'AsrUser',
                        content: this.inputDirective,
                        targetArtifactUri: this.inputTargetArtifact
                    }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                    const userMsgId = userTurnResp.data?.messageId;

                    const dispatchResp = await axios.post('/rest/s1/agi-ai/discussions/dispatch', {
                        discussionId: this.discussionId,
                        parentMessageId: userMsgId,
                        userPrompt: this.inputDirective,
                        mode: activeMode,
                        targetArtifactUri: this.inputTargetArtifact
                    }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                    this.isDispatching = false;
                    this.$q.notify({
                        type: 'positive',
                        message: `Compute Stage (${activeMode.toUpperCase()}) executed cleanly.`,
                        icon: 'bolt'
                    });

                    this.$emit('stage-dispatched', {
                        discussionId: this.discussionId,
                        assistantMessageId: dispatchResp.data?.assistantMessageId,
                        stagedPayloadId: dispatchResp.data?.stagedPayloadId,
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
            <div class="agi-stage-inspector fit column no-wrap bg-slate-950 font-mono text-white overflow-hidden" style="height: 100%; min-height: 0; width: 100%;">
                
                <!-- 1. COLOR-SYNCHRONIZED CONTEXT HEADER (FIXED 38px) -->
                <div 
                    class="row items-center justify-between q-px-sm bg-slate-900" 
                    :style="{ 
                        borderBottom: '2px solid ' + (selectedStage ? themeStyle.bg : '#334155'), 
                        height: '38px', 
                        minHeight: '38px', 
                        flex: '0 0 38px' 
                    }"
                >
                    <div class="row items-center q-gutter-x-sm no-wrap ellipsis">
                        <template v-if="selectedStage && selectedStage.stageId">
                            <!-- High Contrast Step Pill -->
                            <div 
                                v-if="selectedStage.stepNumber" 
                                class="row items-center q-px-xs rounded-borders font-mono text-caption text-weight-bolder" 
                                style="background-color: #020617; color: #38bdf8; border: 1px solid #0284c7; font-size: 10px; height: 22px; line-height: 20px;"
                            >
                                STEP {{ selectedStage.stepNumber }}{{ selectedStage.totalSteps ? ' / ' + selectedStage.totalSteps : '' }}
                            </div>

                            <!-- Semantic Action Badge -->
                            <div 
                                class="row items-center q-px-xs rounded-borders text-weight-bolder" 
                                :style="{ backgroundColor: themeStyle.bg, color: themeStyle.text, height: '22px' }"
                            >
                                <q-icon :name="themeStyle.icon" size="13px" class="q-mr-xs" />
                                <span class="text-caption font-mono" style="font-size: 10px; letter-spacing: 0.5px;">
                                    {{ themeStyle.label }} #{{ selectedStage.stageId }}
                                </span>
                            </div>

                            <!-- Attribution Badge -->
                            <span 
                                class="row items-center q-px-xs rounded-borders text-caption text-weight-bolder" 
                                style="background-color: #1e293b; color: #94a3b8; border: 1px solid #334155; font-size: 9px; height: 22px;"
                            >
                                {{ selectedStage.role === 'assistant' ? 'AI GENERATED' : 'USER DIRECTIVE' }}
                            </span>

                            <!-- Payload ID Badge -->
                            <q-badge 
                                v-if="selectedStage.stagedPayloadId" 
                                color="deep-purple-8" 
                                text-color="white" 
                                class="font-mono text-caption" 
                                style="font-size: 9px; height: 20px;"
                            >
                                PAYLOAD #{{ selectedStage.stagedPayloadId }}
                            </q-badge>

                            <!-- Target Artifact Anchor Link & Quick Open -->
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

                            <q-btn flat round dense size="xs" icon="my_location" color="cyan-3" @click="locateStageOnCanvas(selectedStage.stageId)">
                                <q-tooltip>Scroll to this card on DAG Canvas</q-tooltip>
                            </q-btn>
                        </template>

                        <template v-else>
                            <q-icon name="info" color="slate-500" size="16px" />
                            <span class="text-caption text-slate-400 italic">No stage card selected. Click any node in the DAG above.</span>
                        </template>
                    </div>

                    <!-- Pipeline Stance Switcher -->
                    <div v-if="selectedStage" class="row items-center q-gutter-x-xs">
                        <span class="text-slate-500 font-mono text-caption q-mr-xs" style="font-size: 9px;">SET STANCE:</span>
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

                <!-- 2. CONTRACT PAIR DUAL-PANE VIEWPORT -->
                <div class="col row no-wrap overflow-hidden relative-position" style="flex: 1 1 0%; min-height: 0; height: calc(100% - 38px);">
                    
                    <!-- LEFT PANE: UPSTREAM INGRESS CONTRACT (STAGE N - 1) -->
                    <div class="column no-wrap overflow-hidden" :style="{ width: splitRatio + '%', flex: '0 0 ' + splitRatio + '%', borderRight: '1px solid #334155', height: '100%', minHeight: 0 }">
                        <div class="row items-center justify-between q-px-sm bg-slate-900" style="border-bottom: 1px solid #1e293b; height: 30px; min-height: 30px; flex: 0 0 30px;">
                            <div class="row items-center q-gutter-x-xs">
                                <q-icon name="login" size="13px" color="cyan-4" />
                                <span class="text-caption text-weight-bold text-amber-3" style="font-size: 10px;">
                                    {{ selectedParentStage ? 'UPSTREAM INGRESS: #' + selectedParentStage.stageId : 'ROOT PIPELINE INGRESS' }}
                                </span>
                                <span v-if="parentThemeStyle" class="q-px-xs rounded text-caption" :style="{ backgroundColor: parentThemeStyle.bg, color: parentThemeStyle.text, fontSize: '9px' }">
                                    {{ parentThemeStyle.label }}
                                </span>
                            </div>

                            <div v-if="selectedParentStage" class="row items-center q-gutter-x-xs">
                                <q-btn flat round dense size="xs" icon="my_location" color="slate-400" @click="locateStageOnCanvas(selectedParentStage.stageId)">
                                    <q-tooltip>Locate Upstream Stage #{{ selectedParentStage.stageId }}</q-tooltip>
                                </q-btn>
                                <q-btn flat round dense size="xs" icon="content_copy" color="slate-400" @click="copyToClipboard(rawParentBody, 'Upstream Output')">
                                    <q-tooltip>Copy Upstream Output</q-tooltip>
                                </q-btn>
                            </div>
                        </div>

                        <!-- Left Pane Scroll Area -->
                        <div class="col q-pa-sm overflow-auto" style="flex: 1 1 0%; min-height: 0; height: 100%; overflow-y: auto !important;">
                            <template v-if="selectedParentStage">
                                <div class="column q-gutter-y-sm">
                                    <div class="q-pa-xs rounded-borders bg-slate-900 text-caption text-slate-300" style="border: 1px solid #334155;">
                                        <div class="row items-center justify-between q-mb-xs">
                                            <span class="text-weight-bold text-cyan-3">Preceding Output (Stage #{{ selectedParentStage.stageId }}):</span>
                                            <span class="text-slate-500 font-mono text-caption" style="font-size: 9px;">
                                                {{ selectedParentStage.role === 'assistant' ? 'AI Response' : 'User Input' }}
                                            </span>
                                        </div>
                                        <div class="markdown-body font-mono text-caption" v-html="formatOutput(rawParentBody)"></div>
                                    </div>

                                    <q-btn 
                                        v-if="isHeadStage"
                                        color="deep-purple-7" 
                                        text-color="white" 
                                        icon="forward" 
                                        label="Forward Into Active Directive" 
                                        dense no-caps 
                                        class="text-weight-bold q-py-xs full-width font-mono"
                                        @click="forwardUpstreamToDirective"
                                    />
                                </div>
                            </template>

                            <template v-else>
                                <div class="column flex-center text-slate-500 text-caption q-my-xl">
                                    <q-icon name="trip_origin" size="24px" class="q-mb-xs text-cyan-4" />
                                    <span class="text-weight-bold">Pipeline Root Ingress</span>
                                    <span class="text-slate-400" style="font-size: 10px;">This stage is the entry point with no upstream compute parent.</span>
                                </div>
                            </template>
                        </div>
                    </div>

                    <!-- RIGHT PANE: CURRENT STAGE TRANSFORMATION & CONTRACT (STAGE N) -->
                    <div class="col column no-wrap overflow-hidden" style="height: 100%; min-height: 0;">
                        <!-- Right Header: Tabs for Completed Nodes vs Composer for Uncomputed Leaf -->
                        <div class="row items-center justify-between q-px-sm bg-slate-900" style="border-bottom: 1px solid #1e293b; height: 30px; min-height: 30px; flex: 0 0 30px;">
                            <div class="row items-center q-gutter-x-xs">
                                <q-icon name="transform" size="13px" color="amber-4" />
                                <span class="text-caption text-weight-bold text-cyan-3" style="font-size: 10px;">
                                    {{ isHeadStage ? 'HEAD STAGE COMPOSER' : 'STAGE CONTRACT & ARTIFACT' }}
                                </span>
                                <q-spinner-dots v-if="loadingPayload" color="cyan-4" size="14px" />
                            </div>

                            <div class="row items-center q-gutter-x-xs">
                                <!-- Mode Selector Tabs for Structured Output -->
                                <q-btn-toggle
                                    v-if="!isHeadStage"
                                    v-model="activeOutputTab"
                                    dense flat no-caps
                                    size="xs"
                                    toggle-color="cyan-3"
                                    color="slate-500"
                                    :options="[
                                        { label: 'Moqui Spec', value: 'contract', disable: !resolvedPayload },
                                        { label: 'JSON', value: 'json', disable: !resolvedPayload },
                                        { label: 'Prompt', value: 'prompt' },
                                        { label: 'Raw', value: 'raw' }
                                    ]"
                                />
                                <q-btn flat round dense size="xs" icon="content_copy" color="slate-400" @click="copyToClipboard(formattedJsonString || rawStageBody, 'Output Artifact')">
                                    <q-tooltip>Copy Output</q-tooltip>
                                </q-btn>
                            </div>
                        </div>

                        <!-- Right Pane Scroll Area -->
                        <div class="col q-pa-sm overflow-auto" style="flex: 1 1 0%; min-height: 0; height: 100%; overflow-y: auto !important;">
                            
                            <!-- A. ACTIVE COMPOSER (WHEN LEAF / HEAD NODE IS SELECTED) -->
                            <template v-if="isHeadStage">
                                <div class="column q-gutter-y-sm">
                                    <div class="column q-gutter-y-xs">
                                        <label class="text-caption text-slate-400 font-mono" style="font-size: 10px;">TARGET ARTIFACT LOCATION:</label>
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
                                            <label class="text-caption text-slate-400 font-mono" style="font-size: 10px;">DIRECTIVE / DISPATCH PROMPT:</label>
                                            <q-btn flat dense round size="xs" icon="content_copy" color="slate-400" @click="copyToClipboard(inputDirective, 'Directive')" />
                                        </div>
                                        <q-input 
                                            v-model="inputDirective" 
                                            type="textarea" 
                                            rows="6" 
                                            dense dark outlined 
                                            color="cyan-3"
                                            class="font-mono text-caption"
                                            input-class="font-mono text-slate-100"
                                            style="background-color: #020617; border-radius: 4px;"
                                            placeholder="Enter stage directive or prompt payload..."
                                        />
                                    </div>

                                    <div class="row items-center justify-between q-pa-xs rounded-borders bg-slate-900" style="border: 1px solid #1e293b;">
                                        <span class="text-caption text-slate-300 font-mono" style="font-size: 10px;">Mantle UDM Invariants Enforced</span>
                                        <q-toggle v-model="inputMantleInvariants" dense color="cyan-4" />
                                    </div>

                                    <q-btn 
                                        :color="currentActionType === 'build' ? 'amber-9' : (currentActionType === 'plan' ? 'deep-purple-7' : 'primary')"
                                        :text-color="currentActionType === 'build' ? 'black' : 'white'"
                                        icon="bolt" 
                                        :label="'Dispatch ' + currentActionType.toUpperCase() + ' Compute'" 
                                        dense no-caps 
                                        class="text-weight-bold q-py-xs full-width font-mono"
                                        :loading="isDispatching"
                                        @click="executeComputeStage"
                                    />
                                </div>
                            </template>

                            <!-- B. HISTORIC NODE: MOQUI CONTRACT SPEC TAB -->
                            <template v-else-if="activeOutputTab === 'contract' && resolvedPayload">
                                <div class="column q-gutter-y-sm">
                                    <!-- Screen & Archetype Pill Bar -->
                                    <div class="row items-center justify-between q-pa-xs rounded-borders bg-slate-900" style="border: 1px solid #1e293b;">
                                        <div class="row items-center q-gutter-x-xs">
                                            <span class="text-caption text-slate-400 font-bold" style="font-size: 10px;">ARCHETYPE:</span>
                                            <span class="q-px-xs rounded bg-purple-9 text-white font-mono text-caption" style="font-size: 9px;">
                                                {{ resolvedPayload.recommendedArchetype || 'default' }}
                                            </span>
                                        </div>
                                        <span v-if="resolvedPayload.status" class="text-caption text-cyan-4 font-bold" style="font-size: 10px;">
                                            STATUS: {{ resolvedPayload.status }}
                                        </span>
                                    </div>

                                    <!-- Entities Touched Chips -->
                                    <div v-if="resolvedPayload.suggestedEntities && resolvedPayload.suggestedEntities.length > 0" class="column q-gutter-y-xs q-pa-xs rounded-borders bg-slate-900" style="border: 1px solid #1e293b;">
                                        <span class="text-caption text-slate-400 font-bold" style="font-size: 10px;">ENTITIES BOUND:</span>
                                        <div class="row q-gutter-xs">
                                            <span 
                                                v-for="ent in resolvedPayload.suggestedEntities" 
                                                :key="ent"
                                                class="q-px-xs rounded font-mono text-caption" 
                                                style="background-color: #020617; border: 1px solid #0284c7; color: #38bdf8; font-size: 9px;"
                                            >
                                                {{ ent }}
                                            </span>
                                        </div>
                                    </div>

                                    <!-- Screen Contract (Parameters & Permissions) -->
                                    <div v-if="resolvedPayload.screenContract" class="column q-gutter-y-xs q-pa-xs rounded-borders bg-slate-900" style="border: 1px solid #1e293b;">
                                        <div v-if="resolvedPayload.screenContract.requiredPermissions && resolvedPayload.screenContract.requiredPermissions.length > 0">
                                            <span class="text-caption text-slate-400 font-bold" style="font-size: 10px;">REQUIRED PERMISSIONS:</span>
                                            <div class="row q-gutter-xs">
                                                <span 
                                                    v-for="perm in resolvedPayload.screenContract.requiredPermissions" 
                                                    :key="perm"
                                                    class="q-px-xs rounded font-mono text-caption text-amber-3" 
                                                    style="background-color: #020617; border: 1px solid #d97706; font-size: 9px;"
                                                >
                                                    {{ perm }}
                                                </span>
                                            </div>
                                        </div>

                                        <div v-if="resolvedPayload.screenContract.requiredParameters && resolvedPayload.screenContract.requiredParameters.length > 0" class="q-mt-xs">
                                            <span class="text-caption text-slate-400 font-bold" style="font-size: 10px;">REQUIRED PARAMETERS:</span>
                                            <div class="row q-gutter-xs">
                                                <span 
                                                    v-for="param in resolvedPayload.screenContract.requiredParameters" 
                                                    :key="param"
                                                    class="q-px-xs rounded font-mono text-caption text-teal-3" 
                                                    style="background-color: #020617; border: 1px solid #0d9488; font-size: 9px;"
                                                >
                                                    {{ param }}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Entity Field Bindings -->
                                    <div v-if="resolvedPayload.entityFieldBindings && resolvedPayload.entityFieldBindings.length > 0" class="column q-gutter-y-xs q-pa-xs rounded-borders bg-slate-900" style="border: 1px solid #1e293b;">
                                        <span class="text-caption text-slate-400 font-bold" style="font-size: 10px;">FIELD BINDINGS:</span>
                                        <div v-for="(b, bIdx) in resolvedPayload.entityFieldBindings" :key="bIdx" class="q-pa-xs rounded bg-slate-950 font-mono text-caption" style="border: 1px solid #334155; font-size: 10px;">
                                            <div class="row items-center justify-between">
                                                <span class="text-weight-bold text-cyan-3">{{ b.entity }}</span>
                                                <span class="text-amber-4">{{ b.targetWidget }}</span>
                                            </div>
                                            <div class="text-slate-400 q-mt-xs text-caption" style="font-size: 9px;">
                                                Fields: {{ b.fields ? b.fields.join(', ') : 'All' }}
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Architecture Summary / Message -->
                                    <div v-if="resolvedPayload.architectureSummary || resolvedPayload.message" class="q-pa-xs rounded-borders bg-slate-900 text-caption text-slate-200" style="border: 1px solid #1e293b;">
                                        <div class="text-weight-bold text-cyan-3 q-mb-xs">Architecture Summary:</div>
                                        <div class="font-mono text-caption" style="line-height: 1.4;">
                                            {{ resolvedPayload.architectureSummary || resolvedPayload.message }}
                                        </div>
                                    </div>

                                    <!-- Formulation Steps Checklist -->
                                    <div v-if="resolvedPayload.formulationSteps && resolvedPayload.formulationSteps.length > 0" class="column q-gutter-y-xs q-pa-xs rounded-borders bg-slate-900" style="border: 1px solid #1e293b;">
                                        <span class="text-caption text-slate-400 font-bold" style="font-size: 10px;">FORMULATION STEPS:</span>
                                        <div v-for="(step, sIdx) in resolvedPayload.formulationSteps" :key="sIdx" class="row no-wrap items-start q-gutter-x-xs font-mono text-caption text-slate-300" style="font-size: 10px;">
                                            <q-icon name="check_circle" size="12px" color="cyan-4" class="q-mt-xs" />
                                            <span>{{ step }}</span>
                                        </div>
                                    </div>

                                    <!-- Decomposed Subplans Matrix -->
                                    <div v-if="resolvedPayload.subplans && resolvedPayload.subplans.length > 0" class="column q-gutter-y-xs q-pa-xs rounded-borders bg-slate-900" style="border: 1px solid #1e293b;">
                                        <span class="text-caption text-slate-400 font-bold" style="font-size: 10px;">ATOMIC SUBPLANS:</span>
                                        <div v-for="sp in resolvedPayload.subplans" :key="sp.subplanId" class="q-pa-xs rounded bg-slate-950 font-mono text-caption q-mb-xs" style="border: 1px solid #334155;">
                                            <div class="text-weight-bold text-amber-3">{{ sp.phase || sp.subplanId }}</div>
                                            <div class="text-slate-300 q-mt-xs" style="font-size: 9px;">{{ sp.objective }}</div>
                                        </div>
                                    </div>
                                </div>
                            </template>

                            <!-- C. HISTORIC NODE: FORMATTED JSON TAB -->
                            <template v-else-if="activeOutputTab === 'json' && resolvedPayload">
                                <div class="bg-slate-900 q-pa-sm rounded-borders font-mono text-caption" style="border: 1px solid #1e3a5f;">
                                    <pre class="q-ma-none text-cyan-2" style="white-space: pre-wrap; font-size: 11px; line-height: 1.4;">{{ formattedJsonString }}</pre>
                                </div>
                            </template>

                            <!-- D. HISTORIC NODE: PROMPT DIRECTIVE TAB -->
                            <template v-else-if="activeOutputTab === 'prompt'">
                                <div class="q-pa-sm rounded-borders bg-slate-900 text-caption text-slate-100 font-mono" style="border: 1px solid #1e3a5f; white-space: pre-wrap; line-height: 1.4;">
                                    {{ rawStageBody }}
                                </div>
                            </template>

                            <!-- E. HISTORIC NODE: RAW MARKDOWN TAB (FALLBACK) -->
                            <template v-else-if="rawStageBody">
                                <div class="q-pa-xs rounded-borders bg-slate-900 text-caption text-slate-100 font-mono" style="border: 1px solid #1e3a5f;">
                                    <div class="markdown-body font-mono text-caption" v-html="formatOutput(rawStageBody)"></div>
                                </div>
                            </template>

                            <!-- F. EMPTY STATE -->
                            <template v-else>
                                <div class="column flex-center text-slate-500 text-caption q-my-xl">
                                    <q-icon name="touch_app" size="24px" class="q-mb-xs" />
                                    <span>Select a compute stage card on the canvas above.</span>
                                </div>
                            </template>

                        </div>
                    </div>

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