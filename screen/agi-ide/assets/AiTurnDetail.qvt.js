(function () {
    const AiTurnDetail = {
        name: 'AiTurnDetail',
        emits: ['turn-dispatched', 'turn-created', 'discussion-promoted', 'mode-updated'],
        props: {
            discussionIdProp: { type: String, default: '' },
            node: { type: Object, default: () => null },
            modeProp: { type: String, default: 'discuss' }
        },
        data() {
            return {
                discussionId: this.discussionIdProp || this.node?.discussionId || '',
                activeNode: this.node || null,
                discussion: null,
                allMessages: [],
                containerFacets: {},
                newInput: '',
                isSending: false,
                filterToSelectedNode: true,
                _markdownConverter: null
            };
        },
        computed: {
            selectedMessageId() {
                if (!this.activeNode) return '';
                if (this.activeNode.messageId) return String(this.activeNode.messageId);
                if (this.activeNode.id && !this.activeNode.id.startsWith('disc_') && this.activeNode.id !== this.discussionId) {
                    return String(this.activeNode.id).replace('msg_', '');
                }
                return '';
            },

            displayedMessages() {
                if (!this.allMessages || this.allMessages.length === 0) return [];
                if (this.selectedMessageId) {
                    const selId = String(this.selectedMessageId);
                    return this.allMessages.filter(m => {
                        const mId = String(m.messageId);
                        const pId = m.parentMessageId ? String(m.parentMessageId) : null;
                        return mId === selId || (pId === selId && (m.senderRoleEnumId === 'AsrAssistant' || m.role === 'assistant'));
                    });
                }
                return this.allMessages.filter(m => !m.parentMessageId);
            },

            activeTitle() {
                if (this.selectedMessageId && this.activeNode?.label) {
                    return this.activeNode.label;
                }
                return this.discussion?.name || 'Select or Start a Topic';
            },

            hasPlanPayload() {
                if (this.activeNode?.stagedPayloadId) return true;
                if (this.activeNode?.mode === 'plan') return true;
                const label = (this.activeNode?.label || '').toLowerCase();
                if (label.includes('plan:') || label.includes('formulate the formal implementation plan')) return true;

                const planMsg = (this.displayedMessages || []).find(m => {
                    if (m.stagedPayloadId) return true;
                    const content = String(m.content || '');
                    return content.includes('PLAN_FORMULATION') || content.includes('operationalPillars') || content.includes('subplans');
                });
                return !!planMsg;
            },

            // Smart JSON Payload Inspection
            detectedJsonPayload() {
                const trimmed = (this.newInput || '').trim();
                if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
                try {
                    const parsed = JSON.parse(trimmed);
                    if (typeof parsed === 'object' && parsed !== null) {
                        return parsed;
                    }
                } catch (e) { }
                return null;
            },

            // 4-Mode Epistemic Stance Configuration (Search | Discuss | Plan | Build)
            modeConfig() {
                // If a valid JSON payload was entered with an explicit mode, reflect it
                if (this.detectedJsonPayload && this.detectedJsonPayload.mode) {
                    const explicitMode = String(this.detectedJsonPayload.mode).toLowerCase();
                    return {
                        mode: explicitMode,
                        color: 'purple-9',
                        textColor: 'white',
                        icon: 'data_object',
                        badgeColor: 'deep-purple-10',
                        label: 'Dispatch Payload',
                        tooltip: `Dispatch structured payload envelope with explicit mode: ${explicitMode}`
                    };
                }

                let mode = (this.modeProp || 'discuss').toLowerCase();

                if (mode === 'search') {
                    return {
                        mode: 'search',
                        color: 'sky-8',
                        textColor: 'white',
                        icon: 'search',
                        badgeColor: 'sky-9',
                        label: 'Search Material',
                        tooltip: 'Search discussion transcripts, architecture plans, and payloads'
                    };
                } else if (mode === 'plan') {
                    return {
                        mode: 'plan',
                        color: 'deep-purple-7',
                        textColor: 'white',
                        icon: 'architecture',
                        badgeColor: 'deep-purple-8',
                        label: this.selectedMessageId ? 'Formulate Plan' : 'Plan Architecture',
                        tooltip: 'Formulate or iterate on this architecture plan'
                    };
                } else if (mode === 'build') {
                    return {
                        mode: 'build',
                        color: 'amber-9',
                        textColor: 'black',
                        icon: 'handyman',
                        badgeColor: 'amber-8',
                        label: this.selectedMessageId ? 'Generate & Build' : 'Build Artifact',
                        tooltip: 'Trigger code generation or mutation against active workspace files'
                    };
                }
                return {
                    mode: 'discuss',
                    color: 'primary',
                    textColor: 'white',
                    icon: 'chat',
                    badgeColor: 'cyan-6',
                    label: this.selectedMessageId ? 'Reply / Discuss' : 'Discuss / Explore',
                    tooltip: 'Add an exploratory turn to this discussion thread'
                };
            },

            suggestedOptions() {
                if (!this.displayedMessages || !this.displayedMessages.length) return [];

                const lastAssistantMsg = this.displayedMessages
                    .slice()
                    .reverse()
                    .find(m => m && (m.senderRoleEnumId === 'AsrAssistant' || m.role === 'assistant'));

                if (!lastAssistantMsg || !lastAssistantMsg.content) return [];

                const text = this.extractContent(lastAssistantMsg.content);
                if (!text) return [];

                let tail = text;
                const splitMarkers = ["Next Action", "Next Steps", "Would you like", "Shall we", "Recommended Next"];
                for (let i = 0; i < splitMarkers.length; i++) {
                    const idx = text.lastIndexOf(splitMarkers[i]);
                    if (idx !== -1) {
                        tail = text.substring(idx);
                        break;
                    }
                }

                const options = [];
                const regex = /(?:^|\n)\s*(\d+)[\.\)]\s*\*{0,2}([^:\n\*\?]+(?:\:[^\n\*\?]+)?)\*{0,2}/g;
                let match = null;
                while ((match = regex.exec(tail)) !== null) {
                    const num = match[1].trim();
                    let title = match[2].trim().replace(/\*\*/g, '').replace(/`/g, '');
                    if (title.length > 50) title = title.substring(0, 47) + '...';
                    options.push({
                        label: num + '. ' + title,
                        value: 'Proceed with Option ' + num + ': ' + match[2].trim()
                    });
                }

                if (options.length > 0) return options;

                const orMatch = tail.match(/(?:start|begin|proceed|generate)\s+(?:with\s+)?(?:the\s+)?(.+?)\s+or\s+(.+?)\??$/im);
                if (orMatch) {
                    const opt1 = orMatch[1].trim().replace(/\*\*/g, '').replace(/`/g, '');
                    const opt2 = orMatch[2].trim().replace(/\*\*/g, '').replace(/`/g, '');
                    return [
                        { label: opt1.length > 40 ? opt1.substring(0, 37) + '...' : opt1, value: 'Proceed with: ' + opt1 },
                        { label: opt2.length > 40 ? opt2.substring(0, 37) + '...' : opt2, value: 'Proceed with: ' + opt2 }
                    ];
                }

                return [];
            }
        },
        watch: {
            discussionIdProp(val) {
                this.discussionId = val;
                if (val) this.loadTranscript();
            },
            node: {
                deep: true,
                handler(val) {
                    this.activeNode = val;
                    if (val?.discussionId && val.discussionId !== this.discussionId) {
                        this.discussionId = val.discussionId;
                        this.loadTranscript();
                    }
                    this.$nextTick(() => {
                        if (this.hasPlanPayload && this.modeProp !== 'plan' && this.modeProp !== 'build') {
                            this.$emit('mode-updated', 'plan');
                        }
                    });
                }
            },
            modeProp(newMode) {
                const mode = (newMode || '').toLowerCase();
                const targetTopic = this.activeTitle || this.discussion?.name || 'this topic';

                if (mode === 'plan' && !this.newInput.trim()) {
                    this.newInput = `Formulate the formal implementation plan and artifact breakdown for: ${targetTopic}`;
                } else if (mode === 'build' && !this.newInput.trim()) {
                    const targetPayloadId = this.activeNode?.stagedPayloadId
                        || (this.displayedMessages.find(m => m.stagedPayloadId)?.stagedPayloadId)
                        || 'active';
                    this.newInput = `Execute build phase for Plan Payload #${targetPayloadId}: Generate root artifacts and screens.`;
                }
            }
        },
        mounted() {
            if (!window.showdown) {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/showdown/2.1.0/showdown.min.js';
                s.onload = () => { this.$forceUpdate(); };
                document.head.appendChild(s);
            }
            if (this.discussionId && (!this.allMessages || this.allMessages.length === 0)) {
                this.loadTranscript();
            }

            window.__stageArtifactBuild = (artifactPath, action) => {
                this.$emit('mode-updated', 'build');
                this.newInput = `${action === 'CREATE' ? 'Create' : 'Modify'} artifact ${artifactPath} according to the specifications in this plan.`;
                this.$q.notify({
                    type: 'info',
                    message: `Staged build directive for: ${artifactPath.split('/').pop()}`,
                    icon: 'handyman',
                    color: 'amber-9',
                    textColor: 'black',
                    timeout: 3000
                });
            };

            window.__stagePhaseSubplan = (phaseNum, phaseName) => {
                this.$emit('mode-updated', 'plan');
                this.newInput = `Formulate detailed Subplan for Phase ${phaseNum} (${phaseName}) from parent Plan #${this.activeNode?.stagedPayloadId || 'active'}. Break down services, entities, and UI screens.`;
                this.$q.notify({
                    type: 'info',
                    message: `Staged subplan directive for Phase ${phaseNum}`,
                    icon: 'architecture',
                    color: 'deep-purple-7',
                    textColor: 'white',
                    timeout: 3000
                });
            };

            window.__spawnSubplansByKey = async (cacheKey, btnElement) => {
                const subplansList = (window.__agiPlanCache && window.__agiPlanCache[cacheKey]) || [];
                if (!subplansList || subplansList.length === 0) {
                    this.$q.notify({ type: 'warning', message: 'Subplan payload not found in memory cache.' });
                    return;
                }

                if (btnElement) {
                    btnElement.disabled = true;
                    btnElement.classList.add('opacity-50');
                }

                const targetParentId = this.selectedMessageId
                    || this.activeNode?.messageId
                    || (this.displayedMessages.length > 0 ? this.displayedMessages[0].messageId : null);

                try {
                    const resp = await axios.post('/rest/s1/agi-ai/discussions/spawn-subplans', {
                        discussionId: this.discussionId,
                        parentMessageId: targetParentId,
                        subplans: subplansList
                    }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                    const createdNodes = resp.data?.createdSubplanNodes || [];
                    const createdIds = createdNodes.map(n => n.messageId);

                    if (btnElement) {
                        btnElement.innerText = '✓ Subplans Instantiated';
                        btnElement.style.backgroundColor = '#15803d';
                    }

                    this.$emit('discussion-promoted');
                    this.$emit('turn-created', {
                        discussionId: this.discussionId,
                        parentMessageId: targetParentId,
                        createdNodes: createdNodes
                    });
                    this.loadTranscript();

                    this.$q.notify({
                        type: 'positive',
                        message: `Instantiated ${createdNodes.length} Subplans into tree.`,
                        icon: 'account_tree',
                        timeout: 10000,
                        actions: [
                            {
                                label: 'UNDO',
                                color: 'amber-4',
                                handler: async () => {
                                    try {
                                        await axios.post('/rest/s1/agi-ai/discussions/rollback-batch', {
                                            messageIds: createdIds
                                        }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                                        this.$q.notify({
                                            type: 'info',
                                            message: 'Rolled back instantiated subplans.',
                                            icon: 'undo'
                                        });

                                        if (btnElement) {
                                            btnElement.disabled = false;
                                            btnElement.classList.remove('opacity-50');
                                            btnElement.innerText = `🌿 Instantiate All ${subplansList.length} Subplans into Tree`;
                                            btnElement.style.backgroundColor = '';
                                        }

                                        this.$emit('discussion-promoted');
                                        this.loadTranscript();
                                    } catch (err) {
                                        this.$q.notify({ type: 'negative', message: 'Rollback failed: ' + err.message });
                                    }
                                }
                            }
                        ]
                    });

                } catch (err) {
                    if (btnElement) {
                        btnElement.disabled = false;
                        btnElement.classList.remove('opacity-50');
                    }
                    const errMsg = err.response?.data?.errors || err.message;
                    this.$q.notify({ type: 'negative', message: errMsg, timeout: 5000 });
                }
            };
        },
        methods: {
            resolveCsrf() {
                return window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || "";
            },

            async loadTranscript() {
                if (!this.discussionId) return;
                try {
                    const resp = await axios.get('/rest/s1/agi-ai/discussions/transcript', {
                        params: { discussionId: this.discussionId },
                        headers: { 'moquiSessionToken': this.resolveCsrf() }
                    });
                    this.discussion = resp.data?.discussion || null;
                    this.allMessages = resp.data?.messages || [];
                    this.containerFacets = resp.data?.containerFacets || {};
                } catch (e) {
                    console.error("Failed to load transcript:", e);
                }
            },

            extractContent(raw) {
                if (!raw) return '';
                let text = String(raw).trim();

                for (let i = 0; i < 3; i++) {
                    if (text.startsWith('{') && text.endsWith('}')) {
                        try {
                            const parsed = JSON.parse(text);
                            if (parsed.architectureSummary) {
                                text = String(parsed.architectureSummary).trim();
                                continue;
                            }
                            if (parsed.message) {
                                text = String(parsed.message).trim();
                                continue;
                            }
                            if (parsed.rawXmlContent) {
                                text = String(parsed.rawXmlContent).trim();
                                continue;
                            }
                        } catch (e) { break; }
                    }
                    break;
                }
                return text;
            },

            formatBody(raw) {
                let text = this.extractContent(raw);
                if (!text) return '';

                if (text.startsWith('{') && text.endsWith('}')) {
                    try {
                        const parsed = JSON.parse(text);
                        if (parsed.subplans && parsed.subplans.length) {
                            return this.renderDecomposedPlanHtml(parsed);
                        }
                        if (parsed.operationalPillars || parsed.artifactBreakdown || parsed.implementationPhases) {
                            return this.renderPlanCardHtml(parsed);
                        }
                    } catch (e) { }
                }

                if (window.showdown && typeof window.showdown.Converter === 'function') {
                    if (!this._markdownConverter) {
                        this._markdownConverter = new window.showdown.Converter({
                            tables: true,
                            ghCompatibleHeaderId: true,
                            simpleLineBreaks: false,
                            strikethrough: true,
                            tasklists: true,
                            emoji: true
                        });
                        this._markdownConverter.setFlavor('github');
                    }
                    return this._markdownConverter.makeHtml(text);
                }
                return this.renderBasicMarkdownWithTables(text);
            },

            renderPlanCardHtml(plan) {
                let html = '<div class="column q-gutter-y-sm">';

                const titleText = plan.planTitle || plan.title || 'Architecture Execution Plan';
                html += `<div class="text-subtitle2 text-weight-bold text-cyan-2">${titleText}</div>`;

                const summaryText = plan.summary || plan.objective || (Array.isArray(plan.objectives) ? plan.objectives.join(' ') : '');
                if (summaryText) {
                    html += `<div class="text-caption text-slate-300 q-mb-xs" style="font-size: 11px; line-height: 1.4;">${summaryText}</div>`;
                }

                if (plan.operationalPillars && plan.operationalPillars.length) {
                    html += `<div class="text-caption text-weight-bold text-amber-3 q-mt-xs font-mono" style="font-size: 10px;">OPERATIONAL PILLARS:</div>`;
                    html += `<div class="row q-gutter-xs q-mb-xs">`;
                    plan.operationalPillars.forEach((p, idx) => {
                        const pillarIndex = p.menuIndex || (idx + 1);
                        const pillarTitle = p.title || p.menuTitle || p.name || 'Pillar';
                        const pillarLoc = p.screenPath || p.menuLocation || '';
                        const caps = p.capabilities || p.coreCapabilities || [];

                        html += `<div class="col-12 q-pa-xs rounded-borders bg-slate-900" style="border: 1px solid #334155;">
                            <div class="row items-center justify-between">
                                <span class="text-weight-bold text-cyan-3" style="font-size: 12px;">${pillarIndex}. ${pillarTitle} <span class="text-slate-400 font-mono" style="font-size: 10px;">(${p.pillarId || ''})</span></span>
                                <span class="text-caption text-slate-400 font-mono" style="font-size: 10px;">${pillarLoc}</span>
                            </div>
                            ${caps.length ? `<div class="text-caption text-slate-300 q-mt-xs" style="font-size: 11px;">${caps.join(' • ')}</div>` : ''}
                        </div>`;
                    });
                    html += `</div>`;
                }

                let flatArtifacts = [];
                if (Array.isArray(plan.artifactBreakdown)) {
                    plan.artifactBreakdown.forEach(item => {
                        if (item.artifacts && Array.isArray(item.artifacts)) {
                            item.artifacts.forEach(art => {
                                flatArtifacts.push(Object.assign({ category: item.category }, art));
                            });
                        } else if (item.path) {
                            flatArtifacts.push(item);
                        }
                    });
                } else if (plan.artifactBreakdown && plan.artifactBreakdown.screens) {
                    flatArtifacts = plan.artifactBreakdown.screens;
                }

                if (flatArtifacts.length) {
                    html += `<div class="text-caption text-weight-bold text-purple-3 q-mt-xs font-mono" style="font-size: 10px;">TARGET ARTIFACTS:</div>`;
                    html += `<div class="q-my-xs overflow-x-auto"><table class="q-table q-table--dense text-caption full-width" style="border: 1px solid #334155; border-collapse: collapse;">
                        <thead class="bg-slate-900 text-cyan-3"><tr>
                            <th class="q-pa-xs text-left" style="font-size: 10px;">Action</th>
                            <th class="q-pa-xs text-left" style="font-size: 10px;">Artifact Path</th>
                            <th class="q-pa-xs text-left" style="font-size: 10px;">Purpose / Description</th>
                            <th class="q-pa-xs text-right" style="font-size: 10px;">Build</th>
                        </tr></thead><tbody>`;
                    flatArtifacts.forEach(s => {
                        const act = (s.action || 'CREATE').toUpperCase();
                        const badgeColor = act === 'CREATE' ? 'text-positive' : (act === 'DELETE' ? 'text-negative' : 'text-amber-4');
                        const path = s.path || s.artifactPath || '';
                        const desc = s.purpose || s.description || s.category || '';
                        const safePath = path.replace(/'/g, "\\'");
                        const safeAction = act.replace(/'/g, "\\'");

                        html += `<tr style="border-bottom: 1px solid #1e293b;">
                            <td class="q-pa-xs ${badgeColor} text-weight-bold font-mono" style="font-size: 10px;">${act}</td>
                            <td class="q-pa-xs font-mono text-cyan-2" style="font-size: 10px;">${path}</td>
                            <td class="q-pa-xs text-slate-300" style="font-size: 11px;">${desc}</td>
                            <td class="q-pa-xs text-right">
                                ${act !== 'DELETE' ? `
                                    <button 
                                        class="q-btn q-btn--dense text-caption bg-amber-9 text-black text-weight-bold rounded-borders q-px-xs" 
                                        style="border: none; cursor: pointer; font-size: 9px;"
                                        onclick="window.__stageArtifactBuild('${safePath}', '${safeAction}')"
                                    >
                                        🔨 Build
                                    </button>
                                ` : ''}
                            </td>
                        </tr>`;
                    });
                    html += `</tbody></table></div>`;
                }

                if (plan.implementationPhases && plan.implementationPhases.length) {
                    html += `<div class="text-caption text-weight-bold text-cyan-3 q-mt-xs font-mono" style="font-size: 10px;">PHASED ROADMAP:</div>`;
                    plan.implementationPhases.forEach(ph => {
                        const phaseName = ph.name || ph.title || '';
                        const safeName = phaseName.replace(/'/g, "\\'");
                        const phaseNum = ph.phase || '';

                        html += `<div class="q-pa-xs q-mb-xs rounded-borders bg-slate-900" style="border: 1px solid #334155;">
                            <div class="row items-center justify-between">
                                <span class="text-weight-bold text-slate-200" style="font-size: 11px;">Phase ${phaseNum}: ${phaseName}</span>
                                <button 
                                    class="q-btn q-btn--dense text-caption bg-deep-purple-7 text-white text-weight-bold rounded-borders q-px-xs" 
                                    style="border: none; cursor: pointer; font-size: 9px;"
                                    onclick="window.__stagePhaseSubplan(${phaseNum}, '${safeName}')"
                                >
                                    📋 Create Subplan
                                </button>
                            </div>
                            ${ph.description ? `<div class="text-caption text-slate-300 q-my-xs" style="font-size: 11px;">${ph.description}</div>` : ''}
                            ${ph.deliverables && ph.deliverables.length ? `
                                <ul class="q-my-none q-pl-md text-slate-400" style="font-size: 10px;">
                                    ${ph.deliverables.map(d => `<li>${d}</li>`).join('')}
                                </ul>
                            ` : ''}
                        </div>`;
                    });
                }

                html += '</div>';
                return html;
            },

            renderDecomposedPlanHtml(plan) {
                const subplans = plan.subplans || [];

                window.__agiPlanCache = window.__agiPlanCache || {};
                const planKey = 'plan_' + (plan.planId || Date.now()) + '_' + Math.random().toString(36).substring(2, 7);
                window.__agiPlanCache[planKey] = subplans;

                let html = '<div class="column q-gutter-y-sm">';

                html += `
                    <div class="q-pa-sm rounded-borders bg-slate-900 row items-center justify-between" style="border: 1px solid #7c3aed;">
                        <div>
                            <div class="text-subtitle2 text-weight-bold text-cyan-2">${plan.title || 'Plan Decomposition'}</div>
                            <div class="text-caption text-slate-400" style="font-size: 11px;">${plan.summary || ''}</div>
                        </div>
                        <button 
                            class="q-btn q-btn--dense text-caption bg-deep-purple-7 text-white text-weight-bold rounded-borders q-px-sm q-py-xs" 
                            style="border: none; cursor: pointer; font-size: 11px;"
                            onclick="window.__spawnSubplansByKey('${planKey}')"
                        >
                            🌿 Instantiate All ${subplans.length} Subplans into Tree
                        </button>
                    </div>
                `;

                subplans.forEach((sp, idx) => {
                    const itemKey = planKey + '_' + idx;
                    window.__agiPlanCache[itemKey] = [sp];

                    const phaseNum = sp.phase || sp.phaseNumber || (idx + 1);
                    const phaseTitle = sp.title || sp.name || sp.phaseName || sp.summary || `Phase ${phaseNum} Implementation`;
                    const displayHeader = sp.phase ? `Phase ${sp.phase}: ${phaseTitle}` : phaseTitle;

                    html += `
                        <div class="q-pa-xs rounded-borders bg-slate-900" style="border: 1px solid #334155; border-left: 3px solid #8b5cf6;">
                            <div class="row items-center justify-between q-mb-xs">
                                <div class="row items-center q-gutter-x-xs">
                                    <span class="text-caption text-weight-bolder text-purple-3 font-mono" style="font-size: 11px;">#${phaseNum}</span>
                                    <span class="text-weight-bold text-slate-100 font-mono" style="font-size: 12px;">${displayHeader}</span>
                                </div>
                                <button 
                                    class="q-btn q-btn--dense text-caption bg-purple-9 text-white text-weight-bold rounded-borders q-px-xs" 
                                    style="border: none; cursor: pointer; font-size: 10px;"
                                    onclick="window.__spawnSubplansByKey('${itemKey}', this)"
                                >
                                    ➕ Instantiate
                                </button>
                            </div>
                            <div class="text-caption text-slate-300 q-mb-xs" style="font-size: 11px;">${sp.description || ''}</div>

                            ${sp.entities && sp.entities.length ? `
                                <div class="row items-center q-gutter-xs q-mb-xs">
                                    <span class="text-slate-500 font-mono" style="font-size: 9px;">ENTITIES:</span>
                                    ${sp.entities.map(e => `<span class="q-badge bg-slate-950 text-cyan-3 font-mono q-px-xs" style="border: 1px solid #0369a1; font-size: 9px;">${e}</span>`).join('')}
                                </div>
                            ` : ''}

                            ${sp.services && sp.services.length ? `
                                <div class="row items-center q-gutter-xs q-mb-xs">
                                    <span class="text-slate-500 font-mono" style="font-size: 9px;">SERVICES:</span>
                                    ${sp.services.map(s => `<span class="q-badge bg-slate-950 text-amber-3 font-mono q-px-xs" style="border: 1px solid #b45309; font-size: 9px;">${s}</span>`).join('')}
                                </div>
                            ` : ''}

                            ${sp.xmlScreens && sp.xmlScreens.length ? `
                                <div class="row items-center q-gutter-xs">
                                    <span class="text-slate-500 font-mono" style="font-size: 9px;">SCREENS:</span>
                                    ${sp.xmlScreens.map(sc => `<span class="q-badge bg-slate-950 text-emerald-3 font-mono q-px-xs" style="border: 1px solid #047857; font-size: 9px;">${sc}</span>`).join('')}
                                </div>
                            ` : ''}
                        </div>
                    `;
                });

                html += '</div>';
                return html;
            },

            renderBasicMarkdownWithTables(text) {
                text = text.replace(/```([\s\S]*?)```/g, (m, p1) =>
                    `<pre class="bg-slate-900 q-pa-sm rounded-borders overflow-x-auto text-cyan-2" style="border: 1px solid #1e293b; font-size: 11px;"><code>${p1.trim()}</code></pre>`
                );
                text = text.replace(/`([^`]+)`/g, '<code class="bg-slate-900 text-amber-3 q-px-xs rounded-borders" style="font-size: 11px;">$1</code>');
                text = text.replace(/^#### (.*$)/gim, '<h5 class="text-caption text-cyan-4 text-weight-bold q-my-xs">$1</h5>');
                text = text.replace(/^### (.*$)/gim, '<h4 class="text-body2 text-cyan-3 text-weight-bold q-my-xs">$1</h4>');
                text = text.replace(/^## (.*$)/gim, '<h3 class="text-subtitle2 text-cyan-2 text-weight-bold q-my-sm" style="border-bottom: 1px solid #334155; padding-bottom: 2px;">$1</h3>');
                text = text.replace(/^# (.*$)/gim, '<h2 class="text-subtitle1 text-cyan-1 text-weight-bolder q-my-sm" style="border-bottom: 1px solid #0284c7; padding-bottom: 4px;">$1</h2>');
                text = text.replace(/^(\d+\.\s+[^\n]+)/gim, '<h4 class="text-body2 text-weight-bold text-cyan-3 q-my-xs">$1</h4>');
                text = text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white text-weight-bold">$1</strong>');
                text = text.replace(/\*(.*?)\*/g, '<em class="text-slate-300">$1</em>');

                text = text.replace(/((\|[^\n]+\|\r?\n)+)/g, (tableBlock) => {
                    const lines = tableBlock.trim().split(/\r?\n/).filter(l => l.trim().startsWith('|'));
                    if (lines.length < 2) return tableBlock;

                    let html = '<div class="q-my-sm overflow-x-auto"><table class="q-table q-table--dense text-caption full-width" style="border: 1px solid #334155; border-collapse: collapse;">';
                    lines.forEach((line, idx) => {
                        if (line.includes(':---') || line.includes('---')) return;
                        const cells = line.split('|').slice(1, -1).map(c => c.trim());
                        if (idx === 0) {
                            html += '<thead class="bg-slate-900 text-cyan-3 text-weight-bold"><tr>';
                            cells.forEach(c => { html += `<th class="q-pa-xs text-left" style="border: 1px solid #334155; font-size: 11px;">${c}</th>`; });
                            html += '</tr></thead><tbody>';
                        } else {
                            html += '<tr style="border-bottom: 1px solid #1e293b;">';
                            cells.forEach(c => { html += `<td class="q-pa-xs text-slate-200" style="border: 1px solid #334155; font-size: 11px;">${c}</td>`; });
                            html += '</tr>';
                        }
                    });
                    html += '</tbody></table></div>';
                    return html;
                });

                text = text.replace(/^\s*\*\s+(.*$)/gim, '<li class="q-ml-sm text-slate-200" style="font-size: 11px;">$1</li>');
                text = text.replace(/^\s*-\s+(.*$)/gim, '<li class="q-ml-sm text-slate-200" style="font-size: 11px;">$1</li>');
                text = text.replace(/^---$/gim, '<hr class="q-my-xs" style="border: 0; border-top: 1px solid #334155;" />');
                text = text.replace(/\n\n/g, '<div class="q-my-xs"></div>');
                text = text.replace(/\n/g, '<br/>');
                return text;
            },

            selectOption(opt) {
                this.newInput = opt.value || opt.label;
            },

            validateAndDisambiguate(rawText) {
                const normalized = rawText.trim().toLowerCase();
                const ambiguousWords = ['yes', 'yeah', 'sure', 'ok', 'okay', 'yep', 'proceed', 'continue', '1', '2', '3', '4'];

                if (ambiguousWords.includes(normalized)) {
                    const numMatch = normalized.match(/^(\d+)$/);
                    if (numMatch && this.suggestedOptions.length > 0) {
                        const idx = parseInt(numMatch[1], 10) - 1;
                        if (idx >= 0 && idx < this.suggestedOptions.length) {
                            return this.suggestedOptions[idx].value;
                        }
                    }

                    if (this.suggestedOptions.length > 0) {
                        this.$q.notify({
                            type: 'warning',
                            message: 'Please select one of the specific options above instead of a plain confirmation.',
                            timeout: 4000
                        });
                        return null;
                    }
                }
                return rawText.trim();
            },

            async sendMessage(overrideMode, targetParentOverride) {
                let jsonOverride = this.detectedJsonPayload;
                let activeMode = (overrideMode || (jsonOverride && jsonOverride.mode) || this.modeProp || 'discuss').toLowerCase();
                let promptText = '';

                // 1. Resolve effective prompt & parameters
                if (jsonOverride) {
                    promptText = jsonOverride.userPrompt || jsonOverride.prompt || '';
                    if (!promptText && jsonOverride.message) promptText = jsonOverride.message;
                } else {
                    promptText = this.newInput.trim();
                }

                // Fallback default prompts if input was empty
                if (!promptText) {
                    const targetTopic = this.activeTitle || this.discussion?.name || 'this topic';
                    if (activeMode === 'plan') {
                        promptText = `Formulate the formal implementation plan and artifact breakdown for: ${targetTopic}`;
                    } else if (activeMode === 'build') {
                        const targetPayloadId = this.activeNode?.stagedPayloadId
                            || (this.displayedMessages.find(m => m.stagedPayloadId)?.stagedPayloadId)
                            || 'active';
                        promptText = `Execute build phase for Plan Payload #${targetPayloadId}: Generate root artifacts and screen definitions for ${targetTopic}.`;
                    } else {
                        this.$q.notify({
                            type: 'warning',
                            message: `Please enter a ${activeMode} directive, question, or JSON payload envelope.`,
                            timeout: 2500
                        });
                        return;
                    }
                }

                if (!jsonOverride) {
                    promptText = this.validateAndDisambiguate(promptText);
                    if (!promptText) return;
                }

                const effectiveDiscussionId = (jsonOverride && jsonOverride.discussionId) || this.discussionId;
                if (!effectiveDiscussionId) {
                    this.$q.notify({ type: 'warning', message: 'No target discussion container selected.' });
                    return;
                }

                let targetParentId = (jsonOverride && jsonOverride.parentMessageId) || targetParentOverride || null;
                if (!targetParentId) {
                    if (this.selectedMessageId) {
                        targetParentId = this.selectedMessageId;
                    } else if (this.displayedMessages && this.displayedMessages.length > 0) {
                        const userMsgs = this.displayedMessages.filter(m => m.senderRoleEnumId !== 'AsrAssistant' && m.role !== 'assistant');
                        targetParentId = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].messageId : this.displayedMessages[this.displayedMessages.length - 1].messageId;
                    }
                }

                this.newInput = '';
                this.isSending = true;

                try {
                    // Record User Message Turn
                    const userTurnResp = await axios.post('/rest/s1/agi-ai/discussions/message', {
                        discussionId: effectiveDiscussionId,
                        parentMessageId: targetParentId,
                        senderRoleEnumId: 'AsrUser',
                        content: promptText
                    }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                    const userMsgId = String(userTurnResp.data?.messageId);
                    const nowFormatted = new Date().toISOString().replace('T', ' ').substring(0, 19);

                    const localUserMsg = {
                        messageId: userMsgId,
                        parentMessageId: targetParentId,
                        senderRoleEnumId: 'AsrUser',
                        role: 'user',
                        partyId: (window.moqui && window.moqui.userId) || 'User',
                        statusId: 'AmsActive',
                        entryDate: nowFormatted,
                        content: promptText,
                        contents: [{ messageId: userMsgId, bodyText: promptText, contentTypeEnumId: 'mctMarkdown' }]
                    };

                    this.allMessages.push(localUserMsg);

                    // Build Dispatch Payload with Smart Overlays
                    let dispatchPayload = {
                        discussionId: effectiveDiscussionId,
                        parentMessageId: userMsgId,
                        userPrompt: promptText,
                        mode: activeMode
                    };

                    if (jsonOverride) {
                        dispatchPayload = Object.assign({}, dispatchPayload, jsonOverride, {
                            discussionId: effectiveDiscussionId,
                            parentMessageId: userMsgId,
                            userPrompt: promptText,
                            mode: activeMode
                        });
                    }

                    const dispatchResp = await axios.post('/rest/s1/agi-ai/discussions/dispatch', dispatchPayload, {
                        headers: { 'moquiSessionToken': this.resolveCsrf() }
                    });

                    const assistantMsgId = String(dispatchResp.data?.assistantMessageId);
                    const completionRaw = dispatchResp.data?.completionText || '';
                    const stagedId = dispatchResp.data?.stagedPayloadId || null;

                    const localAssistantMsg = {
                        messageId: assistantMsgId,
                        parentMessageId: userMsgId,
                        senderRoleEnumId: 'AsrAssistant',
                        role: 'assistant',
                        statusId: 'AmsActive',
                        stagedPayloadId: stagedId,
                        entryDate: new Date().toISOString().replace('T', ' ').substring(0, 19),
                        content: completionRaw,
                        contents: [{ messageId: assistantMsgId, bodyText: completionRaw, contentTypeEnumId: 'mctMarkdown' }]
                    };

                    this.allMessages.push(localAssistantMsg);

                    const isPlanMode = activeMode === 'plan';
                    const nodeLabel = isPlanMode
                        ? '📋 Plan: ' + promptText.slice(0, 35)
                        : (activeMode === 'build' ? '🔨 Build: ' + promptText.slice(0, 35) : promptText.slice(0, 40));

                    this.$emit('turn-created', {
                        discussionId: effectiveDiscussionId,
                        parentMessageId: targetParentId || this.selectedMessageId,
                        userNode: {
                            nodeKey: 'msg_' + userMsgId,
                            id: userMsgId,
                            messageId: userMsgId,
                            discussionId: effectiveDiscussionId,
                            label: nodeLabel,
                            senderRoleEnumId: 'AsrUser',
                            mode: activeMode,
                            stagedPayloadId: stagedId,
                            statusId: 'AmsActive',
                            entryDate: nowFormatted,
                            children: []
                        }
                    });

                    this.$emit('turn-dispatched', {
                        discussionId: effectiveDiscussionId,
                        userMsgId: userMsgId,
                        assistantMsgId: assistantMsgId,
                        stagedPayloadId: stagedId,
                        mode: activeMode
                    });

                    this.isSending = false;
                } catch (e) {
                    this.isSending = false;
                    this.$q.notify({ type: 'negative', message: 'Turn failed: ' + (e.response?.data?.errors || e.message) });
                }
            },

            promoteToPlan() {
                const topicTitle = this.activeTitle || this.discussion?.name || 'this topic';
                const defaultPrompt = `Formulate the formal implementation plan and artifact breakdown for: ${topicTitle}`;
                const topicParentId = this.selectedMessageId
                    || this.activeNode?.messageId
                    || (this.displayedMessages.length > 0 ? this.displayedMessages[0].messageId : null);

                this.$q.dialog({
                    title: 'Promote to Plan',
                    message: 'Advance this discussion into a formal execution plan:',
                    prompt: {
                        model: defaultPrompt,
                        type: 'textarea'
                    },
                    ok: { label: 'Formulate Plan', color: 'deep-purple-7' },
                    cancel: true
                }).onOk(async (planPrompt) => {
                    this.$emit('mode-updated', 'plan');
                    this.newInput = planPrompt.trim();
                    await this.sendMessage('plan', topicParentId);
                });
            },

            decomposePlan() {
                const targetPayloadId = this.activeNode?.stagedPayloadId
                    || (this.displayedMessages.find(m => m.stagedPayloadId)?.stagedPayloadId)
                    || 'active';
                const topicTitle = this.activeTitle || this.discussion?.name || 'this plan';

                const defaultPrompt = `Decompose Plan #${targetPayloadId} (${topicTitle}) into ordered, atomic Subplans. For each phase, specify exact services, entities, and XML screens required.`;
                const topicParentId = this.selectedMessageId || this.activeNode?.messageId;

                this.$q.dialog({
                    title: 'Decompose Plan into Subplans',
                    message: `Break Plan #${targetPayloadId} down into sequential, reviewable subplans:`,
                    prompt: {
                        model: defaultPrompt,
                        type: 'textarea'
                    },
                    ok: { label: 'Generate Subplans', color: 'deep-purple-7' },
                    cancel: true
                }).onOk(async (subplanPrompt) => {
                    this.$emit('mode-updated', 'plan');
                    this.newInput = subplanPrompt.trim();
                    await this.sendMessage('plan', topicParentId);
                });
            },

            promoteToBuild() {
                this.$emit('mode-updated', 'build');
                const targetPayload = this.activeNode?.stagedPayloadId || 'active';

                let planSummary = "";
                if (this.activeNode?.label) {
                    planSummary = ` Target Scope: ${this.activeNode.label}.`;
                }

                this.newInput = `Execute build phase for Plan Payload #${targetPayload}:${planSummary} Generate root application screen referencing the operational pillars. Return the complete, valid XML screen definition.`;

                this.$q.notify({
                    type: 'info',
                    message: 'Stance shifted to BUILD mode. Review prompt below and click "Generate & Build".',
                    icon: 'handyman',
                    color: 'amber-9',
                    textColor: 'black',
                    timeout: 3500
                });
            },
        },
        template: `
            <div class="discussion-detail fit column no-wrap bg-slate-950 text-white font-mono overflow-hidden">
                <component :is="'style'">
                    .discussion-detail .markdown-body h1 { font-size: 15px; margin: 8px 0 4px 0; font-weight: 700; color: #38bdf8; }
                    .discussion-detail .markdown-body h2 { font-size: 14px; margin: 6px 0 4px 0; font-weight: 700; color: #38bdf8; }
                    .discussion-detail .markdown-body h3 { font-size: 13px; margin: 5px 0 2px 0; font-weight: 600; color: #7dd3fc; }
                    .discussion-detail .markdown-body h4 { font-size: 12px; margin: 4px 0 2px 0; font-weight: 600; color: #bae6fd; }
                    .discussion-detail .markdown-body h5 { font-size: 11px; margin: 3px 0 2px 0; font-weight: 600; color: #e0f2fe; }
                    .discussion-detail .markdown-body p { margin-bottom: 6px; font-size: 12px; line-height: 1.5; }
                    .discussion-detail .markdown-body ul, .discussion-detail .markdown-body ol { margin: 2px 0 6px 16px; padding: 0; }
                    .discussion-detail .markdown-body li { margin-bottom: 2px; font-size: 12px; }
                </component>

                <!-- 1. TOP SUMMARY BAR -->
                <div class="row items-center justify-between q-pa-sm bg-slate-900" style="border-bottom: 1px solid #334155;">
                    <div class="row items-center q-gutter-x-sm">
                        <q-icon :name="selectedMessageId ? 'chat_bubble_outline' : 'forum'" color="cyan-4" size="sm" />
                        <span class="text-subtitle2 text-weight-bold text-cyan-2 ellipsis" style="max-width: 420px;">
                            {{ activeTitle }}
                        </span>
                        <q-badge v-if="selectedMessageId" color="slate-800" text-color="cyan-3" class="text-caption">
                            Node #{{ selectedMessageId }}
                        </q-badge>
                    </div>

                    <div class="row items-center q-gutter-x-xs">
                        <q-btn 
                            v-if="selectedMessageId"
                            flat dense no-caps
                            size="xs"
                            :icon="filterToSelectedNode ? 'visibility' : 'filter_list'"
                            :label="filterToSelectedNode ? 'Scoped View' : 'All Messages'"
                            :color="filterToSelectedNode ? 'cyan-3' : 'slate-400'"
                            class="q-px-xs"
                            @click="filterToSelectedNode = !filterToSelectedNode"
                        >
                            <q-tooltip>{{ filterToSelectedNode ? 'Show all messages in container' : 'Scope to selected node' }}</q-tooltip>
                        </q-btn>

                        <!-- Promote to Plan -->
                        <q-btn 
                            v-if="modeProp === 'discuss' && !hasPlanPayload"
                            color="deep-purple-7" 
                            text-color="white" 
                            size="xs" 
                            icon="architecture" 
                            label="Promote to Plan"
                            dense no-caps
                            class="text-weight-bold q-px-sm"
                            @click="promoteToPlan"
                        >
                            <q-tooltip>Advance this topic into a formal Plan payload</q-tooltip>
                        </q-btn>

                        <!-- Phase A: Decompose Plan Button -->
                        <q-btn 
                            v-if="hasPlanPayload"
                            flat dense no-caps
                            size="xs" 
                            icon="call_split" 
                            label="Decompose Plan"
                            color="purple-3"
                            class="text-weight-bold q-px-xs"
                            style="border: 1px solid #7c3aed;"
                            @click="decomposePlan"
                        >
                            <q-tooltip>Decompose this architecture plan into atomic, bite-sized Subplans</q-tooltip>
                        </q-btn>

                        <!-- Promote to Build (Non-firing stance shift) -->
                        <q-btn 
                            v-if="modeProp !== 'build' && hasPlanPayload"
                            color="amber-9" 
                            text-color="black" 
                            size="xs" 
                            icon="handyman" 
                            label="Promote to Build"
                            dense no-caps
                            class="text-weight-bold q-px-sm"
                            @click="promoteToBuild"
                        >
                            <q-tooltip>Shift stance to Build mode to generate code</q-tooltip>
                        </q-btn>

                        <q-badge
                            v-else-if="modeProp === 'build'"
                            color="amber-9"
                            text-color="black"
                            class="q-px-sm q-py-xs text-weight-bolder text-caption"
                        >
                            <q-icon name="handyman" size="13px" class="q-mr-xs" />
                            BUILD STANCE ACTIVE
                        </q-badge>

                        <q-btn flat round dense icon="refresh" size="xs" color="cyan-4" @click="loadTranscript">
                            <q-tooltip>Manual Transcript Refresh</q-tooltip>
                        </q-btn>
                    </div>
                </div>

                <!-- 2. MODE & FACET BAR -->
                <div class="row items-center justify-between q-px-sm q-py-xs" style="background-color: #082f49; border-bottom: 1px solid #0369a1;">
                    <div class="row items-center q-gutter-x-xs">
                        <q-icon :name="modeConfig.icon" :color="modeConfig.color" size="14px" />
                        <span class="text-caption text-weight-bold text-cyan-2" style="font-size: 11px;">STANCE:</span>
                        <q-badge :color="modeConfig.badgeColor" :text-color="modeConfig.textColor" class="text-weight-bolder" style="font-size: 10px;">
                            {{ modeConfig.mode.toUpperCase() }}
                        </q-badge>
                        
                        <!-- JSON Payload Detected Badge -->
                        <q-badge 
                            v-if="detectedJsonPayload" 
                            color="purple-9" 
                            text-color="amber-3" 
                            class="text-weight-bold q-ml-xs animate-pulse"
                            style="border: 1px solid #a855f7; font-size: 10px;"
                        >
                            <q-icon name="data_object" size="12px" class="q-mr-xs" />
                            JSON PAYLOAD OVERRIDE
                        </q-badge>

                        <span class="text-caption text-slate-300 q-ml-sm italic" style="font-size: 10px;">
                            {{ selectedMessageId ? 'Scoped to selected topic branch' : 'Viewing root discussion thread' }}
                        </span>
                    </div>

                    <div v-if="containerFacets && Object.keys(containerFacets).length > 0" class="row items-center q-gutter-x-xs">
                        <span class="text-caption text-slate-400" style="font-size: 10px;">FACETS:</span>
                        <q-chip 
                            v-for="(v, k) in containerFacets" 
                            :key="k" 
                            dense size="xs" 
                            color="slate-900" 
                            text-color="amber-3" 
                            style="border: 1px solid #38bdf8;"
                        >
                            <strong>{{ k }}:</strong>&nbsp;{{ v }}
                        </q-chip>
                    </div>
                </div>

                <!-- 3. CONVERSATION STREAM -->
                <div class="col overflow-y-auto q-pa-md column q-gutter-y-md">
                    <div v-if="displayedMessages.length === 0" class="text-slate-500 italic text-caption text-center q-my-xl">
                        No messages for the selected item. Use the input below to reply, search, or ask a question.
                    </div>

                    <div 
                        v-for="msg in displayedMessages" 
                        :key="msg.messageId"
                        class="column q-pa-md rounded-borders"
                        :style="msg.role === 'assistant' 
                            ? 'background-color: #0c1a2e; border: 1px solid #1e3a5f; border-left: 5px solid #38bdf8;' 
                            : 'background-color: #0f172a; border: 1px solid #1e293b; border-left: 5px solid #64748b;'"
                    >
                        <div class="row items-center justify-between text-caption q-mb-sm pb-xs" style="border-bottom: 1px solid rgba(255,255,255,0.08);">
                            <div class="row items-center q-gutter-x-xs">
                                <q-icon :name="msg.role === 'assistant' ? 'smart_toy' : 'person'" size="16px" :color="msg.role === 'assistant' ? 'cyan-3' : 'slate-300'" />
                                <span class="text-weight-bold" :class="msg.role === 'assistant' ? 'text-cyan-3' : 'text-slate-200'">
                                    {{ msg.role === 'assistant' ? 'Moqui AI Architect' : (msg.partyId || 'User') }}
                                </span>
                                <span class="text-slate-500 text-caption q-ml-xs">#{{ msg.messageId }}</span>

                                <q-badge 
                                    v-if="msg.stagedPayloadId" 
                                    color="deep-purple-8" 
                                    text-color="white" 
                                    class="q-ml-sm text-weight-bold cursor-pointer"
                                    style="font-size: 10px;"
                                >
                                    <q-icon name="architecture" size="12px" class="q-mr-xs" />
                                    PLAN PAYLOAD #{{ msg.stagedPayloadId }}
                                    <q-tooltip>Structured plan formulation stored in AgiPayload</q-tooltip>
                                </q-badge>
                            </div>
                            <span class="text-slate-400" style="font-size: 11px;">{{ msg.entryDate }}</span>
                        </div>

                        <div 
                            class="text-slate-100 markdown-body" 
                            style="font-size: 12px; line-height: 1.5; word-break: break-word;"
                            v-html="formatBody(msg.content)"
                        ></div>
                    </div>
                </div>

                <!-- 4. INPUT CONSOLE & OPTION CHIPS -->
                <div class="q-pa-sm bg-slate-900" style="border-top: 1px solid #334155;">
                    <div v-if="suggestedOptions && suggestedOptions.length > 0" class="row items-center q-gutter-x-xs q-mb-xs">
                        <span class="text-caption text-slate-400" style="font-size: 10px;">OPTIONS:</span>
                        <q-chip
                            v-for="(opt, idx) in suggestedOptions"
                            :key="idx"
                            clickable
                            dense
                            size="sm"
                            color="slate-950"
                            text-color="cyan-3"
                            style="border: 1px solid #0284c7;"
                            @click="selectOption(opt)"
                        >
                            <q-icon name="arrow_forward" size="12px" class="q-mr-xs" />
                            {{ opt.label }}
                        </q-chip>
                    </div>

                    <div class="row items-center q-gutter-x-sm">
                        <q-input 
                            v-model="newInput" 
                            type="textarea" 
                            rows="2" 
                            dark outlined dense 
                            color="cyan-3"
                            class="col text-caption font-mono"
                            input-class="text-slate-100 placeholder-slate-500 font-mono"
                            input-style="color: #f1f5f9; background-color: #020617; caret-color: #38bdf8;"
                            style="background-color: #020617; border-radius: 4px;"
                            :placeholder="detectedJsonPayload 
                                ? 'Structured JSON envelope detected. Ctrl+Enter to dispatch payload...'
                                : (selectedMessageId 
                                    ? 'Target: #' + selectedMessageId + ' (' + modeConfig.label + ')...' 
                                    : 'Enter ' + modeConfig.mode + ' query/directive, or paste JSON payload (Ctrl+Enter to send)...')"
                            :disable="isSending || !discussionId"
                            @keydown.ctrl.enter="sendMessage()"
                        />
                        <q-btn 
                            :color="modeConfig.color"
                            :text-color="modeConfig.textColor"
                            :icon="modeConfig.icon" 
                            :label="modeConfig.label" 
                            dense no-caps
                            class="q-px-md font-mono text-weight-bold"
                            style="height: 48px;"
                            :loading="isSending"
                            :disable="!discussionId"
                            @click="sendMessage()"
                        >
                            <q-tooltip>{{ modeConfig.tooltip }}</q-tooltip>
                        </q-btn>
                    </div>
                </div>

            </div>
        `
    };

    window.AiTurnDetail = AiTurnDetail;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AiComponents = window.AiComponents || {};
    window.AgiComponents['ai-turn-detail'] = AiTurnDetail;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('ai-turn-detail', AiTurnDetail);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();