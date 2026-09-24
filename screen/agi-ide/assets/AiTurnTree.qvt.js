(function () {
    const AiTurnTree = {
        name: 'AiTurnTree',
        props: {
            targetComponent: { type: String, default: '' },
            targetArtifactUri: { type: String, default: '' },
            activeMode: { type: String, default: 'discuss' }
        },
        emits: ['node-selected', 'discussion-selected', 'mode-filter-selected'],
        data() {
            return {
                rawTreeNodes: [],
                loading: false,
                error: null,
                selectedNodeId: '',

                // Filters
                filterQuery: '',
                timeRangeFilter: 'all', // 'today' | '7d' | 'all'
                modeFilter: 'all',      // 'all' | 'search' | 'discuss' | 'plan' | 'build'
                showArchived: false,    // Soft-archive toggle

                // Hoisting
                hoistedRootNode: null,
                rootHistory: []
            };
        },
        computed: {
            visibleNodes() {
                let baseNodes = this.rawTreeNodes;

                if (this.hoistedRootNode) {
                    const findInTree = (nodes, key) => {
                        for (const n of nodes) {
                            if (n.nodeKey === key) return n;
                            if (n.children && n.children.length > 0) {
                                const found = findInTree(n.children, key);
                                if (found) return found;
                            }
                        }
                        return null;
                    };
                    const target = findInTree(this.rawTreeNodes, this.hoistedRootNode.nodeKey);
                    baseNodes = target ? (target.children || []) : [];
                }

                if (!this.filterQuery && this.timeRangeFilter === 'all' && this.modeFilter === 'all') {
                    return baseNodes;
                }

                const query = this.filterQuery.toLowerCase().trim();
                const cleanQ = query.replace(/^#/, '');
                const now = new Date();

                const matchesFilter = (node) => {
                    let matchText = true;
                    if (query) {
                        const lbl = (node.label || '').toLowerCase();
                        const sName = (node.shortName || '').toLowerCase();
                        const mId = String(node.messageId || '');
                        const dId = String(node.discussionId || '');
                        const pId = String(node.stagedPayloadId || '');

                        matchText = lbl.includes(query)
                            || sName.includes(query)
                            || (mId && mId.includes(cleanQ))
                            || (dId && dId.includes(cleanQ))
                            || (pId && pId.includes(cleanQ));
                    }

                    let matchTime = true;
                    if (this.timeRangeFilter !== 'all' && node.entryDate) {
                        const entryDate = new Date(node.entryDate);
                        const diffMs = now - entryDate;
                        if (this.timeRangeFilter === 'today') {
                            matchTime = diffMs <= (24 * 60 * 60 * 1000);
                        } else if (this.timeRangeFilter === '7d') {
                            matchTime = diffMs <= (7 * 24 * 60 * 60 * 1000);
                        }
                    }

                    let matchMode = true;
                    if (this.modeFilter !== 'all') {
                        const nMode = (node.mode || node.assistMode || '').toLowerCase();
                        matchMode = nMode === this.modeFilter;
                    }

                    return matchText && matchTime && matchMode;
                };

                const filterHierarchy = (nodes) => {
                    const result = [];
                    for (const node of nodes) {
                        const filteredChildren = (node.children && node.children.length > 0)
                            ? filterHierarchy(node.children)
                            : [];

                        if (matchesFilter(node) || filteredChildren.length > 0) {
                            const cloned = Object.assign({}, node);
                            cloned.children = filteredChildren;
                            result.push(cloned);
                        }
                    }
                    return result;
                };

                return filterHierarchy(baseNodes);
            }
        },
        mounted() {
            this.fetchTree();
        },
        watch: {
            targetComponent() { this.fetchTree(); },
            showArchived() { this.fetchTree(); }
        },
        methods: {
            resolveCsrf() {
                return window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || "";
            },

            isPlanNode(node) {
                if (!node) return false;
                if (node.mode === 'plan' || node.stagedPayloadId) return true;
                const lbl = (node.label || '').toLowerCase();
                return lbl.startsWith('📋 plan:') || lbl.includes('formulate the formal implementation plan') || lbl.includes('subplan');
            },

            isBuildNode(node) {
                if (!node) return false;
                if (node.mode === 'build') return true;
                const lbl = (node.label || '').toLowerCase();
                return lbl.startsWith('🔨 build:') || lbl.startsWith('generate & build');
            },

            getNodeIcon(node) {
                if (node.isArchived) return 'archive';
                if (node.discussionId && !node.messageId) return 'forum';
                if (this.isPlanNode(node)) return 'architecture';
                if (this.isBuildNode(node)) return 'handyman';
                return 'chat_bubble_outline';
            },

            getNodeColor(node) {
                if (node.isArchived) return 'slate-600';
                if (node.discussionId && !node.messageId) return 'cyan-4';
                if (this.isPlanNode(node)) return 'purple-3';
                if (this.isBuildNode(node)) return 'amber-4';
                return 'slate-300';
            },

            async fetchTree() {
                this.loading = true;
                try {
                    const params = {
                        includeArchived: this.showArchived ? 'Y' : 'N'
                    };
                    if (this.targetComponent) {
                        params.targetComponent = this.targetComponent;
                    }

                    const resp = await axios.get('/rest/s1/agi-ai/discussions/tree', {
                        params: params,
                        headers: { 'moquiSessionToken': this.resolveCsrf() }
                    });

                    this.rawTreeNodes = resp.data?.treeNodes || [];
                } catch (err) {
                    console.error("Failed to load discussion tree:", err);
                    this.error = err.message;
                } finally {
                    this.loading = false;
                }
            },

            selectNode(node) {
                this.selectedNodeId = node.nodeKey;
                this.$emit('node-selected', node);
                if (node.discussionId) {
                    this.$emit('discussion-selected', node);
                }
            },

            jumpToQueriedId() {
                const q = (this.filterQuery || '').trim().replace(/^#/, '');
                if (!q) return;

                const findNode = (nodes) => {
                    for (const n of nodes) {
                        if (String(n.messageId) === q || String(n.discussionId) === q || String(n.stagedPayloadId) === q || n.nodeKey === q || n.nodeKey === ('msg_' + q)) {
                            return n;
                        }
                        if (n.children && n.children.length > 0) {
                            const found = findNode(n.children);
                            if (found) return found;
                        }
                    }
                    return null;
                };

                const target = findNode(this.rawTreeNodes);
                if (target) {
                    this.expandAllNodes();
                    this.selectNode(target);
                    this.$q.notify({ type: 'info', message: `Jumped to Node #${target.messageId || target.discussionId}`, timeout: 2000 });
                } else {
                    this.$q.notify({ type: 'warning', message: `ID #${q} not found in active tree.`, timeout: 2000 });
                }
            },

            hoistAsRoot(node) {
                if (!node) return;
                this.rootHistory.push(node);
                this.hoistedRootNode = node;
                this.selectedNodeId = node.nodeKey;
                this.$emit('node-selected', node);
            },

            popRootScope() {
                this.rootHistory.pop();
                this.hoistedRootNode = this.rootHistory.length > 0
                    ? this.rootHistory[this.rootHistory.length - 1]
                    : null;
            },

            resetRootScope() {
                this.rootHistory = [];
                this.hoistedRootNode = null;
            },

            jumpToRootHistory(index) {
                this.rootHistory = this.rootHistory.slice(0, index + 1);
                this.hoistedRootNode = this.rootHistory[this.rootHistory.length - 1];
            },

            confirmArchiveBranch(node) {
                const isMsg = !!node.messageId;
                const title = isMsg ? `Archive Turn #${node.messageId}?` : `Archive Discussion: ${node.label}?`;
                const promptMsg = isMsg
                    ? `This will archive turn #${node.messageId} and all of its nested child turns and subplans. They will be hidden from the active tree.`
                    : `This will archive the entire topic container and all associated turn history.`;

                this.$q.dialog({
                    title: title,
                    message: promptMsg,
                    cancel: true,
                    ok: { label: 'Archive Branch', color: 'negative' }
                }).onOk(async () => {
                    try {
                        const payload = isMsg ? { messageId: node.messageId } : { discussionId: node.discussionId };
                        const resp = await axios.post('/rest/s1/agi-ai/discussions/archive-branch', payload, {
                            headers: { 'moquiSessionToken': this.resolveCsrf() }
                        });
                        this.$q.notify({
                            type: 'info',
                            message: `Archived ${resp.data?.archivedCount || 1} item(s).`,
                            icon: 'archive'
                        });
                        this.fetchTree();
                    } catch (e) {
                        this.$q.notify({ type: 'negative', message: 'Failed to archive: ' + e.message });
                    }
                });
            },

            async restoreBranch(node) {
                const isMsg = !!node.messageId;
                try {
                    const payload = isMsg ? { messageId: node.messageId } : { discussionId: node.discussionId };
                    const resp = await axios.post('/rest/s1/agi-ai/discussions/restore-branch', payload, {
                        headers: { 'moquiSessionToken': this.resolveCsrf() }
                    });
                    this.$q.notify({
                        type: 'positive',
                        message: `Restored ${resp.data?.restoredCount || 1} item(s) to Active.`,
                        icon: 'unarchive'
                    });
                    this.fetchTree();
                } catch (e) {
                    this.$q.notify({ type: 'negative', message: 'Failed to restore: ' + e.message });
                }
            },

            insertTurnNode(payload) {
                if (!payload || !payload.userNode) return;
                const { discussionId, parentMessageId, userNode } = payload;

                let inserted = false;
                const findAndInsert = (nodes) => {
                    for (const node of nodes) {
                        if (parentMessageId && String(node.messageId) === String(parentMessageId)) {
                            if (!node.children) node.children = [];
                            node.children.push(userNode);
                            return true;
                        }
                        if (node.children && node.children.length > 0) {
                            if (findAndInsert(node.children)) return true;
                        }
                    }
                    return false;
                };

                inserted = findAndInsert(this.rawTreeNodes);

                if (!inserted) {
                    for (const node of this.rawTreeNodes) {
                        if (String(node.discussionId) === String(discussionId) && !node.messageId) {
                            if (!node.children) node.children = [];
                            node.children.push(userNode);
                            inserted = true;
                            break;
                        }
                    }
                }

                if (inserted) {
                    this.selectedNodeId = userNode.nodeKey;
                    this.selectNode(userNode);
                }
            },

            createRootDiscussion() {
                const vm = this;
                this.$q.dialog({
                    title: 'New Discussion Topic',
                    message: 'Enter topic name (e.g. Clinical Ingestion, Bed Allocation Wizard):',
                    prompt: { model: '', type: 'text' },
                    cancel: true,
                    persistent: true
                }).onOk(async (topicName) => {
                    if (!topicName.trim()) return;
                    vm.loading = true;
                    try {
                        const payload = {
                            name: topicName.trim(),
                            facets: {}
                        };
                        if (vm.targetComponent) {
                            payload.targetComponent = vm.targetComponent;
                            payload.facets.domain = vm.targetComponent;
                        }
                        if (vm.targetArtifactUri) {
                            payload.targetArtifactUri = vm.targetArtifactUri;
                        }

                        await axios.post('/rest/s1/agi-ai/discussions', payload, {
                            headers: { 'moquiSessionToken': vm.resolveCsrf() }
                        });

                        vm.fetchTree();
                    } catch (e) {
                        vm.loading = false;
                        vm.$q.notify({ type: 'negative', message: e.message });
                    }
                });
            },

            addSubTurn(node) {
                const vm = this;
                const discId = node.discussionId;
                const parentMsgId = node.messageId || null;

                this.$q.dialog({
                    title: 'Add Turn / Message',
                    message: `Reply under "${node.label}":`,
                    prompt: { model: '', type: 'textarea' },
                    cancel: true,
                    persistent: true
                }).onOk(async (text) => {
                    if (!text.trim()) return;
                    vm.loading = true;
                    try {
                        const recResp = await axios.post('/rest/s1/agi-ai/discussions/message', {
                            discussionId: discId,
                            parentMessageId: parentMsgId,
                            senderRoleEnumId: 'AsrUser',
                            content: text.trim()
                        }, { headers: { 'moquiSessionToken': vm.resolveCsrf() } });

                        const userMsgId = recResp.data?.messageId;

                        await axios.post('/rest/s1/agi-ai/discussions/dispatch', {
                            discussionId: discId,
                            parentMessageId: userMsgId,
                            userPrompt: text.trim(),
                            mode: vm.activeMode || 'discuss'
                        }, { headers: { 'moquiSessionToken': vm.resolveCsrf() } });

                        vm.loading = false;
                        await vm.fetchTree();

                        if (userMsgId) {
                            vm.selectNode({
                                nodeKey: 'msg_' + userMsgId,
                                id: userMsgId,
                                messageId: userMsgId,
                                discussionId: discId,
                                label: text.trim().slice(0, 40)
                            });
                        }
                    } catch (e) {
                        vm.loading = false;
                        vm.$q.notify({ type: 'negative', message: 'Turn failed: ' + (e.response?.data?.errors || e.message) });
                    }
                });
            },

            expandAllNodes() { if (this.$refs.qTreeRef) this.$refs.qTreeRef.expandAll(); },
            collapseAllNodes() { if (this.$refs.qTreeRef) this.$refs.qTreeRef.collapseAll(); }
        },
        template: `
            <div class="fit column no-wrap bg-slate-950 text-white font-mono overflow-hidden" style="height: 100%; max-height: 100%; min-height: 0; width: 100%;">
                
                <!-- 1. MULTI-FILTER SEARCH HEADER (FIXED HEIGHT) -->
                <div class="q-pa-xs bg-slate-900" style="border-bottom: 1px solid #334155; flex: 0 0 auto;">
                    <!-- Filter Input & Actions -->
                    <div class="row items-center q-gutter-x-xs q-mb-xs">
                        <q-input 
                            v-model="filterQuery" 
                            placeholder="Filter text or #ID (Enter to jump)..." 
                            dense dark outlined 
                            color="cyan-3"
                            class="col text-caption font-mono"
                            input-class="text-caption font-mono text-slate-200"
                            style="background-color: #020617; border-radius: 4px;"
                            clearable
                            @keydown.enter="jumpToQueriedId"
                        >
                            <template v-slot:prepend>
                                <q-icon name="search" size="14px" color="cyan-4" />
                            </template>
                        </q-input>

                        <q-btn size="xs" flat round icon="add" color="amber-4" @click="createRootDiscussion">
                            <q-tooltip>New Topic / Discussion</q-tooltip>
                        </q-btn>
                        <q-btn size="xs" flat round icon="unfold_more" color="slate-400" @click="expandAllNodes">
                            <q-tooltip>Expand All</q-tooltip>
                        </q-btn>
                        <q-btn size="xs" flat round icon="refresh" color="cyan-4" @click="fetchTree">
                            <q-tooltip>Refresh Tree</q-tooltip>
                        </q-btn>
                    </div>

                    <!-- Mode, Time & Soft-Archive Filters -->
                    <div class="row items-center justify-between q-px-xs" style="font-size: 10px;">
                        <div class="row items-center q-gutter-x-xs">
                            <span class="text-slate-500">MODE:</span>
                            <span 
                                class="cursor-pointer q-px-xs rounded-borders" 
                                :class="modeFilter === 'all' ? 'bg-cyan-9 text-white text-weight-bold' : 'text-slate-400'"
                                @click="modeFilter = 'all'"
                            >All</span>
                            <span 
                                class="cursor-pointer q-px-xs rounded-borders" 
                                :class="modeFilter === 'discuss' ? 'bg-blue-9 text-white text-weight-bold' : 'text-slate-400'"
                                @click="modeFilter = 'discuss'"
                            >Discuss</span>
                            <span 
                                class="cursor-pointer q-px-xs rounded-borders" 
                                :class="modeFilter === 'plan' ? 'bg-purple-9 text-white text-weight-bold' : 'text-slate-400'"
                                @click="modeFilter = 'plan'"
                            >Plan</span>
                            <span 
                                class="cursor-pointer q-px-xs rounded-borders" 
                                :class="modeFilter === 'build' ? 'bg-amber-9 text-black text-weight-bold' : 'text-slate-400'"
                                @click="modeFilter = 'build'"
                            >Build</span>
                        </div>

                        <div class="row items-center q-gutter-x-xs">
                            <span 
                                class="cursor-pointer q-px-xs rounded-borders" 
                                :class="timeRangeFilter === 'today' ? 'bg-slate-800 text-cyan-3 text-weight-bold' : 'text-slate-500'"
                                @click="timeRangeFilter = timeRangeFilter === 'today' ? 'all' : 'today'"
                            >Today</span>
                            <span 
                                class="cursor-pointer q-px-xs rounded-borders" 
                                :class="timeRangeFilter === '7d' ? 'bg-slate-800 text-cyan-3 text-weight-bold' : 'text-slate-500'"
                                @click="timeRangeFilter = timeRangeFilter === '7d' ? 'all' : '7d'"
                            >7d</span>

                            <!-- Show Archived Toggle -->
                            <span 
                                class="cursor-pointer q-px-xs rounded-borders"
                                :class="showArchived ? 'bg-rose-9 text-white text-weight-bold' : 'text-slate-500'"
                                @click="showArchived = !showArchived"
                            >
                                <q-icon name="archive" size="10px" class="q-mr-xs" />Archived
                            </span>
                        </div>
                    </div>
                </div>

                <!-- 2. ROOT SCOPE BREADCRUMB BAR (CONDITIONAL) -->
                <div v-if="hoistedRootNode || rootHistory.length > 0" class="row items-center justify-between q-px-sm q-py-xs bg-slate-900 text-caption" style="border-bottom: 1px solid #1e293b; flex: 0 0 auto;">
                    <div class="row items-center q-gutter-x-xs ellipsis col">
                        <q-btn flat round dense icon="arrow_back" size="xs" color="cyan-3" @click="popRootScope">
                            <q-tooltip>Up one level</q-tooltip>
                        </q-btn>
                        <span class="cursor-pointer text-cyan-4" @click="resetRootScope">Root</span>
                        <span class="text-slate-600">/</span>
                        <span 
                            v-for="(histNode, idx) in rootHistory" 
                            :key="histNode.nodeKey"
                            class="cursor-pointer ellipsis"
                            :class="idx === rootHistory.length - 1 ? 'text-amber-3 text-weight-bold' : 'text-slate-400'"
                            style="max-width: 120px;"
                            @click="jumpToRootHistory(idx)"
                        >
                            {{ histNode.label }}<span v-if="idx < rootHistory.length - 1" class="text-slate-600 q-ml-xs">/</span>
                        </span>
                    </div>
                    <q-btn flat round dense icon="close" size="xs" color="slate-400" @click="resetRootScope">
                        <q-tooltip>Reset to Full Component Tree</q-tooltip>
                    </q-btn>
                </div>

                <!-- 3. TREE VIEWPORT WITH NATIVE VIRTUAL SCROLL AREA -->
                <div class="col" style="flex: 1 1 0%; min-height: 0; height: 100%; position: relative; overflow: hidden;">
                    <q-scroll-area 
                        class="fit" 
                        :thumb-style="{ right: '2px', borderRadius: '4px', backgroundColor: '#0284c7', width: '5px', opacity: 0.75 }"
                        :bar-style="{ right: '0px', borderRadius: '4px', backgroundColor: '#0f172a', width: '5px', opacity: 0.2 }"
                    >
                        <div class="q-pa-xs">
                            <div v-if="loading" class="row justify-center q-my-md">
                                <q-spinner color="cyan-4" size="2em" />
                            </div>

                            <div v-else-if="error" class="text-negative text-caption q-pa-xs">
                                {{ error }}
                            </div>

                            <div v-else-if="!visibleNodes || visibleNodes.length === 0" class="text-slate-500 text-caption text-italic q-pa-sm text-center q-my-md">
                                No matches found.
                            </div>

                            <q-tree
                                v-else
                                ref="qTreeRef"
                                :nodes="visibleNodes"
                                node-key="nodeKey"
                                label-key="label"
                                default-expand-all
                                class="text-caption text-slate-200"
                            >
                                <template v-slot:default-header="prop">
                                    <div 
                                        class="row items-center full-width q-pa-xs rounded-borders cursor-pointer"
                                        :class="{
                                            'bg-cyan-10 text-cyan-2 text-weight-bold': selectedNodeId === prop.node.nodeKey,
                                            'text-strike text-slate-500': prop.node.isArchived
                                        }"
                                        :style="prop.node.isArchived ? 'opacity: 0.45;' : ''"
                                        @click="selectNode(prop.node)"
                                    >
                                        <q-icon 
                                            :name="getNodeIcon(prop.node)" 
                                            :color="getNodeColor(prop.node)" 
                                            size="15px"
                                            class="q-mr-xs" 
                                        />

                                        <div class="col-grow text-caption row items-center ellipsis">
                                            <span v-if="prop.node.messageId" class="text-caption font-mono text-cyan-4 q-mr-xs text-weight-medium" style="font-size: 10px;">
                                                #{{ prop.node.messageId }}
                                            </span>
                                            <span v-else-if="prop.node.discussionId" class="text-caption font-mono text-slate-400 q-mr-xs text-weight-medium" style="font-size: 10px;">
                                                D#{{ prop.node.discussionId }}
                                            </span>

                                            <span class="ellipsis" :class="{ 'text-purple-2 text-weight-bold': isPlanNode(prop.node) && !prop.node.isArchived }">
                                                {{ prop.node.label }}
                                            </span>
                                            
                                            <q-badge v-if="prop.node.stagedPayloadId" color="deep-purple-9" text-color="amber-3" class="q-ml-xs font-mono text-caption" style="font-size: 8px;">
                                                P#{{ prop.node.stagedPayloadId }}
                                            </q-badge>

                                            <q-badge v-if="prop.node.messageCount > 0" color="slate-800" text-color="cyan-3" class="q-ml-xs text-caption" style="font-size: 9px;">
                                                {{ prop.node.messageCount }}
                                            </q-badge>

                                            <q-badge v-if="prop.node.isArchived" color="rose-9" text-color="white" class="q-ml-xs text-caption text-weight-bold" style="font-size: 8px;">
                                                ARCHIVED
                                            </q-badge>
                                            
                                            <q-badge v-else-if="isPlanNode(prop.node)" color="deep-purple-9" text-color="white" class="q-ml-xs text-caption text-weight-bold" style="font-size: 8px;">
                                                PLAN
                                            </q-badge>
                                        </div>

                                        <div class="row items-center q-gutter-x-xs">
                                            <q-btn flat round dense icon="filter_center_focus" size="xs" color="cyan-3" @click.stop="hoistAsRoot(prop.node)">
                                                <q-tooltip>Hoist as Scope Root</q-tooltip>
                                            </q-btn>
                                            
                                            <q-btn v-if="!prop.node.isArchived" flat round dense icon="add" size="xs" color="amber-4" @click.stop="addSubTurn(prop.node)">
                                                <q-tooltip>Add Sub-Topic / Turn</q-tooltip>
                                            </q-btn>

                                            <q-btn 
                                                v-if="!prop.node.isArchived"
                                                flat round dense 
                                                icon="archive" 
                                                size="xs" 
                                                color="slate-500" 
                                                @click.stop="confirmArchiveBranch(prop.node)"
                                            >
                                                <q-tooltip>Archive Branch</q-tooltip>
                                            </q-btn>
                                            <q-btn 
                                                v-else
                                                flat round dense 
                                                icon="unarchive" 
                                                size="xs" 
                                                color="positive" 
                                                @click.stop="restoreBranch(prop.node)"
                                            >
                                                <q-tooltip>Restore Branch to Active</q-tooltip>
                                            </q-btn>
                                        </div>
                                    </div>
                                </template>
                            </q-tree>
                        </div>
                    </q-scroll-area>
                </div>

            </div>
        `
    };

    window.AiTurnTree = AiTurnTree;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AiComponents = window.AiComponents || {};
    window.AgiComponents['ai-turn-tree'] = AiTurnTree;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('ai-turn-tree', AiTurnTree);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();