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
                isAdvancing: false,

                payloadCache: {},
                activePort: 'OUT',
                showIngressDiff: false,
                editIngressSpec: false,
                activeOutputTab: 'contract',

                inputDirective: '',
                inputTargetArtifact: '',
                inputMantleInvariants: true,
                rootStance: 'plan',

                customArchetype: '',
                customEntitiesText: '',
                customRawJson: ''
            };
        },
        computed: {
            stepId() {
                if (!this.selectedStage) return '';
                return this.selectedStage.pipelineStepId || this.selectedStage.stageId || '';
            },
            isDraft() {
                if (!this.selectedStage) return true;
                return this.selectedStage.statusId === 'PlsDraft' || !this.selectedStage.egressPayloadId;
            },
            currentActionType() {
                if (!this.selectedStage) return this.rootStance || 'plan';
                return (this.selectedStage.actionType || 'discuss').toLowerCase();
            },
            displayTargetArtifactUri() {
                if (!this.selectedStage) return this.inputTargetArtifact || '';
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

                let rawObj = null;
                const egressId = this.selectedStage.egressPayloadId || this.selectedStage.stagedPayloadId;
                if (egressId && this.payloadCache[String(egressId)]) {
                    rawObj = this.payloadCache[String(egressId)];
                } else if (this.selectedStage.egressJsonData) {
                    rawObj = this.tryParseJson(this.selectedStage.egressJsonData);
                } else if (this.rawStageBody) {
                    rawObj = this.tryParseJson(this.rawStageBody) || this.extractJsonFromText(this.rawStageBody);
                }

                return this.unwrapPayload(rawObj);
            },
            resolvedIngressPayload() {
                if (!this.selectedStage) return null;

                let rawObj = null;
                const ingressId = this.selectedStage.ingressPayloadId;
                if (ingressId && this.payloadCache[String(ingressId)]) {
                    rawObj = this.payloadCache[String(ingressId)];
                } else if (this.selectedStage.ingressJsonData) {
                    rawObj = this.tryParseJson(this.selectedStage.ingressJsonData);
                } else if (this.selectedParentStage) {
                    const parentEgressId = this.selectedParentStage.egressPayloadId || this.selectedParentStage.stagedPayloadId;
                    if (parentEgressId && this.payloadCache[String(parentEgressId)]) {
                        rawObj = this.payloadCache[String(parentEgressId)];
                    } else if (this.selectedParentStage.egressJsonData) {
                        rawObj = this.tryParseJson(this.selectedParentStage.egressJsonData);
                    }
                }

                return this.unwrapPayload(rawObj);
            },
            resolvedRawXml() {
                const p = this.resolvedEgressPayload;
                if (p) {
                    if (p.rawXmlContent && typeof p.rawXmlContent === 'string') return p.rawXmlContent;
                    if (p.xmlTemplate && typeof p.xmlTemplate === 'string') return p.xmlTemplate;
                    if (p.payload && typeof p.payload === 'object' && p.payload.rawXmlContent) return p.payload.rawXmlContent;
                }
                if (typeof this.rawStageBody === 'string') {
                    const match = this.rawStageBody.match(/```(?:xml)?\s*([\s\S]*?)\s*```/);
                    if (match && match[1] && match[1].includes('<screen')) return match[1].trim();
                    if (this.rawStageBody.trim().startsWith('<screen') || this.rawStageBody.trim().startsWith('<?xml')) {
                        return this.rawStageBody.trim();
                    }
                }
                return '';
            },
            formattedEgressJsonString() {
                if (!this.resolvedEgressPayload) return '';
                try {
                    return JSON.stringify(this.cleanseContract(this.resolvedEgressPayload), null, 2);
                } catch (e) {
                    return String(this.resolvedEgressPayload);
                }
            },
            formattedIngressJsonString() {
                if (!this.resolvedIngressPayload) return '';
                try {
                    return JSON.stringify(this.cleanseContract(this.resolvedIngressPayload), null, 2);
                } catch (e) {
                    return String(this.resolvedIngressPayload);
                }
            },
            computedDeltaSummary() {
                if (!this.resolvedIngressPayload || !this.resolvedEgressPayload) {
                    return { added: [], removed: [], changed: [] };
                }

                const cleanIn = this.cleanseContract(this.resolvedIngressPayload);
                const cleanOut = this.cleanseContract(this.resolvedEgressPayload);

                const inKeys = Object.keys(cleanIn);
                const outKeys = Object.keys(cleanOut);

                const added = outKeys.filter(k => !inKeys.includes(k));
                const removed = inKeys.filter(k => !outKeys.includes(k));
                const changed = inKeys.filter(k => outKeys.includes(k) && JSON.stringify(cleanIn[k]) !== JSON.stringify(cleanOut[k]));

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
                        this.hydrateIngressEditor();
                    } else {
                        this.inputDirective = '';
                        this.inputTargetArtifact = '';
                        this.activePort = 'IN';
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

            cleanseContract(obj) {
                if (!obj || typeof obj !== 'object') return {};
                const unwrapped = this.unwrapPayload(obj);
                if (!unwrapped || typeof unwrapped !== 'object') return {};

                const clean = {};
                const allowedKeys = [
                    'targetArtifactUri',
                    'createdArtifactUri',
                    'recommendedArchetype',
                    'recommendedArchetypeUri',
                    'suggestedEntities',
                    'screenContract',
                    'entityFieldBindings',
                    'securityAndHipaaRules',
                    'architectureSummary',
                    'formulationSteps',
                    'subplans',
                    'rawXmlContent'
                ];

                allowedKeys.forEach(k => {
                    if (unwrapped[k] !== undefined && unwrapped[k] !== null) {
                        clean[k] = unwrapped[k];
                    }
                });

                if (Object.keys(clean).length === 0) {
                    const blacklistedKeys = [
                        'payloadDetails', 'payload', 'payloadJsonData', 'planDetails', 'facets',
                        'agiPayloadId', 'modeEnumId', 'statusId', 'targetComponent', 'targetMariaId',
                        'agiArtifactId', 'discussionId', 'messageId', 'isLeaf', 'workEffortId',
                        'wikiPageId', 'parentPayloadId', 'title', 'userPromptText', 'executionResultJson',
                        'revisionNumber', 'contentSha256', 'createdDate', 'lastUpdatedStamp'
                    ];
                    Object.keys(unwrapped).forEach(k => {
                        if (!blacklistedKeys.includes(k)) {
                            clean[k] = unwrapped[k];
                        }
                    });
                }

                return clean;
            },

            synthesizeBuildDirective(plan) {
                if (!plan) return 'Build the canonical Moqui XML screen and UI artifacts from the approved plan.';
                const clean = this.cleanseContract(plan);
                const targetScreen = clean.targetArtifactUri || clean.createdArtifactUri || 'target XML screen';
                const archetype = clean.recommendedArchetype || 'standard layout';
                const entities = Array.isArray(clean.suggestedEntities) ? clean.suggestedEntities.map(e => e.split('.').pop()).join(', ') : '';

                let prompt = `Build the canonical Moqui XML screen for ${targetScreen} based on the approved architecture plan.\n\n`;
                prompt += `Core Objectives:\n`;
                prompt += `- Implement the '${archetype}' archetype layout.\n`;
                if (entities) {
                    prompt += `- Bind data structures and UDM entities for: ${entities}.\n`;
                }
                if (clean.screenContract?.requiredPermissions?.length > 0) {
                    prompt += `- Enforce security and required permissions: ${clean.screenContract.requiredPermissions.join(', ')}.\n`;
                }
                prompt += `- Adhere to all formulation steps specified in the Ingress Contract.`;
                return prompt;
            },

            unwrapPayload(obj) {
                if (!obj || typeof obj !== 'object') return null;
                let current = Object.assign({}, obj);

                if (current.payloadDetails) current = Object.assign({}, current, current.payloadDetails);
                if (current.payload && typeof current.payload === 'object') current = Object.assign({}, current, current.payload);

                if (typeof current.planDetails === 'string') {
                    const parsedInner = this.tryParseJson(current.planDetails) || this.extractJsonFromText(current.planDetails);
                    if (parsedInner && typeof parsedInner === 'object') {
                        current = Object.assign({}, current, parsedInner);
                    }
                } else if (current.planDetails && typeof current.planDetails === 'object') {
                    current = Object.assign({}, current, current.planDetails);
                }

                if (typeof current.payloadJsonData === 'string') {
                    const parsedJsonData = this.tryParseJson(current.payloadJsonData) || this.extractJsonFromText(current.payloadJsonData);
                    if (parsedJsonData && typeof parsedJsonData === 'object') {
                        if (typeof parsedJsonData.planDetails === 'string') {
                            const innerPlan = this.tryParseJson(parsedJsonData.planDetails) || this.extractJsonFromText(parsedJsonData.planDetails);
                            if (innerPlan && typeof innerPlan === 'object') {
                                Object.assign(parsedJsonData, innerPlan);
                            }
                        }
                        current = Object.assign({}, current, parsedJsonData);
                    }
                }

                return current;
            },

            hydrateIngressEditor() {
                this.$nextTick(() => {
                    const p = this.resolvedIngressPayload;
                    if (p) {
                        const clean = this.cleanseContract(p);
                        this.customArchetype = clean.recommendedArchetype || '';
                        this.customEntitiesText = Array.isArray(clean.suggestedEntities) ? clean.suggestedEntities.join(', ') : '';
                        this.customRawJson = JSON.stringify(clean, null, 2);
                    }
                });
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
                    if (this.currentActionType === 'build' && this.resolvedRawXml) {
                        this.activeOutputTab = 'raw';
                    } else if (p && (p.screenContract || p.suggestedEntities || p.recommendedArchetype || p.formulationSteps || p.subplans || p.architectureSummary)) {
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
                    this.hydrateIngressEditor();
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

            triggerOpenArtifact(uri) {
                const targetUri = uri || this.displayTargetArtifactUri;
                if (!targetUri) {
                    this.$q.notify({ type: 'warning', message: 'No target artifact URI specified.' });
                    return;
                }
                this.$emit('open-artifact', {
                    artifactUri: targetUri,
                    rawXmlContent: this.resolvedRawXml || null
                });
            },

            async advanceToBuild() {
                const targetStepId = this.stepId;
                if (!targetStepId) return;

                this.isAdvancing = true;
                try {
                    const sourceEgressId = this.selectedStage?.egressPayloadId || this.selectedStage?.stagedPayloadId;
                    const cleanContract = this.cleanseContract(this.resolvedEgressPayload);
                    const cleanContractJson = JSON.stringify(cleanContract, null, 2);
                    const synthesizedPrompt = this.synthesizeBuildDirective(this.resolvedEgressPayload);

                    const resp = await axios.post('/rest/s1/agi-ai/pipeline/step/fork', {
                        sourceStepId: targetStepId,
                        targetStanceEnumId: 'AamBuild',
                        ingressPayloadId: sourceEgressId,
                        modifiedPayloadJson: cleanContractJson,
                        directivePrompt: synthesizedPrompt
                    }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                    this.isAdvancing = false;
                    this.$q.notify({
                        type: 'positive',
                        message: `Successor Step #${resp.data?.newStepId} (BUILD) initialized with clean spec contract.`,
                        icon: 'handyman'
                    });

                    this.$emit('stage-dispatched', {
                        discussionId: this.discussionId,
                        pipelineStepId: resp.data?.newStepId
                    });
                } catch (e) {
                    this.isAdvancing = false;
                    this.$q.notify({
                        type: 'negative',
                        message: 'Advance failed: ' + (e.response?.data?.errors || e.message)
                    });
                }
            },

            async executeComputeStage() {
                if (!this.discussionId) {
                    this.$q.notify({ type: 'warning', message: 'No active pipeline selected.' });
                    return;
                }

                if (!this.inputDirective || !this.inputDirective.trim()) {
                    this.$q.notify({ type: 'warning', message: 'Please enter a directive prompt.' });
                    return;
                }

                this.isDispatching = true;
                const activeStance = this.selectedStage ? this.currentActionType : (this.rootStance || 'plan');
                const parentId = this.selectedStage?.parentStepId || this.selectedParentStage?.pipelineStepId || null;

                let effectiveIngressId = this.selectedStage?.ingressPayloadId || null;
                let payloadOverrideJson = null;

                if (this.editIngressSpec && this.customRawJson && this.customRawJson.trim()) {
                    try {
                        const parsedCustom = JSON.parse(this.customRawJson.trim());
                        if (this.customArchetype) parsedCustom.recommendedArchetype = this.customArchetype.trim();
                        if (this.customEntitiesText) {
                            parsedCustom.suggestedEntities = this.customEntitiesText.split(',').map(s => s.trim()).filter(Boolean);
                        }
                        payloadOverrideJson = JSON.stringify(parsedCustom, null, 2);
                    } catch (e) {
                        this.$q.notify({ type: 'negative', message: 'Invalid custom Ingress JSON: ' + e.message });
                        this.isDispatching = false;
                        return;
                    }
                }

                try {
                    const dispatchPayload = {
                        discussionId: this.discussionId,
                        parentStepId: parentId,
                        stanceEnumId: activeStance,
                        directivePrompt: this.inputDirective,
                        ingressPayloadId: effectiveIngressId,
                        targetArtifactUri: this.inputTargetArtifact,
                        stepLabel: this.inputDirective.substring(0, 50)
                    };

                    if (payloadOverrideJson) {
                        dispatchPayload.modifiedPayloadJson = payloadOverrideJson;
                    }

                    const dispatchResp = await axios.post('/rest/s1/agi-ai/pipeline/step/dispatch', dispatchPayload, {
                        headers: { 'moquiSessionToken': this.resolveCsrf() }
                    });

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
                const targetStepId = this.stepId;
                if (!targetStepId) return;

                this.isForking = true;
                try {
                    const resp = await axios.post('/rest/s1/agi-ai/pipeline/step/fork', {
                        sourceStepId: targetStepId,
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
                const targetStepId = this.stepId;
                if (!targetStepId) {
                    this.$q.notify({ type: 'warning', message: 'No step selected to archive.' });
                    return;
                }

                if (this.selectedStage?.discussionId && String(this.selectedStage.discussionId) !== String(this.discussionId)) {
                    this.$q.notify({
                        type: 'negative',
                        message: `State mismatch: Step #${targetStepId} belongs to discussion #${this.selectedStage.discussionId}, not #${this.discussionId}. Selection cleared.`
                    });
                    this.$emit('stage-dispatched', { discussionId: this.discussionId });
                    return;
                }

                const label = this.selectedStage?.label || `Step #${targetStepId}`;

                this.$q.dialog({
                    title: 'Archive Pipeline Step & Branch',
                    message: `Archive Step #${targetStepId} ("${label}") in pipeline #${this.discussionId}? All child steps downstream on this branch will also be archived.`,
                    cancel: true,
                    persistent: true,
                    dark: true
                }).onOk(async () => {
                    this.isArchiving = true;
                    try {
                        const resp = await axios.post('/rest/s1/agi-ai/pipeline/step/archive', {
                            pipelineStepId: targetStepId
                        }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                        this.isArchiving = false;
                        this.$q.notify({
                            type: 'positive',
                            message: `Archived ${resp.data?.archivedCount || 1} step(s) on branch.`,
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
                if (this.selectedStage) {
                    this.$emit('advance-stance', {
                        nextStance: stance,
                        fromStage: this.selectedStage
                    });
                } else {
                    this.rootStance = stance;
                }
            }
        },
        template: `
            <div class="agi-stage-inspector fit column no-wrap font-mono text-white overflow-hidden" style="background-color: #020617; height: 100%; min-height: 0; width: 100%;">
                
                <!-- 1. UNIFIED CONTEXT & PROVENANCE HEADER (FIXED 38px) -->
                <div 
                    class="row items-center justify-between q-px-sm" 
                    :style="{ 
                        backgroundColor: '#0f172a',
                        borderBottom: '2px solid ' + (selectedStage ? themeStyle.bg : '#38bdf8'), 
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
                                    @click="triggerOpenArtifact(displayTargetArtifactUri)"
                                >
                                    <q-tooltip>Open in Workspace Viewport</q-tooltip>
                                </q-btn>
                            </div>

                            <q-btn flat round dense size="xs" icon="my_location" color="cyan-3" @click="locateStageOnCanvas(stepId)">
                                <q-tooltip>Scroll to this card on DAG Canvas</q-tooltip>
                            </q-btn>
                        </template>

                        <!-- B. EMPTY STAGE INITIALIZATION HEADER -->
                        <template v-else-if="discussionId">
                            <div class="row items-center q-px-xs rounded-borders font-mono text-caption text-weight-bolder" style="background-color: #020617; color: #38bdf8; border: 1px solid #0284c7; font-size: 10px; height: 22px; line-height: 20px;">
                                STEP 1 (INITIAL)
                            </div>
                            <div class="row items-center q-px-xs rounded-borders text-weight-bolder" style="background-color: #7c3aed; color: #ffffff; height: 22px;">
                                <q-icon name="play_arrow" size="13px" class="q-mr-xs" />
                                <span class="text-caption font-mono" style="font-size: 10px;">ROOT DISPATCH</span>
                            </div>
                            <span class="text-caption text-slate-400 font-mono" style="font-size: 10px;">Pipeline #{{ discussionId }}</span>
                        </template>

                        <template v-else>
                            <q-icon name="info" color="slate-500" size="16px" />
                            <span class="text-caption italic" style="color: #94a3b8;">Select or create a pipeline initiative.</span>
                        </template>
                    </div>

                    <!-- Pipeline Action Toolbar -->
                    <div class="row items-center q-gutter-x-xs">
                        <template v-if="selectedStage">
                            <q-btn 
                                v-if="!isDraft && currentActionType === 'plan'"
                                flat dense no-caps size="xs"
                                icon="handyman"
                                label="Advance to BUILD"
                                color="amber-3"
                                class="q-px-xs rounded-borders bg-amber-10 text-weight-bolder"
                                style="border: 1px solid #f59e0b;"
                                :loading="isAdvancing"
                                @click="advanceToBuild"
                            >
                                <q-tooltip>Spawn a downstream BUILD step inheriting this plan's egress contract</q-tooltip>
                            </q-btn>

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
                        </template>

                        <span class="text-slate-500 font-mono text-caption q-mr-xs" style="font-size: 9px;">STANCE:</span>
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
                    
                    <!-- CASE A: NO PIPELINE SELECTED -->
                    <template v-if="!discussionId">
                        <div class="fit column flex-center text-slate-500 font-mono">
                            <q-icon name="account_tree" size="32px" class="q-mb-sm text-cyan-4" />
                            <span>Select or create a pipeline initiative in the bar above.</span>
                        </div>
                    </template>

                    <!-- CASE B: NO STAGE SELECTED (INITIALIZE ROOT STEP 1) -->
                    <template v-else-if="!selectedStage">
                        <div class="col q-pa-md overflow-auto" style="flex: 1 1 0%; min-height: 0; height: 100%;">
                            <div class="column q-gutter-y-md" style="max-width: 900px; margin: 0 auto;">
                                <div class="row items-center q-gutter-x-sm q-pa-sm rounded-borders" style="background-color: #0b1329; border: 1px solid #0284c7;">
                                    <q-icon name="rocket_launch" color="cyan-3" size="20px" />
                                    <div>
                                        <div class="text-weight-bold text-cyan-2" style="font-size: 12px;">INITIALIZE ROOT PIPELINE STEP</div>
                                        <div class="text-caption text-slate-400" style="font-size: 10px;">Author the initial directive prompt to launch Step 1 of this pipeline.</div>
                                    </div>
                                </div>

                                <div class="column q-gutter-y-xs">
                                    <label class="text-caption font-mono text-weight-bold" style="color: #94a3b8; font-size: 10px;">TARGET ARTIFACT LOCATION (OPTIONAL):</label>
                                    <q-input 
                                        v-model="inputTargetArtifact" 
                                        dense dark outlined 
                                        color="cyan-3"
                                        class="font-mono text-caption"
                                        input-class="font-mono text-cyan-2"
                                        style="background-color: #020617; border-radius: 4px;"
                                        placeholder="component://nursinghome/screen/... or leave blank"
                                    />
                                </div>

                                <div class="column q-gutter-y-xs">
                                    <label class="text-caption font-mono text-weight-bold" style="color: #94a3b8; font-size: 10px;">INITIAL DIRECTIVE / DISPATCH PROMPT:</label>
                                    <q-input 
                                        v-model="inputDirective" 
                                        type="textarea" 
                                        rows="6" 
                                        dense dark outlined 
                                        color="cyan-3"
                                        class="font-mono text-caption"
                                        input-class="font-mono text-slate-100"
                                        style="background-color: #020617; border-radius: 4px;"
                                        placeholder="Enter initial directive (e.g. 'Formulate the high-level architecture plan for Clinical Dashboard')..."
                                    />
                                </div>

                                <div class="row items-center justify-between q-pa-sm rounded-borders" style="background-color: #0f172a; border: 1px solid #1e293b;">
                                    <div class="row items-center q-gutter-x-xs">
                                        <span class="text-caption font-mono" style="color: #cbd5e1; font-size: 10px;">Mantle UDM Invariants Enforced</span>
                                        <q-toggle v-model="inputMantleInvariants" dense color="cyan-4" size="xs" />
                                    </div>

                                    <q-btn 
                                        color="primary"
                                        text-color="white"
                                        icon="bolt" 
                                        label="Dispatch Root Step 1" 
                                        dense no-caps 
                                        class="text-weight-bold q-px-md q-py-xs font-mono"
                                        :loading="isDispatching"
                                        @click="executeComputeStage"
                                    />
                                </div>
                            </div>
                        </div>
                    </template>

                    <!-- CASE C: [IN] INGRESS VIEWPORT -->
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
                                <div v-if="isDraft" class="row items-center q-gutter-x-xs">
                                    <span class="text-caption font-mono text-weight-bold" :class="editIngressSpec ? 'text-amber-3' : 'text-slate-400'" style="font-size: 9px;">EDIT SPEC OVERRIDES:</span>
                                    <q-toggle v-model="editIngressSpec" dense color="amber-4" size="xs" />
                                </div>

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
                                        rows="4" 
                                        dense dark outlined 
                                        color="cyan-3"
                                        class="font-mono text-caption"
                                        input-class="font-mono text-slate-100"
                                        style="background-color: #020617; border-radius: 4px;"
                                        placeholder="Enter step directive or transition instructions..."
                                    />
                                </div>

                                <!-- INTERACTIVE INGRESS SPEC OVERRIDE PANEL -->
                                <div v-if="editIngressSpec" class="column q-gutter-y-sm q-pa-sm rounded-borders" style="background-color: #0f172a; border: 1px solid #f59e0b;">
                                    <div class="row items-center justify-between">
                                        <span class="text-caption text-weight-bold text-amber-3" style="font-size: 10px;">
                                            INGRESS SPEC OVERRIDES (PRE-FLIGHT CONFIGURATION FOR BUILD):
                                        </span>
                                        <span class="text-caption font-mono text-slate-400" style="font-size: 9px;">Editing will clone and isolate the ingress contract</span>
                                    </div>

                                    <div class="row q-col-gutter-sm">
                                        <div class="col-6">
                                            <label class="text-caption font-mono text-slate-400" style="font-size: 9px;">OVERRIDE ARCHETYPE:</label>
                                            <q-input v-model="customArchetype" dense dark outlined color="amber-4" class="font-mono text-caption" input-class="font-mono text-amber-2" style="background-color: #020617;" placeholder="master-detail, single-form, etc." />
                                        </div>
                                        <div class="col-6">
                                            <label class="text-caption font-mono text-slate-400" style="font-size: 9px;">BOUND ENTITIES (COMMA-SEPARATED):</label>
                                            <q-input v-model="customEntitiesText" dense dark outlined color="amber-4" class="font-mono text-caption" input-class="font-mono text-cyan-2" style="background-color: #020617;" placeholder="mantle.facility.Facility, mantle.party.Person..." />
                                        </div>
                                    </div>

                                    <div class="column q-gutter-y-xs q-mt-xs">
                                        <label class="text-caption font-mono text-slate-400" style="font-size: 9px;">CLEANSED INGRESS JSON CONTRACT:</label>
                                        <q-input v-model="customRawJson" type="textarea" rows="8" dense dark outlined color="amber-4" class="font-mono text-caption" input-class="font-mono text-slate-200" style="background-color: #020617; font-size: 10px;" />
                                    </div>
                                </div>

                                <!-- DELTA DIFF VIEW -->
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

                    <!-- CASE D: [OUT] EGRESS VIEWPORT -->
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
                                <!-- STAGED VIRTUAL SCREEN XML QUICK LAUNCH BUTTON -->
                                <q-btn 
                                    v-if="resolvedRawXml"
                                    flat dense no-caps size="xs"
                                    icon="code"
                                    label="Open in Screen Editor"
                                    color="amber-3"
                                    class="q-px-xs rounded-borders bg-amber-10 text-weight-bolder q-mr-xs"
                                    style="border: 1px solid #f59e0b;"
                                    @click="triggerOpenArtifact(displayTargetArtifactUri)"
                                >
                                    <q-tooltip>Load this generated XML buffer directly into Screen XML Editor</q-tooltip>
                                </q-btn>

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
                                        {{ currentActionType === 'build' ? 'XML Code' : 'Raw' }}
                                    </button>
                                </div>

                                <q-btn 
                                    flat round dense size="xs" 
                                    icon="content_copy" 
                                    style="color: #94a3b8;"
                                    @click="copyToClipboard(resolvedRawXml || formattedEgressJsonString || rawStageBody, 'Output Artifact')"
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

                                <!-- B. MOQUI SPEC VIEW -->
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

                                <!-- C. FORMATTED JSON VIEW -->
                                <div v-else-if="activeOutputTab === 'json' && resolvedEgressPayload" class="q-pa-sm rounded-borders font-mono text-caption" style="background-color: #0f172a; border: 1px solid #1e3a5f;">
                                    <pre class="q-ma-none" style="color: #38bdf8; white-space: pre-wrap; font-size: 11px; line-height: 1.4;">{{ formattedEgressJsonString }}</pre>
                                </div>

                                <!-- D. RAW XML / MARKDOWN VIEW -->
                                <div v-else class="q-pa-xs rounded-borders font-mono text-caption" style="background-color: #0f172a; border: 1px solid #1e3a5f; color: #f1f5f9;">
                                    <div v-if="resolvedRawXml">
                                        <div class="row items-center justify-between q-pa-xs rounded bg-slate-900 q-mb-xs text-caption">
                                            <span class="text-amber-3 text-weight-bold font-mono">GENERATED MOQUI XML SPECIFICATION:</span>
                                            <q-btn flat dense no-caps size="xs" color="cyan-3" icon="launch" label="Open in Screen Editor" @click="triggerOpenArtifact(displayTargetArtifactUri)" />
                                        </div>
                                        <pre class="q-ma-none q-pa-sm rounded bg-black text-amber-2" style="white-space: pre-wrap; font-size: 11px; line-height: 1.4; max-height: 600px; overflow: auto;">{{ resolvedRawXml }}</pre>
                                    </div>
                                    <div v-else class="markdown-body font-mono text-caption" v-html="formatOutput(rawStageBody)"></div>
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