(function () {
    const AgiStageInspector = {
        name: 'AgiStageInspector',
        emits: ['stage-dispatched', 'stage-mutated', 'advance-stance', 'locate-stage', 'open-artifact'],
        components: {
            'agi-stage-header': Vue.defineAsyncComponent(() => {
                if (window.AgiStageHeader) return Promise.resolve(window.AgiStageHeader);
                if (window.AgiComponents?.['AgiStageHeader']) return Promise.resolve(window.AgiComponents['AgiStageHeader']);
                if (window.AgiComponents?.['agi-stage-header']) return Promise.resolve(window.AgiComponents['agi-stage-header']);
                return new Promise((resolve) => {
                    const check = (attempts = 0) => {
                        const comp = window.AgiStageHeader || window.AgiComponents?.['AgiStageHeader'] || window.AgiComponents?.['agi-stage-header'];
                        if (comp) resolve(comp);
                        else if (attempts < 40) setTimeout(() => check(attempts + 1), 25);
                        else resolve({ render: () => null });
                    };
                    check();
                });
            }),
            'agi-stage-ingress-viewport': Vue.defineAsyncComponent(() => {
                if (window.AgiStageIngressViewport) return Promise.resolve(window.AgiStageIngressViewport);
                if (window.AgiComponents?.['AgiStageIngressViewport']) return Promise.resolve(window.AgiComponents['AgiStageIngressViewport']);
                if (window.AgiComponents?.['agi-stage-ingress-viewport']) return Promise.resolve(window.AgiComponents['agi-stage-ingress-viewport']);
                return new Promise((resolve) => {
                    const check = (attempts = 0) => {
                        const comp = window.AgiStageIngressViewport || window.AgiComponents?.['AgiStageIngressViewport'] || window.AgiComponents?.['agi-stage-ingress-viewport'];
                        if (comp) resolve(comp);
                        else if (attempts < 40) setTimeout(() => check(attempts + 1), 25);
                        else resolve({ render: () => null });
                    };
                    check();
                });
            }),
            'agi-discussion-viewer': Vue.defineAsyncComponent(() => {
                if (window.AgiDiscussionViewer) return Promise.resolve(window.AgiDiscussionViewer);
                if (window.AgiComponents?.['AgiDiscussionViewer']) return Promise.resolve(window.AgiComponents['AgiDiscussionViewer']);
                if (window.AgiComponents?.['agi-discussion-viewer']) return Promise.resolve(window.AgiComponents['agi-discussion-viewer']);
                return new Promise((resolve) => {
                    const check = (attempts = 0) => {
                        const comp = window.AgiDiscussionViewer || window.AgiComponents?.['AgiDiscussionViewer'] || window.AgiComponents?.['agi-discussion-viewer'];
                        if (comp) resolve(comp);
                        else if (attempts < 40) setTimeout(() => check(attempts + 1), 25);
                        else resolve({ render: () => null });
                    };
                    check();
                });
            }),
            'agi-plan-spec-viewer': Vue.defineAsyncComponent(() => {
                if (window.AgiPlanSpecViewer) return Promise.resolve(window.AgiPlanSpecViewer);
                if (window.AgiComponents?.['AgiPlanSpecViewer']) return Promise.resolve(window.AgiComponents['AgiPlanSpecViewer']);
                if (window.AgiComponents?.['agi-plan-spec-viewer']) return Promise.resolve(window.AgiComponents['agi-plan-spec-viewer']);
                return new Promise((resolve) => {
                    const check = (attempts = 0) => {
                        const comp = window.AgiPlanSpecViewer || window.AgiComponents?.['AgiPlanSpecViewer'] || window.AgiComponents?.['agi-plan-spec-viewer'];
                        if (comp) resolve(comp);
                        else if (attempts < 40) setTimeout(() => check(attempts + 1), 25);
                        else resolve({ render: () => null });
                    };
                    check();
                });
            }),
        },
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
                payloadVersion: 0,

                activePort: 'OUT',
                showIngressDiff: false,
                editIngressSpec: false,
                activeOutputTab: 'structured',

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

                // 🛡️ Unconditionally touch reactive properties so Vue always tracks updates
                const _v = this.payloadVersion;
                const cache = this.payloadCache;

                let rawObj = null;
                const stage = this.selectedStage;
                const ingressId = stage.ingressPayloadId;

                // 1. Check if step's own ingress payload exists and has rich data
                if (ingressId && cache[String(ingressId)]) {
                    const cand = cache[String(ingressId)];
                    if (cand && (cand.proposedModules || cand.replyMessage || cand.screenContract || cand.architectureSummary)) {
                        rawObj = cand;
                    }
                }
                if (!rawObj && stage.ingressJsonData) {
                    const cand = this.tryParseJson(stage.ingressJsonData);
                    if (cand && (cand.proposedModules || cand.replyMessage || cand.screenContract || cand.architectureSummary)) {
                        rawObj = cand;
                    }
                }

                // 2. Resolve parent step's egress payload ID
                const parent = this.selectedParentStage;
                const parentStepId = stage.parentStepId || parent?.pipelineStepId || stage.parentStageId;

                let parentEgressId = stage.parentEgressPayloadId
                    || parent?.egressPayloadId
                    || parent?.stagedPayloadId;

                if (!parentEgressId && parentStepId && window.__agiCurrentPipelineGraph?.nodes) {
                    const pNode = window.__agiCurrentPipelineGraph.nodes.find(n =>
                        String(n.id || n.stepId || n.pipelineStepId) === String(parentStepId)
                    );
                    parentEgressId = pNode?.egressPayloadId || pNode?.stagedPayloadId;
                }

                if (!parentEgressId && parentStepId && window.__agiPipelinePayloadMap) {
                    parentEgressId = window.__agiPipelinePayloadMap[String(parentStepId)];
                }

                // 3. Fallback: Inherit directly from parent step's EGRESS payload in cache
                if (!rawObj && parentEgressId && cache[String(parentEgressId)]) {
                    rawObj = cache[String(parentEgressId)];
                }

                if (!rawObj && parent?.egressJsonData) {
                    rawObj = this.tryParseJson(parent.egressJsonData);
                }

                // 4. Last fallback: return whatever raw ingress data exists
                if (!rawObj && ingressId && cache[String(ingressId)]) {
                    rawObj = cache[String(ingressId)];
                }

                return this.unwrapPayload(rawObj);
            },

            payloadKind() {
                const p = this.resolvedEgressPayload;
                if (!p) {
                    if (this.resolvedRawXml) return 'BUILD';
                    return 'EMPTY';
                }
                if (p.proposedModules || p.replyMessage || p.clarifyingQuestions || p.status === 'DISCUSSING') {
                    return 'DISCUSSION';
                }
                if (p.screenContract || p.suggestedEntities || p.formulationSteps || p.recommendedArchetype) {
                    return 'PLAN';
                }
                if (this.resolvedRawXml || p.rawXmlContent) {
                    return 'BUILD';
                }
                return 'GENERIC';
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

                        if (!window.__agiPipelinePayloadMap) window.__agiPipelinePayloadMap = {};
                        if (val.pipelineStepId && (val.egressPayloadId || val.stagedPayloadId)) {
                            window.__agiPipelinePayloadMap[String(val.pipelineStepId)] = String(val.egressPayloadId || val.stagedPayloadId);
                        }

                        const egressId = val.egressPayloadId || val.stagedPayloadId;
                        if (egressId && !this.payloadCache[String(egressId)]) {
                            this.fetchPayload(egressId);
                        }

                        const ingressId = val.ingressPayloadId;
                        if (ingressId && !this.payloadCache[String(ingressId)]) {
                            this.fetchPayload(ingressId);
                        }

                        // Fetch parent step's egress payload so child ingress has rich data
                        const parentStepId = val.parentStepId || this.selectedParentStage?.pipelineStepId || val.parentStageId;
                        let parentEgressId = val.parentEgressPayloadId
                            || this.selectedParentStage?.egressPayloadId
                            || this.selectedParentStage?.stagedPayloadId;

                        if (!parentEgressId && parentStepId && window.__agiCurrentPipelineGraph?.nodes) {
                            const pNode = window.__agiCurrentPipelineGraph.nodes.find(n =>
                                String(n.id || n.stepId || n.pipelineStepId) === String(parentStepId)
                            );
                            parentEgressId = pNode?.egressPayloadId || pNode?.stagedPayloadId;
                        }

                        if (!parentEgressId && parentStepId && window.__agiPipelinePayloadMap) {
                            parentEgressId = window.__agiPipelinePayloadMap[String(parentStepId)];
                        }

                        if (parentEgressId && !this.payloadCache[String(parentEgressId)]) {
                            this.fetchPayload(parentEgressId);
                        }

                        this.syncActiveTab();
                        this.hydrateIngressEditor();
                    } else {
                        this.inputDirective = '';
                        this.inputTargetArtifact = '';
                        this.activePort = 'IN';
                    }
                }
            },
            selectedParentStage: {
                immediate: true,
                deep: true,
                handler(val) {
                    if (val) {
                        const parentStepId = val.pipelineStepId || val.stageId;
                        const egressId = val.egressPayloadId || val.stagedPayloadId;
                        if (parentStepId && egressId) {
                            if (!window.__agiPipelinePayloadMap) window.__agiPipelinePayloadMap = {};
                            window.__agiPipelinePayloadMap[String(parentStepId)] = String(egressId);
                            if (!this.payloadCache[String(egressId)]) {
                                this.fetchPayload(egressId);
                            }
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

            cleanseContract(obj) {
                if (!obj || typeof obj !== 'object') return {};
                const unwrapped = this.unwrapPayload(obj);
                if (!unwrapped || typeof unwrapped !== 'object') return {};

                const clean = {};
                const allowedKeys = [
                    'status',
                    'scopeMaturity',
                    'replyMessage',
                    'clarifyingQuestions',
                    'proposedModules',
                    'architecturalConsiderations',
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

                // 🎯 Parse stringified `message` (where DISCUSS payload data lives)
                if (typeof current.message === 'string') {
                    const parsedMessage = this.tryParseJson(current.message) || this.extractJsonFromText(current.message);
                    if (parsedMessage && typeof parsedMessage === 'object') {
                        current = Object.assign({}, current, parsedMessage);
                    }
                }

                // Parse stringified `architectureSummary`
                if (current.architectureSummary) {
                    if (typeof current.architectureSummary === 'object') {
                        current = Object.assign({}, current, current.architectureSummary);
                    } else if (typeof current.architectureSummary === 'string') {
                        const parsedArch = this.tryParseJson(current.architectureSummary) || this.extractJsonFromText(current.architectureSummary);
                        if (parsedArch && typeof parsedArch === 'object') {
                            current = Object.assign({}, current, parsedArch);
                        }
                    }
                }

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
                        if (typeof parsedJsonData.message === 'string') {
                            const innerMsg = this.tryParseJson(parsedJsonData.message) || this.extractJsonFromText(parsedJsonData.message);
                            if (innerMsg && typeof innerMsg === 'object') {
                                Object.assign(parsedJsonData, innerMsg);
                            }
                        }
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
                    this.activeOutputTab = 'structured';
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
                        // 🛡️ Replace object reference and bump version counter to guarantee Vue triggers computed properties
                        this.payloadCache = Object.assign({}, this.payloadCache, { [String(payloadId)]: parsed });
                        this.payloadVersion++;
                    }
                } catch (e) {
                    console.warn(`Could not load payload #${payloadId}:`, e.message);
                } finally {
                    this.loadingPayload = false;
                    this.syncActiveTab();
                    this.hydrateIngressEditor();
                }
            },

            async fetchParentPayloadByStepId(parentStepId) {
                if (!parentStepId) return;

                // 1. First check if AgiPipelineCanvas already has this step's nodes in memory
                if (window.__agiCurrentPipelineGraph?.nodes) {
                    const node = window.__agiCurrentPipelineGraph.nodes.find(n =>
                        String(n.id || n.stepId || n.pipelineStepId) === String(parentStepId)
                    );
                    const egressId = node?.egressPayloadId || node?.stagedPayloadId;
                    if (egressId) {
                        if (!window.__agiPipelinePayloadMap) window.__agiPipelinePayloadMap = {};
                        window.__agiPipelinePayloadMap[String(parentStepId)] = String(egressId);
                        this.fetchPayload(egressId);
                        return;
                    }
                }

                // 2. Fallback: Query the graph GET endpoint (which is valid and allowed)
                if (this.discussionId) {
                    try {
                        const resp = await axios.get('/rest/s1/agi-ai/pipeline/graph', {
                            params: { discussionId: this.discussionId },
                            headers: { 'moquiSessionToken': this.resolveCsrf() }
                        });
                        const graph = resp.data?.graph || resp.data;
                        if (graph?.nodes && Array.isArray(graph.nodes)) {
                            window.__agiCurrentPipelineGraph = graph;
                            if (!window.__agiPipelinePayloadMap) window.__agiPipelinePayloadMap = {};
                            graph.nodes.forEach(n => {
                                const sId = n.id || n.stepId || n.pipelineStepId;
                                const pId = n.egressPayloadId || n.stagedPayloadId;
                                if (sId && pId) window.__agiPipelinePayloadMap[String(sId)] = String(pId);
                            });

                            const egressId = window.__agiPipelinePayloadMap[String(parentStepId)];
                            if (egressId) {
                                this.fetchPayload(egressId);
                            }
                        }
                    } catch (e) {
                        console.warn("Could not resolve parent step via pipeline/graph", e.message);
                    }
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
                    this.$q?.notify({ type: 'warning', message: 'No target artifact URI specified.' });
                    return;
                }

                const payload = this.resolvedEgressPayload;
                const astTree = payload?.astTree || payload?.layoutTree || null;

                this.$emit('open-artifact', {
                    artifactUri: targetUri,
                    rawXmlContent: this.resolvedRawXml || null,
                    astTree: astTree
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
                const currentStepId = this.selectedStage?.pipelineStepId || this.selectedStage?.stageId;
                const parentId = currentStepId || this.selectedParentStage?.pipelineStepId || null;

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
                        pipelineStepId: null,
                        parentStepId: currentStepId,
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

            handleIngressDispatch(overrideData) {
                if (overrideData && overrideData.editIngressSpec) {
                    this.editIngressSpec = true;
                    this.customArchetype = overrideData.customArchetype;
                    this.customEntitiesText = overrideData.customEntitiesText;
                    this.customRawJson = overrideData.customRawJson;
                } else {
                    this.editIngressSpec = false;
                }
                this.executeComputeStage();
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
            },
            async branchSuccessorStep({ sourceStepId, targetStance }) {
                const parentId = sourceStepId || this.stepId;
                if (!parentId) return;

                this.isAdvancing = true;
                const stance = (targetStance || 'plan').toLowerCase();
                const stanceEnumId = stance === 'build' ? 'AamBuild' : (stance === 'plan' ? 'AamPlan' : 'AamDiscuss');

                try {
                    const sourceEgressId = this.selectedStage?.egressPayloadId || this.selectedStage?.stagedPayloadId;
                    const cleanContract = this.cleanseContract(this.resolvedEgressPayload);
                    const cleanContractJson = JSON.stringify(cleanContract, null, 2);

                    let synthesizedPrompt = '';
                    if (stance === 'build') {
                        synthesizedPrompt = this.synthesizeBuildDirective(this.resolvedEgressPayload);
                    } else if (stance === 'plan') {
                        synthesizedPrompt = `Formulate canonical Moqui architecture plan based on Step #${parentId} specification.`;
                    } else {
                        synthesizedPrompt = `Refine requirements and continue discussion based on Step #${parentId} outputs.`;
                    }

                    const resp = await axios.post('/rest/s1/agi-ai/pipeline/step/fork', {
                        sourceStepId: parentId,
                        targetStanceEnumId: stanceEnumId,
                        ingressPayloadId: sourceEgressId,
                        modifiedPayloadJson: cleanContractJson,
                        directivePrompt: synthesizedPrompt
                    }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                    this.isAdvancing = false;
                    const newStepId = resp.data?.newStepId;
                    this.$q?.notify({
                        type: 'positive',
                        message: `Successor Step #${newStepId} (${stance.toUpperCase()}) created [DRAFT].`,
                        icon: 'account_tree'
                    });

                    this.activePort = 'IN';
                    this.$emit('stage-dispatched', {
                        discussionId: this.discussionId,
                        pipelineStepId: newStepId
                    });
                } catch (e) {
                    this.isAdvancing = false;
                    this.$q?.notify({
                        type: 'negative',
                        message: 'Branch failed: ' + (e.response?.data?.errors || e.message)
                    });
                }
            },
            async orchestrateModule({ sourceStepId, subplans }) {
                if (!sourceStepId || !subplans || subplans.length === 0) return;

                this.isAdvancing = true;
                try {
                    const resp = await axios.post('/rest/s1/agi-ai/pipeline/orchestrate', {
                        sourceStepId: sourceStepId,
                        subplans: subplans,
                        targetStanceEnumId: 'AamPlan'
                    }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                    this.isAdvancing = false;
                    const count = resp.data?.spawnedCount || resp.data?.spawnedStepIds?.length || 0;
                    this.$q?.notify({
                        type: 'positive',
                        message: `Successfully orchestrated ${count} sub-screen PLAN steps.`,
                        icon: 'bolt'
                    });

                    // Trigger graph refresh
                    this.$emit('stage-dispatched', {
                        discussionId: this.discussionId,
                        pipelineStepId: resp.data?.spawnedStepIds?.[0]
                    });
                } catch (e) {
                    this.isAdvancing = false;
                    this.$q?.notify({
                        type: 'negative',
                        message: 'Orchestration failed: ' + (e.response?.data?.errors || e.message)
                    });
                }
            },
            async handleUpdateTargetArtifact({ pipelineStepId, targetArtifactUri }) {
                if (!pipelineStepId || !targetArtifactUri) return;

                try {
                    await axios.post('/rest/s1/agi-ai/pipeline/step/artifact', {
                        pipelineStepId: pipelineStepId,
                        targetArtifactUri: targetArtifactUri
                    }, {
                        headers: { 'moquiSessionToken': this.resolveCsrf() }
                    });

                    // Update local step state
                    if (this.selectedStage) {
                        this.selectedStage.targetArtifactUri = targetArtifactUri;
                    }
                    this.inputTargetArtifact = targetArtifactUri;

                    this.$q?.notify({
                        type: 'positive',
                        message: `Target artifact for Step #${pipelineStepId} set to: ${targetArtifactUri.split('/').pop()}`,
                        icon: 'check'
                    });

                    // Notify parent workspace so localScreenPath aligns if desired
                    this.$emit('open-artifact', { artifactUri: targetArtifactUri });

                } catch (e) {
                    this.$q?.notify({
                        type: 'negative',
                        message: 'Failed to update artifact: ' + (e.response?.data?.errors || e.message)
                    });
                }
            },
        },
        template: `
            <div class="agi-stage-inspector fit column no-wrap font-mono text-white overflow-hidden" style="background-color: #020617; height: 100%; min-height: 0; width: 100%;">
                
                <!-- 1. DELEGATED STAGE HEADER -->
                <agi-stage-header 
                    :discussion-id="discussionId"
                    :selected-stage="selectedStage"
                    :active-port="activePort"
                    :current-action-type="currentActionType"
                    :theme-style="themeStyle"
                    :is-draft="isDraft"
                    :step-id="stepId"
                    :display-target-artifact-uri="displayTargetArtifactUri"
                    :egress-payload="resolvedEgressPayload"
                    :is-advancing="isAdvancing"
                    :is-forking="isForking"
                    :is-archiving="isArchiving"
                    @update:active-port="activePort = $event"
                    @branch-successor="branchSuccessorStep"
                    @orchestrate-module="orchestrateModule"
                    @advance-to-build="advanceToBuild"
                    @fork-step="forkCurrentStep"
                    @archive-branch="archiveBranch"
                    @set-stance="advanceToNext"
                    @locate-canvas="locateStageOnCanvas"
                    @open-artifact="triggerOpenArtifact"
                    @update-target-artifact="handleUpdateTargetArtifact"
                />

                <!-- 2. SINGLE FULL-WIDTH INSPECTOR VIEWPORT -->
                <div class="col full-width column no-wrap overflow-hidden relative-position" style="flex: 1 1 0%; min-height: 0;">
                    
                    <!-- CASE A: NO PIPELINE SELECTED -->
                    <template v-if="!discussionId">
                        <div class="fit column flex-center text-slate-500 font-mono q-pa-xl">
                            <q-icon name="account_tree" size="40px" class="q-mb-md text-cyan-4" />
                            <span class="text-body2">Select or create a pipeline initiative in the bar above.</span>
                        </div>
                    </template>

                    <!-- CASE B: NO STAGE SELECTED (INITIALIZE ROOT STEP 1) -->
                    <template v-else-if="!selectedStage">
                        <div class="col q-pa-lg overflow-auto" style="flex: 1 1 0%; min-height: 0; height: 100%;">
                            <div class="column q-gutter-y-lg" style="max-width: 960px; margin: 0 auto;">
                                <div class="row items-center q-gutter-x-md q-pa-md rounded-borders" style="background-color: #0b1329; border: 1px solid #0284c7;">
                                    <q-icon name="rocket_launch" color="cyan-3" size="26px" />
                                    <div>
                                        <div class="text-weight-bold text-cyan-2" style="font-size: 13px;">INITIALIZE ROOT PIPELINE STEP</div>
                                        <div class="text-caption text-slate-400 q-mt-xs" style="font-size: 11px;">Author the initial directive prompt to launch Step 1 of this pipeline.</div>
                                    </div>
                                </div>

                                <div class="column q-gutter-y-sm">
                                    <label class="text-caption font-mono text-weight-bold text-slate-300" style="font-size: 11px;">TARGET ARTIFACT LOCATION (OPTIONAL):</label>
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

                                <div class="column q-gutter-y-sm">
                                    <label class="text-caption font-mono text-weight-bold text-slate-300" style="font-size: 11px;">INITIAL DIRECTIVE / DISPATCH PROMPT:</label>
                                    <q-input 
                                        v-model="inputDirective" 
                                        type="textarea" 
                                        rows="8" 
                                        dense dark outlined 
                                        color="cyan-3"
                                        class="font-mono text-caption"
                                        input-class="font-mono text-slate-100"
                                        style="background-color: #020617; border-radius: 4px;"
                                        placeholder="Enter initial directive (e.g. 'Formulate the high-level architecture plan for Clinical Dashboard')..."
                                    />
                                </div>

                                <div class="row items-center justify-between q-pa-md rounded-borders q-mt-sm" style="background-color: #0f172a; border: 1px solid #1e293b;">
                                    <div class="row items-center q-gutter-x-sm">
                                        <span class="text-caption font-mono text-slate-200" style="font-size: 11px;">Mantle UDM Invariants Enforced</span>
                                        <q-toggle v-model="inputMantleInvariants" dense color="cyan-4" size="sm" />
                                    </div>

                                    <q-btn 
                                        color="primary"
                                        text-color="white"
                                        icon="bolt" 
                                        label="Dispatch Root Step 1" 
                                        dense no-caps 
                                        class="text-weight-bold q-px-lg q-py-xs font-mono"
                                        style="height: 32px;"
                                        :loading="isDispatching"
                                        @click="executeComputeStage"
                                    />
                                </div>
                            </div>
                        </div>
                    </template>

                    <!-- CASE C: [IN] INGRESS VIEWPORT (DELEGATED TO CHILD) -->
                    <template v-else-if="activePort === 'IN'">
                        <agi-stage-ingress-viewport 
                            :selected-stage="selectedStage"
                            :selected-parent-stage="selectedParentStage"
                            :ingress-payload="resolvedIngressPayload"
                            :formatted-ingress-json-string="formattedIngressJsonString"
                            :formatted-egress-json-string="formattedEgressJsonString"
                            :computed-delta-summary="computedDeltaSummary"
                            :current-action-type="currentActionType"
                            :is-draft="isDraft"
                            :is-dispatching="isDispatching"
                            :step-id="stepId"
                            v-model:model-value-directive="inputDirective"
                            v-model:model-value-target-artifact="inputTargetArtifact"
                            v-model:model-value-mantle-invariants="inputMantleInvariants"
                            @dispatch-stage="handleIngressDispatch"
                            @copy-clipboard="copyToClipboard"
                        />
                    </template>

                    <!-- CASE D: [OUT] EGRESS VIEWPORT -->
                    <template v-else>
                        <div class="row items-center justify-between q-px-md" style="background-color: #0b1329; border-bottom: 1px solid #1e293b; height: 36px; min-height: 36px; flex: 0 0 36px;">
                            <div class="row items-center q-gutter-x-sm no-wrap ellipsis">
                                <q-icon name="output" size="15px" color="amber-4" />
                                <span class="text-caption text-weight-bolder text-cyan-3" style="font-size: 11px;">
                                    EGRESS ARTIFACT: STEP #{{ stepId }}
                                </span>
                                <span 
                                    v-if="selectedStage?.egressPayloadId" 
                                    class="q-px-sm rounded font-mono text-weight-bolder" 
                                    style="background-color: #581c87; color: #f3e8ff; font-size: 10px; border: 1px solid #7e22ce;"
                                >
                                    PAYLOAD #{{ selectedStage.egressPayloadId }}
                                </span>
                                <q-spinner-dots v-if="loadingPayload" color="cyan-4" size="16px" />
                            </div>

                            <div class="row items-center q-gutter-x-sm">
                                <!-- STAGED VIRTUAL SCREEN XML QUICK LAUNCH BUTTON -->
                                <q-btn 
                                    v-if="resolvedRawXml"
                                    flat dense no-caps size="xs"
                                    icon="code"
                                    label="Open in Screen Editor"
                                    color="amber-3"
                                    class="q-px-sm rounded-borders bg-amber-10 text-weight-bolder"
                                    style="border: 1px solid #f59e0b; height: 24px;"
                                    @click="triggerOpenArtifact(displayTargetArtifactUri)"
                                >
                                    <q-tooltip>Load this generated XML buffer directly into Screen XML Editor</q-tooltip>
                                </q-btn>

                                <div class="row items-center q-gutter-x-none rounded-borders" style="background-color: #020617; border: 1px solid #334155; padding: 2px;">
                                    <button 
                                        type="button"
                                        class="cursor-pointer font-mono text-caption text-weight-bold"
                                        :style="{
                                            backgroundColor: activeOutputTab === 'structured' ? '#0284c7' : '#0f172a',
                                            color: activeOutputTab === 'structured' ? '#ffffff' : '#cbd5e1',
                                            border: activeOutputTab === 'structured' ? '1px solid #38bdf8' : '1px solid transparent',
                                            borderRadius: '3px',
                                            padding: '2px 10px',
                                            fontSize: '10px',
                                            height: '22px'
                                        }"
                                        @click="activeOutputTab = 'structured'"
                                    >
                                        {{ payloadKind === 'DISCUSSION' ? 'Overview & Pillars' : (payloadKind === 'PLAN' ? 'Moqui Spec' : 'Artifact Preview') }}
                                    </button>

                                    <button 
                                        type="button"
                                        class="cursor-pointer font-mono text-caption text-weight-bold"
                                        :style="{
                                            backgroundColor: activeOutputTab === 'json' ? '#0284c7' : '#0f172a',
                                            color: activeOutputTab === 'json' ? '#ffffff' : '#cbd5e1',
                                            border: activeOutputTab === 'json' ? '1px solid #38bdf8' : '1px solid transparent',
                                            borderRadius: '3px',
                                            padding: '2px 10px',
                                            fontSize: '10px',
                                            height: '22px',
                                            opacity: resolvedEgressPayload ? '1' : '0.4',
                                            cursor: resolvedEgressPayload ? 'pointer' : 'not-allowed'
                                        }"
                                        :disabled="!resolvedEgressPayload"
                                        @click="activeOutputTab = 'json'"
                                    >
                                        Contract JSON
                                    </button>

                                    <button 
                                        type="button"
                                        class="cursor-pointer font-mono text-caption text-weight-bold"
                                        :style="{
                                            backgroundColor: activeOutputTab === 'raw' ? '#0284c7' : '#0f172a',
                                            color: activeOutputTab === 'raw' ? '#ffffff' : '#cbd5e1',
                                            border: activeOutputTab === 'raw' ? '1px solid #38bdf8' : '1px solid transparent',
                                            borderRadius: '3px',
                                            padding: '2px 10px',
                                            fontSize: '10px',
                                            height: '22px'
                                        }"
                                        @click="activeOutputTab = 'raw'"
                                    >
                                        Raw / Diagnostics
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

                        <div class="col q-pa-lg overflow-auto" style="flex: 1 1 0%; min-height: 0; height: 100%; overflow-y: auto !important;">
                            <div style="max-width: 1200px; margin: 0 auto;">
                                
                                <div v-if="isDraft && !resolvedEgressPayload" class="column flex-center q-my-xl text-slate-500 font-mono">
                                    <q-icon name="pending" size="42px" color="amber-4" class="q-mb-md" />
                                    <div class="text-weight-bold text-slate-300 text-body2">Step #{{ stepId }} is in DRAFT state.</div>
                                    <div class="text-caption text-slate-400 q-mb-lg">No output artifact has been generated yet.</div>
                                    <q-btn color="cyan-8" text-color="white" icon="login" label="Switch to [IN] to review and dispatch" no-caps dense class="q-px-md q-py-xs" @click="activePort = 'IN'" />
                                </div>

                                <!-- 1. POLYMORPHIC STRUCTURED VIEW -->
                                <div v-else-if="activeOutputTab === 'structured' && resolvedEgressPayload" class="column q-gutter-y-md">
                                    
                                    <!-- A. DISCUSS / 5-PILLARS VIEW (DELEGATED TO CHILD) -->
                                    <template v-if="payloadKind === 'DISCUSSION'">
                                        <agi-discussion-viewer :payload="resolvedEgressPayload" />
                                    </template>

                                    <!-- B. PLAN / SPEC VIEW (DELEGATED TO CHILD) -->
                                    <template v-else-if="payloadKind === 'PLAN'">
                                        <agi-plan-spec-viewer :payload="resolvedEgressPayload" />
                                    </template>

                                    <!-- C. BUILD / XML SPEC VIEW -->
                                    <template v-else-if="payloadKind === 'BUILD'">
                                        <div class="column q-gutter-y-sm">
                                            <div class="row items-center justify-between q-pa-sm rounded bg-slate-900 text-caption">
                                                <span class="text-amber-3 text-weight-bold font-mono" style="font-size: 11px;">GENERATED MOQUI XML SPECIFICATION:</span>
                                                <q-btn flat dense no-caps size="xs" color="cyan-3" icon="launch" label="Open in Screen Editor" class="q-px-sm" style="height: 24px;" @click="triggerOpenArtifact(displayTargetArtifactUri)" />
                                            </div>
                                            <pre class="q-ma-none q-pa-md rounded bg-black text-amber-2" style="white-space: pre-wrap; font-size: 11px; line-height: 1.5; min-height: 300px; max-height: 800px; overflow: auto;">{{ resolvedRawXml }}</pre>
                                        </div>
                                    </template>

                                    <!-- D. GENERIC / FALLBACK VIEW -->
                                    <template v-else>
                                        <div class="markdown-body font-mono text-caption q-pa-xs" style="line-height: 1.6;" v-html="formatOutput(rawStageBody)"></div>
                                    </template>
                                </div>

                                <!-- 2. CONTRACT JSON TAB -->
                                <div v-else-if="activeOutputTab === 'json' && resolvedEgressPayload" class="q-pa-md rounded-borders font-mono text-caption" style="background-color: #0f172a; border: 1px solid #1e3a5f;">
                                    <pre class="q-ma-none text-cyan-3" style="white-space: pre-wrap; font-size: 11px; line-height: 1.5;">{{ formattedEgressJsonString }}</pre>
                                </div>

                                <!-- 3. RAW / DIAGNOSTICS TAB -->
                                <div v-else class="q-pa-md rounded-borders font-mono text-caption" style="background-color: #0f172a; border: 1px solid #1e3a5f; color: #f1f5f9;">
                                    <div class="text-caption text-slate-400 font-bold q-mb-sm">RAW UNWRAPPED EGRESS BUFFER:</div>
                                    <pre class="q-ma-none q-pa-sm rounded bg-black text-slate-200" style="white-space: pre-wrap; font-size: 11px; line-height: 1.4; max-height: 600px; overflow: auto;">{{ rawStageBody || 'No raw stage body content available.' }}</pre>
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
    window.AgiComponents['AgiStageInspector'] = AgiStageInspector;

    const registerComp = () => {
        const app = window.moqui?.webrootVueApp;
        if (app) {
            if (!app.component('AgiStageInspector')) app.component('AgiStageInspector', AgiStageInspector);
            if (!app.component('agi-stage-inspector')) app.component('agi-stage-inspector', AgiStageInspector);
        } else {
            setTimeout(registerComp, 25);
        }
    };
    registerComp();
})();