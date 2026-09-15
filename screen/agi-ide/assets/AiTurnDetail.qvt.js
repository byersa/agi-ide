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
                filterToSelectedNode: true
            };
        },
        computed: {
            selectedMessageId() {
                if (!this.activeNode) return '';
                if (this.activeNode.messageId) return this.activeNode.messageId;
                if (this.activeNode.id && !this.activeNode.id.startsWith('disc_') && this.activeNode.id !== this.discussionId) {
                    return this.activeNode.id.replace('msg_', '');
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

            // Phase 3: Epistemic Stance Configuration (Discuss | Plan | Build)
            modeConfig() {
                const mode = (this.modeProp || 'discuss').toLowerCase();
                if (mode === 'plan') {
                    return {
                        mode: 'plan',
                        color: 'deep-purple-7',
                        textColor: 'white',
                        icon: 'architecture',
                        badgeColor: 'deep-purple-8',
                        label: this.selectedMessageId ? 'Formulate Plan' : 'Plan Architecture',
                        tooltip: 'Formulate a structured execution plan grounded in the selected context'
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

            // Phase 2: Disambiguation - Extract options/questions from the preceding assistant message
            suggestedOptions() {
                if (!this.displayedMessages || !this.displayedMessages.length) return [];

                // 1. Find the latest assistant message safely
                const lastAssistantMsg = this.displayedMessages
                    .slice()
                    .reverse()
                    .find(function (m) {
                        return m && (m.senderRoleEnumId === 'AsrAssistant' || m.role === 'assistant');
                    });

                if (!lastAssistantMsg || !lastAssistantMsg.content) return [];

                const text = this.extractContent(lastAssistantMsg.content);
                if (!text) return [];

                const options = [];

                // 2. Pattern 1: Numbered choices near the end
                const regex = /(?:^|\n)\s*(\d+)[\.\)]\s*\*{0,2}([^:\n\*\?]+(?:\:[^\n\*\?]+)?)\*{0,2}/g;
                let match = null;
                const matches = [];
                while ((match = regex.exec(text)) !== null) {
                    matches.push(match);
                }

                if (matches.length >= 2) {
                    const recent = matches.slice(-4);
                    recent.forEach(function (mItem) {
                        const num = mItem[1].trim();
                        let title = mItem[2].trim().replace(/\*\*/g, '').replace(/`/g, '');
                        if (title.length > 50) title = title.substring(0, 47) + '...';
                        options.push({
                            label: num + '. ' + title,
                            value: 'Proceed with Option ' + num + ': ' + mItem[2].trim()
                        });
                    });
                    if (options.length > 0) return options;
                }

                // 3. Pattern 2: Binary / Alternative question ("start by A or B?")
                const orMatch = text.match(/(?:start|begin|proceed)\s+by\s+(?:scaffolding|setting\s+up|designing|creating)?\s*(.+?)\s+or\s+(.+?)\??$/im);
                if (orMatch) {
                    const opt1 = orMatch[1].trim().replace(/\*\*/g, '').replace(/`/g, '');
                    const opt2 = orMatch[2].trim().replace(/\*\*/g, '').replace(/`/g, '');
                    return [
                        { label: opt1.length > 40 ? opt1.substring(0, 37) + '...' : opt1, value: 'Proceed with: ' + opt1 },
                        { label: opt2.length > 40 ? opt2.substring(0, 37) + '...' : opt2, value: 'Proceed with: ' + opt2 }
                    ];
                }

                return [];
            },
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
                }
            }
        },
        mounted() {
            if (!window.showdown) {
                const s = document.createElement('script');
                s.src = '/js/showdown.min.js';
                s.onload = () => { this.$forceUpdate(); };
                document.head.appendChild(s);
            }
            if (this.discussionId && (!this.allMessages || this.allMessages.length === 0)) {
                this.loadTranscript();
            }
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
                let trimmed = String(raw).trim();
                if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                    try {
                        const parsed = JSON.parse(trimmed);
                        if (parsed.message) return parsed.message;
                        if (parsed.architectureSummary) return parsed.architectureSummary;
                        if (parsed.rawXmlContent) return parsed.rawXmlContent;
                    } catch (e) { }
                }
                return trimmed;
            },

            formatBody(raw) {
                let text = this.extractContent(raw);
                if (!text) return '';

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

            renderBasicMarkdownWithTables(text) {
                text = text.replace(/```([\s\S]*?)```/g, (m, p1) =>
                    `<pre class="bg-slate-900 q-pa-sm rounded-borders overflow-x-auto text-cyan-2" style="border: 1px solid #1e293b;"><code>${p1.trim()}</code></pre>`
                );
                text = text.replace(/`([^`]+)`/g, '<code class="bg-slate-900 text-amber-3 q-px-xs rounded-borders">$1</code>');
                text = text.replace(/^### (.*$)/gim, '<h4 class="text-subtitle1 text-cyan-3 text-weight-bold q-my-xs">$1</h4>');
                text = text.replace(/^## (.*$)/gim, '<h3 class="text-subtitle1 text-cyan-2 text-weight-bold q-my-sm" style="border-bottom: 1px solid #334155; padding-bottom: 2px;">$1</h3>');
                text = text.replace(/^# (.*$)/gim, '<h2 class="text-h6 text-cyan-1 text-weight-bolder q-my-sm" style="border-bottom: 1px solid #0284c7; padding-bottom: 4px;">$1</h2>');
                text = text.replace(/^(\d+\.\s+[^\n]+)/gim, '<h3 class="text-subtitle2 text-weight-bold text-cyan-3 q-my-sm">$1</h3>');
                text = text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white text-weight-bold">$1</strong>');
                text = text.replace(/\*(.*?)\*/g, '<em class="text-slate-300">$1</em>');

                text = text.replace(/((\|[^\n]+\|\r?\n)+)/g, (tableBlock) => {
                    const lines = tableBlock.trim().split(/\r?\n/).filter(l => l.trim().startsWith('|'));
                    if (lines.length < 2) return tableBlock;

                    let html = '<div class="q-my-md overflow-x-auto"><table class="q-table q-table--dense text-caption full-width" style="border: 1px solid #334155; border-collapse: collapse;">';
                    lines.forEach((line, idx) => {
                        if (line.includes(':---') || line.includes('---')) return;
                        const cells = line.split('|').slice(1, -1).map(c => c.trim());
                        if (idx === 0) {
                            html += '<thead class="bg-slate-900 text-cyan-3 text-weight-bold"><tr>';
                            cells.forEach(c => { html += `<th class="q-pa-xs text-left" style="border: 1px solid #334155;">${c}</th>`; });
                            html += '</tr></thead><tbody>';
                        } else {
                            html += '<tr style="border-bottom: 1px solid #1e293b;">';
                            cells.forEach(c => { html += `<td class="q-pa-xs text-slate-200" style="border: 1px solid #334155;">${c}</td>`; });
                            html += '</tr>';
                        }
                    });
                    html += '</tbody></table></div>';
                    return html;
                });

                text = text.replace(/^\s*\*\s+(.*$)/gim, '<li class="q-ml-md text-slate-200">$1</li>');
                text = text.replace(/^\s*-\s+(.*$)/gim, '<li class="q-ml-md text-slate-200">$1</li>');
                text = text.replace(/^---$/gim, '<hr class="q-my-sm" style="border: 0; border-top: 1px solid #334155;" />');
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

            async sendMessage() {
                if (!this.newInput.trim() || !this.discussionId) return;

                const promptText = this.validateAndDisambiguate(this.newInput);
                if (!promptText) return;

                this.newInput = '';
                this.isSending = true;

                let targetParentId = null;
                if (this.displayedMessages && this.displayedMessages.length > 0) {
                    const lastMsg = this.displayedMessages[this.displayedMessages.length - 1];
                    targetParentId = lastMsg.messageId;
                } else if (this.selectedMessageId) {
                    targetParentId = this.selectedMessageId;
                }

                // Epistemic mode stance
                const activeMode = (this.modeProp || 'discuss').toLowerCase();

                try {
                    // 1. Record user turn
                    const userTurnResp = await axios.post('/rest/s1/agi-ai/discussions/message', {
                        discussionId: this.discussionId,
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

                    if (!this.selectedMessageId) {
                        this.activeNode = {
                            nodeKey: 'msg_' + userMsgId,
                            id: userMsgId,
                            messageId: userMsgId,
                            discussionId: this.discussionId,
                            label: promptText.slice(0, 40)
                        };
                    }

                    // 2. Dispatch agent inference turn with explicit mode parameter
                    const dispatchResp = await axios.post('/rest/s1/agi-ai/discussions/dispatch', {
                        discussionId: this.discussionId,
                        parentMessageId: userMsgId,
                        userPrompt: promptText,
                        mode: activeMode
                    }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                    const assistantMsgId = String(dispatchResp.data?.assistantMessageId);
                    const completionRaw = dispatchResp.data?.completionText || '';

                    const localAssistantMsg = {
                        messageId: assistantMsgId,
                        parentMessageId: userMsgId,
                        senderRoleEnumId: 'AsrAssistant',
                        role: 'assistant',
                        statusId: 'AmsActive',
                        entryDate: new Date().toISOString().replace('T', ' ').substring(0, 19),
                        content: completionRaw,
                        contents: [{ messageId: assistantMsgId, bodyText: completionRaw, contentTypeEnumId: 'mctMarkdown' }]
                    };

                    this.allMessages.push(localAssistantMsg);

                    // 3. Notify Studio and Tree to splice node in memory
                    this.$emit('turn-created', {
                        discussionId: this.discussionId,
                        parentMessageId: targetParentId,
                        userNode: {
                            nodeKey: 'msg_' + userMsgId,
                            id: userMsgId,
                            messageId: userMsgId,
                            discussionId: this.discussionId,
                            label: promptText.slice(0, 40),
                            senderRoleEnumId: 'AsrUser',
                            statusId: 'AmsActive',
                            entryDate: nowFormatted,
                            children: []
                        }
                    });

                    this.$emit('turn-dispatched', {
                        discussionId: this.discussionId,
                        userMsgId: userMsgId,
                        assistantMsgId: assistantMsgId,
                        mode: activeMode
                    });

                    this.isSending = false;
                } catch (e) {
                    this.isSending = false;
                    this.$q.notify({ type: 'negative', message: 'Turn failed: ' + (e.response?.data?.errors || e.message) });
                }
            },

            promoteDiscussion() {
                const vm = this;
                const taskLabel = this.activeTitle || vm.discussion?.name || '';
                this.$q.dialog({
                    title: 'Promote to WorkEffort',
                    message: 'Elevate this topic into a formal Mantle UDM task:',
                    prompt: { model: taskLabel, type: 'text' },
                    cancel: true
                }).onOk(async (taskTitle) => {
                    try {
                        const payload = {
                            workEffortName: taskTitle.trim(),
                            workEffortTypeEnumId: 'WetTask'
                        };
                        if (vm.selectedMessageId) {
                            payload.messageId = vm.selectedMessageId;
                        } else {
                            payload.discussionId = vm.discussionId;
                        }

                        const resp = await axios.post('/rest/s1/agi-ai/discussions/promote', payload, {
                            headers: { 'moquiSessionToken': vm.resolveCsrf() }
                        });

                        const weId = resp.data?.workEffortId;
                        vm.$q.notify({
                            type: 'positive',
                            message: `Promoted to Mantle UDM WorkEffort #${weId}!`
                        });
                        vm.$emit('discussion-promoted', weId);
                        vm.loadTranscript();
                    } catch (e) {
                        vm.$q.notify({ type: 'negative', message: e.message });
                    }
                });
            }
        },
        template: `
            <div class="discussion-detail fit column no-wrap bg-slate-950 text-white font-mono overflow-hidden">
                <!-- 1. TOP SUMMARY BAR -->
                <div class="row items-center justify-between q-pa-sm bg-slate-900" style="border-bottom: 1px solid #334155;">
                    <div class="row items-center q-gutter-x-sm">
                        <q-icon :name="selectedMessageId ? 'chat_bubble_outline' : 'forum'" color="cyan-4" size="sm" />
                        <span class="text-subtitle2 text-weight-bold text-cyan-2 ellipsis" style="max-width: 480px;">
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

                        <q-btn 
                            v-if="discussion && !discussion.promotedWorkEffortId" 
                            color="positive" 
                            text-color="black" 
                            size="xs" 
                            icon="assignment_turned_in" 
                            label="Promote to WorkEffort"
                            dense no-caps
                            class="text-weight-bold q-px-sm"
                            @click="promoteDiscussion"
                        >
                            <q-tooltip>Promote active node to a Mantle UDM WorkEffort</q-tooltip>
                        </q-btn>

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
                        No messages for the selected item. Use the input below to reply or ask a question.
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

                                <!-- Phase 4: Staged Plan Payload Badge -->
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
                            style="font-size: 13px; line-height: 1.6; word-break: break-word;"
                            v-html="formatBody(msg.content)"
                        ></div>
                    </div>
                </div>

                <!-- 4. INPUT CONSOLE & OPTION CHIPS -->
                <div class="q-pa-sm bg-slate-900" style="border-top: 1px solid #334155;">
                    <!-- Suggested Semantic Options Bar -->
                    <div v-if="suggestedOptions.length > 0" class="row items-center q-gutter-x-xs q-mb-xs">
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
                            :placeholder="selectedMessageId 
                                ? 'Target: #' + selectedMessageId + ' (' + modeConfig.label + ')...' 
                                : 'Enter ' + modeConfig.mode + ' instruction (Ctrl+Enter to send)...'"
                            :disable="isSending || !discussionId"
                            @keydown.ctrl.enter="sendMessage"
                        />
                        <!-- Phase 3: Action Button Dynamically Bound to modeConfig -->
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
                            @click="sendMessage"
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