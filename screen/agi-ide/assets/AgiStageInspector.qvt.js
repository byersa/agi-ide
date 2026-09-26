(function () {
    const AgiStageInspector = {
        name: 'AgiStageInspector',
        emits: ['stage-dispatched', 'stage-mutated', 'advance-stance'],
        props: {
            discussionId: { type: String, default: '' },
            selectedStage: { type: Object, default: () => null },
            selectedEdge: { type: Object, default: () => null },
            targetComponent: { type: String, default: 'nursinghome' }
        },
        data() {
            return {
                splitRatio: 50,
                isDispatching: false,

                // Input Staging State (Editable Left Pane)
                inputDirective: '',
                inputTargetArtifact: '',
                inputMantleInvariants: true,
                inputContextPayload: '',

                // Edge Bridge Staging
                mappedExtractText: ''
            };
        },
        computed: {
            isEdgeMode() {
                return !!(this.selectedEdge && this.selectedEdge.fromStage && this.selectedEdge.toStage);
            },
            currentActionType() {
                if (this.isEdgeMode) return 'bridge';
                return (this.selectedStage?.actionType || 'discuss').toLowerCase();
            },
            inspectorTitle() {
                if (this.isEdgeMode) {
                    return `TRANSITION BRIDGE: Stage #${this.selectedEdge.fromStage.stageId} ➔ Stage #${this.selectedEdge.toStage.stageId}`;
                }
                if (!this.selectedStage) return 'No Compute Stage Selected';
                return `STAGE #${this.selectedStage.stageId}: ${this.selectedStage.actionType.toUpperCase()}`;
            }
        },
        watch: {
            selectedStage: {
                immediate: true,
                handler(val) {
                    if (val) {
                        this.inputDirective = val.fullText || val.label || '';
                        this.inputTargetArtifact = val.targetArtifactUri || '';
                    }
                }
            },
            selectedEdge: {
                immediate: true,
                handler(val) {
                    if (val) {
                        this.mappedExtractText = '';
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

            // Map selected elements from Stage N output directly into Stage N+1 input
            mapUpstreamOutput() {
                if (!this.selectedEdge?.fromStage) return;
                const upstreamText = this.selectedEdge.fromStage.fullText || '';
                this.inputDirective = `Based on output from Stage #${this.selectedEdge.fromStage.stageId}:\n${upstreamText.substring(0, 300)}...`;
                this.$q.notify({
                    type: 'positive',
                    message: `Mapped Stage #${this.selectedEdge.fromStage.stageId} output into input staging.`,
                    icon: 'move_to_inbox',
                    timeout: 2500
                });
            },

            async executeComputeStage() {
                if (!this.discussionId) {
                    this.$q.notify({ type: 'warning', message: 'No active pipeline selected.' });
                    return;
                }

                this.isDispatching = true;
                const activeMode = this.currentActionType === 'bridge' ? 'discuss' : this.currentActionType;
                const parentId = this.isEdgeMode
                    ? this.selectedEdge.fromStage.stageId
                    : (this.selectedStage?.stageId || null);

                try {
                    // 1. Record User Directive Turn
                    const userTurnResp = await axios.post('/rest/s1/agi-ai/discussions/message', {
                        discussionId: this.discussionId,
                        parentMessageId: parentId,
                        senderRoleEnumId: 'AsrUser',
                        content: this.inputDirective,
                        targetArtifactUri: this.inputTargetArtifact
                    }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                    const userMsgId = userTurnResp.data?.messageId;

                    // 2. Dispatch AI Compute Step
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
                if (!text) return '<span class="text-slate-500 italic">No output artifacts generated.</span>';
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
            <div class="agi-stage-inspector fit column no-wrap bg-slate-950 font-mono text-white overflow-hidden" style="height: 100%; min-height: 0;">
                
                <!-- 1. TOP STATUS & CONTEXT BAR (FIXED 34px) -->
                <div class="row items-center justify-between q-px-sm q-py-xs bg-slate-900" style="border-bottom: 1px solid #334155; height: 34px; min-height: 34px; flex: 0 0 34px;">
                    <div class="row items-center q-gutter-x-xs">
                        <q-icon :name="isEdgeMode ? 'swap_horiz' : 'tune'" color="cyan-3" size="16px" />
                        <span class="text-caption text-weight-bold text-cyan-2" style="font-size: 11px;">
                            {{ inspectorTitle }}
                        </span>
                        
                        <q-badge v-if="selectedStage?.stagedPayloadId" color="deep-purple-8" text-color="white" class="font-mono text-caption q-ml-xs" style="font-size: 9px;">
                            PAYLOAD #{{ selectedStage.stagedPayloadId }}
                        </q-badge>
                    </div>

                    <div class="row items-center q-gutter-x-xs">
                        <q-btn-group flat dense>
                            <q-btn flat dense size="xs" color="cyan-3" label="Discuss" @click="advanceToNext('discuss')" />
                            <q-btn flat dense size="xs" color="purple-3" label="Plan" @click="advanceToNext('plan')" />
                            <q-btn flat dense size="xs" color="amber-4" label="Build" @click="advanceToNext('build')" />
                        </q-btn-group>
                    </div>
                </div>

                <!-- 2. SPLIT DUAL-PANE VIEWPORT -->
                <div class="col row no-wrap overflow-hidden" style="height: calc(100% - 34px); min-height: 0;">
                    
                    <!-- LEFT PANE: INPUT CONFIGURATOR (EDITABLE) -->
                    <div class="column no-wrap overflow-hidden" :style="{ width: splitRatio + '%', flex: '0 0 ' + splitRatio + '%', borderRight: '1px solid #334155', height: '100%', minHeight: 0 }">
                        <div class="row items-center justify-between q-pa-xs bg-slate-900" style="border-bottom: 1px solid #1e293b; height: 28px; min-height: 28px; flex: 0 0 28px;">
                            <span class="text-caption text-weight-bold text-amber-3" style="font-size: 10px;">
                                {{ isEdgeMode ? 'SOURCE: UPSTREAM STAGE OUTPUT' : 'STAGE INPUT CONFIGURATOR' }}
                            </span>
                            <span class="text-slate-500 text-caption font-mono" style="font-size: 9px;">
                                {{ currentActionType.toUpperCase() }} MODE
                            </span>
                        </div>

                        <div class="col relative-position overflow-hidden" style="flex: 1 1 0%; min-height: 0;">
                            <q-scroll-area class="fit" :thumb-style="{ right: '2px', borderRadius: '4px', backgroundColor: '#f59e0b', width: '5px', opacity: 0.8 }">
                                <div class="q-pa-sm column q-gutter-y-sm">
                                    
                                    <!-- A. EDGE BRIDGE MODE: INSPECT UPSTREAM OUTPUT -->
                                    <template v-if="isEdgeMode">
                                        <div class="q-pa-xs rounded-borders bg-slate-900 text-caption text-slate-300" style="border: 1px solid #334155;">
                                            <div class="text-weight-bold text-cyan-3 q-mb-xs">Stage #{{ selectedEdge.fromStage.stageId }} Output Artifact:</div>
                                            <div class="markdown-body font-mono text-caption" v-html="formatOutput(selectedEdge.fromStage.fullText)"></div>
                                        </div>

                                        <q-btn 
                                            color="deep-purple-7" 
                                            text-color="white" 
                                            icon="forward" 
                                            label="Map Selected Output to Stage Input" 
                                            dense no-caps 
                                            class="text-weight-bold q-py-xs full-width"
                                            @click="mapUpstreamOutput"
                                        />
                                    </template>

                                    <!-- B. NODE MODE: TAILORED INPUT FORM -->
                                    <template v-else>
                                        <!-- Target File / Artifact Anchor -->
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

                                        <!-- Directive / Prompt TextArea -->
                                        <div class="column q-gutter-y-xs">
                                            <label class="text-caption text-slate-400 font-mono" style="font-size: 10px;">STAGE DIRECTIVE / PROMPT PAYLOAD:</label>
                                            <q-input 
                                                v-model="inputDirective" 
                                                type="textarea" 
                                                rows="5" 
                                                dense dark outlined 
                                                color="cyan-3"
                                                class="font-mono text-caption"
                                                input-class="font-mono text-slate-100"
                                                style="background-color: #020617; border-radius: 4px;"
                                                placeholder="Enter stage directive or paste input payload..."
                                            />
                                        </div>

                                        <!-- Architectural Rules / Mantle Invariants Toggle -->
                                        <div class="row items-center justify-between q-pa-xs rounded-borders bg-slate-900" style="border: 1px solid #1e293b;">
                                            <span class="text-caption text-slate-300 font-mono" style="font-size: 10px;">Mantle UDM Invariants Enforced</span>
                                            <q-toggle v-model="inputMantleInvariants" dense color="cyan-4" />
                                        </div>

                                        <!-- Dispatch Compute Execution -->
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
                                    </template>

                                </div>
                            </q-scroll-area>
                        </div>
                    </div>

                    <!-- RIGHT PANE: OUTPUT & ARTIFACT VIEWER (READ-ONLY) -->
                    <div class="col column no-wrap overflow-hidden" style="height: 100%; min-height: 0;">
                        <div class="row items-center justify-between q-pa-xs bg-slate-900" style="border-bottom: 1px solid #1e293b; height: 28px; min-height: 28px; flex: 0 0 28px;">
                            <span class="text-caption text-weight-bold text-cyan-3" style="font-size: 10px;">
                                {{ isEdgeMode ? 'TARGET: DOWNSTREAM STAGE INPUT STAGING' : 'STAGE OUTPUT ARTIFACT' }}
                            </span>
                            <span class="text-slate-500 text-caption font-mono" style="font-size: 9px;">READ-ONLY ARTIFACT</span>
                        </div>

                        <div class="col relative-position overflow-hidden" style="flex: 1 1 0%; min-height: 0;">
                            <q-scroll-area class="fit" :thumb-style="{ right: '2px', borderRadius: '4px', backgroundColor: '#0284c7', width: '5px', opacity: 0.8 }">
                                <div class="q-pa-sm column q-gutter-y-sm">
                                    
                                    <!-- A. EDGE BRIDGE: DOWNSTREAM INPUT STAGING -->
                                    <template v-if="isEdgeMode">
                                        <div class="text-caption text-slate-300 font-mono">
                                            Staged Directive for Next Stage (#{{ selectedEdge.toStage.stageId }}):
                                        </div>
                                        <pre class="bg-slate-900 q-pa-xs rounded-borders text-cyan-2 font-mono text-caption" style="border: 1px solid #1e293b; white-space: pre-wrap;">{{ inputDirective || selectedEdge.toStage.fullText }}</pre>
                                    </template>

                                    <!-- B. NODE MODE: DISPLAY OUTPUT -->
                                    <template v-else>
                                        <div v-if="selectedStage?.fullText" class="q-pa-xs rounded-borders bg-slate-900 text-caption text-slate-100 font-mono" style="border: 1px solid #1e3a5f;">
                                            <div class="markdown-body font-mono text-caption" v-html="formatOutput(selectedStage.fullText)"></div>
                                        </div>
                                        <div v-else class="text-slate-500 italic text-caption text-center q-my-lg">
                                            Select a compute stage or transition arrow above to inspect outputs.
                                        </div>
                                    </template>

                                </div>
                            </q-scroll-area>
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