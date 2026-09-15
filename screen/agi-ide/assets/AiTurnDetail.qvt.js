(function () {
    const AiTurnDetail = {
        name: 'AiTurnDetail',
        emits: ['turn-dispatched', 'discussion-promoted', 'mode-updated'],
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
            // Determines if the selected tree node represents a specific message/sub-topic
            selectedMessageId() {
                if (!this.activeNode) return '';
                if (this.activeNode.messageId) return this.activeNode.messageId;
                if (this.activeNode.id && !this.activeNode.id.startsWith('disc_') && this.activeNode.id !== this.discussionId) {
                    return this.activeNode.id.replace('msg_', '');
                }
                return '';
            },

            // In AiTurnDetail.qvt.js:
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
                    }
                    this.loadTranscript();
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
                // If wrapped in JSON envelope, unpack it
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

                // 1. If Showdown is available, convert with GitHub flavor (tables, tasklists, stikethrough)
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

                // 2. Fallback Markdown + Table Parser if Showdown script is not yet mounted
                return this.renderBasicMarkdownWithTables(text);
            },

            renderBasicMarkdownWithTables(text) {
                // Code Blocks
                text = text.replace(/```([\s\S]*?)```/g, (m, p1) =>
                    `<pre class="bg-slate-900 q-pa-sm rounded-borders overflow-x-auto text-cyan-2" style="border: 1px solid #1e293b;"><code>${p1.trim()}</code></pre>`
                );
                // Inline Code
                text = text.replace(/`([^`]+)`/g, '<code class="bg-slate-900 text-amber-3 q-px-xs rounded-borders">$1</code>');

                // Headers (Numbered & Hash)
                text = text.replace(/^### (.*$)/gim, '<h4 class="text-subtitle1 text-cyan-3 text-weight-bold q-my-xs">$1</h4>');
                text = text.replace(/^## (.*$)/gim, '<h3 class="text-subtitle1 text-cyan-2 text-weight-bold q-my-sm" style="border-bottom: 1px solid #334155; padding-bottom: 2px;">$1</h3>');
                text = text.replace(/^# (.*$)/gim, '<h2 class="text-h6 text-cyan-1 text-weight-bolder q-my-sm" style="border-bottom: 1px solid #0284c7; padding-bottom: 4px;">$1</h2>');
                text = text.replace(/^(\d+\.\s+[^\n]+)/gim, '<h3 class="text-subtitle2 text-weight-bold text-cyan-3 q-my-sm">$1</h3>');

                // Bold & Italic
                text = text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white text-weight-bold">$1</strong>');
                text = text.replace(/\*(.*?)\*/g, '<em class="text-slate-300">$1</em>');

                // Markdown Tables Parser
                text = text.replace(/((\|[^\n]+\|\r?\n)+)/g, (tableBlock) => {
                    const lines = tableBlock.trim().split(/\r?\n/).filter(l => l.trim().startsWith('|'));
                    if (lines.length < 2) return tableBlock;

                    let html = '<div class="q-my-md overflow-x-auto"><table class="q-table q-table--dense text-caption full-width" style="border: 1px solid #334155; border-collapse: collapse;">';

                    lines.forEach((line, idx) => {
                        if (line.includes(':---') || line.includes('---')) return; // skip delimiter
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

                // Bullet Lists
                text = text.replace(/^\s*\*\s+(.*$)/gim, '<li class="q-ml-md text-slate-200">$1</li>');
                text = text.replace(/^\s*-\s+(.*$)/gim, '<li class="q-ml-md text-slate-200">$1</li>');

                // Horizontal Rules
                text = text.replace(/^---$/gim, '<hr class="q-my-sm" style="border: 0; border-top: 1px solid #334155;" />');

                // Line breaks
                text = text.replace(/\n\n/g, '<div class="q-my-xs"></div>');
                text = text.replace(/\n/g, '<br/>');

                return text;
            },

            async sendMessage() {
                if (!this.newInput.trim() || !this.discussionId) return;
                const promptText = this.newInput.trim();
                this.newInput = '';
                this.isSending = true;

                // Find the latest message in the active thread to maintain conversational ancestry
                let targetParentId = null;
                if (this.displayedMessages && this.displayedMessages.length > 0) {
                    const lastMsg = this.displayedMessages[this.displayedMessages.length - 1];
                    targetParentId = lastMsg.messageId;
                } else if (this.selectedMessageId) {
                    targetParentId = this.selectedMessageId;
                }

                try {
                    // 1. Record user turn
                    const userTurnResp = await axios.post('/rest/s1/agi-ai/discussions/message', {
                        discussionId: this.discussionId,
                        parentMessageId: targetParentId,
                        senderRoleEnumId: 'AsrUser',
                        content: promptText
                    }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                    const userMsgId = userTurnResp.data?.messageId;
                    await this.loadTranscript();

                    // 2. Dispatch AI agent turn with explicit parent
                    await axios.post('/rest/s1/agi-ai/discussions/dispatch', {
                        discussionId: this.discussionId,
                        parentMessageId: userMsgId,
                        userPrompt: promptText,
                        mode: this.modeProp || 'discuss'
                    }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                    this.isSending = false;
                    await this.loadTranscript();
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
                        <!-- Toggle All vs Thread Scope -->
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
                            <q-tooltip>{{ filterToSelectedNode ? 'Click to show all messages in container' : 'Click to scope to selected node' }}</q-tooltip>
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
                            <q-tooltip>Refresh Transcript</q-tooltip>
                        </q-btn>
                    </div>
                </div>

                <!-- 2. MODE & FACET BAR -->
                <div class="row items-center justify-between q-px-sm q-py-xs" style="background-color: #082f49; border-bottom: 1px solid #0369a1;">
                    <div class="row items-center q-gutter-x-xs">
                        <q-icon name="info" color="cyan-3" size="14px" />
                        <span class="text-caption text-weight-bold text-cyan-2" style="font-size: 11px;">MODE:</span>
                        
                        <q-badge color="cyan-6" text-color="black" class="text-weight-bolder" style="font-size: 10px;">
                            {{ (modeProp || 'discuss').toUpperCase() }}
                        </q-badge>

                        <span class="text-caption text-slate-300 q-ml-sm italic" style="font-size: 10px;">
                            {{ selectedMessageId ? 'Scoped to selected topic branch' : 'Viewing root discussion thread' }}
                        </span>
                    </div>

                    <!-- Facets Chips -->
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
                            </div>
                            <span class="text-slate-400" style="font-size: 11px;">{{ msg.entryDate }}</span>
                        </div>

                        <!-- Formatted Markdown Content Area -->
                        <div 
                            class="text-slate-100 markdown-body" 
                            style="font-size: 13px; line-height: 1.6; word-break: break-word;"
                            v-html="formatBody(msg.content)"
                        ></div>
                    </div>
                </div>

                <!-- 4. INPUT CONSOLE -->
                <div class="q-pa-sm bg-slate-900" style="border-top: 1px solid #334155;">
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
                                ? 'Reply to #' + selectedMessageId + ' (Ctrl+Enter to post)...' 
                                : 'Enter discussion message, question, or design requirement (Ctrl+Enter to post)...'"
                            :disable="isSending || !discussionId"
                            @keydown.ctrl.enter="sendMessage"
                        />
                        <q-btn 
                            color="primary" 
                            icon="chat" 
                            :label="selectedMessageId ? 'Reply' : 'Reply / Discuss'" 
                            dense no-caps
                            class="q-px-md font-mono text-weight-bold"
                            style="height: 48px;"
                            :loading="isSending"
                            :disable="!discussionId"
                            @click="sendMessage"
                        >
                            <q-tooltip>{{ selectedMessageId ? 'Reply to selected topic #' + selectedMessageId : 'Add turn to discussion' }}</q-tooltip>
                        </q-btn>
                    </div>
                </div>

            </div>
        `
    };

    window.AiTurnDetail = AiTurnDetail;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['ai-turn-detail'] = AiTurnDetail;

    const registerDiscussionDetail = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('ai-turn-detail', AiTurnDetail);
        } else {
            setTimeout(registerDiscussionDetail, 50);
        }
    };
    registerDiscussionDetail();
})();