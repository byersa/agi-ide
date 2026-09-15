(function () {
    const AiTurnTree = {
        name: 'AiTurnTree',
        template: `
            <div class="discussion-tree-root fit q-pa-sm bg-slate-950 text-white font-mono">
                <!-- Global Tree Toolbar -->
                <div class="row items-center justify-between q-mb-xs q-px-xs">
                    <div class="text-caption text-weight-bold text-cyan-3 row items-center">
                        <q-icon name="hub" class="q-mr-xs" color="cyan-4" />
                        TOPICS &amp; DISCUSSIONS
                    </div>
                    <div class="row q-gutter-xs">
                        <q-btn size="xs" flat round icon="add" color="amber-4" @click="createRootDiscussion">
                            <q-tooltip>New Topic / Discussion</q-tooltip>
                        </q-btn>
                        <q-btn size="xs" flat round icon="unfold_more" color="slate-400" @click="expandAllNodes">
                            <q-tooltip>Expand All</q-tooltip>
                        </q-btn>
                        <q-btn size="xs" flat round icon="unfold_less" color="slate-400" @click="collapseAllNodes">
                            <q-tooltip>Collapse All</q-tooltip>
                        </q-btn>
                        <q-btn size="xs" flat round icon="refresh" color="cyan-4" @click="fetchTree">
                            <q-tooltip>Refresh Tree</q-tooltip>
                        </q-btn>
                    </div>
                </div>

                <q-separator class="q-mb-sm bg-slate-800" />

                <!-- Loading State -->
                <div v-if="loading" class="row justify-center q-my-md">
                    <q-spinner color="cyan-4" size="2em" />
                </div>

                <!-- Error State -->
                <div v-else-if="error" class="text-negative text-caption q-pa-xs">
                    {{ error }}
                </div>

                <!-- Empty State -->
                <div v-else-if="!treeNodes || treeNodes.length === 0" class="text-slate-500 text-caption text-italic q-pa-sm">
                    No active discussions. Click (+) to start a topic.
                </div>

                <!-- Main Recursive Tree -->
                <q-tree
                    v-else
                    ref="qTreeRef"
                    :nodes="treeNodes"
                    node-key="nodeKey"
                    label-key="label"
                    default-expand-all
                    class="text-caption text-slate-200"
                >
                    <template v-slot:default-header="prop">
                        <div 
                            class="row items-center full-width q-pa-xs rounded-borders cursor-pointer"
                            :class="{ 'bg-cyan-10 text-cyan-2 text-weight-bold': selectedNodeId === prop.node.nodeKey }"
                            @click="selectNode(prop.node)"
                        >
                            <q-icon 
                                :name="prop.node.discussionId && !prop.node.messageId ? 'forum' : 'chat_bubble_outline'" 
                                :color="prop.node.discussionId && !prop.node.messageId ? 'cyan-4' : 'amber-4'" 
                                size="16px"
                                class="q-mr-xs" 
                            />

                            <div class="col-grow text-caption row items-center">
                                <span>{{ prop.node.label }}</span>
                                <q-badge v-if="prop.node.messageCount > 0" color="slate-800" text-color="cyan-3" class="q-ml-xs text-caption" style="font-size: 9px;">
                                    {{ prop.node.messageCount }}
                                </q-badge>
                                <q-badge v-if="prop.node.promotedWorkEffortId" color="positive" text-color="black" class="q-ml-xs text-caption" style="font-size: 9px;">
                                    WE #{{ prop.node.promotedWorkEffortId }}
                                </q-badge>
                            </div>

                            <div class="row items-center q-gutter-x-xs">
                                <q-btn flat round dense icon="add" size="xs" color="amber-4" @click.stop="addSubTurn(prop.node)">
                                    <q-tooltip>Add Sub-Topic / Message</q-tooltip>
                                </q-btn>
                            </div>
                        </div>
                    </template>
                </q-tree>
            </div>
        `,

        props: {
            targetComponent: { type: String, default: 'nursinghome' },
            targetArtifactUri: { type: String, default: '' }
        },
        emits: ['node-selected', 'discussion-selected'],
        data() {
            return {
                treeNodes: [],
                loading: false,
                error: null,
                selectedNodeId: ''
            };
        },
        mounted() {
            this.fetchTree();
        },
        watch: {
            targetComponent() { this.fetchTree(); },
            targetArtifactUri() { this.fetchTree(); }
        },
        methods: {
            resolveCsrf() {
                return window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || "";
            },

            async fetchTree() {
                this.loading = true;
                this.error = null;
                const vm = this;

                try {
                    const response = await axios.get('/rest/s1/agi-ai/discussions', {
                        params: {
                            targetComponent: vm.targetComponent || 'nursinghome',
                            targetArtifactUri: vm.targetArtifactUri || null
                        },
                        headers: { 'moquiSessionToken': this.resolveCsrf() }
                    });

                    vm.loading = false;
                    vm.treeNodes = response.data?.treeNodes || [];
                    vm.$nextTick(() => {
                        if (vm.$refs.qTreeRef) vm.$refs.qTreeRef.expandAll();
                    });
                } catch (err) {
                    vm.loading = false;
                    vm.error = "Failed to load discussions: " + (err.response?.data?.errors || err.message);
                }
            },

            selectNode(node) {
                this.selectedNodeId = node.nodeKey;
                this.$emit('node-selected', node);
                if (node.discussionId) {
                    this.$emit('discussion-selected', node);
                }
            },

            createRootDiscussion() {
                const vm = this;
                this.$q.dialog({
                    title: 'New Discussion Topic',
                    message: 'Enter topic name (e.g. Clinical Ingestion, Rainwater GIS Specs):',
                    prompt: { model: '', type: 'text' },
                    cancel: true,
                    persistent: true
                }).onOk(async (topicName) => {
                    if (!topicName.trim()) return;
                    vm.loading = true;
                    try {
                        await axios.post('/rest/s1/agi-ai/discussions', {
                            name: topicName.trim(),
                            targetComponent: vm.targetComponent,
                            targetArtifactUri: vm.targetArtifactUri,
                            facets: { domain: vm.targetComponent }
                        }, { headers: { 'moquiSessionToken': vm.resolveCsrf() } });

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
                        // 1. Record User Message
                        const recResp = await axios.post('/rest/s1/agi-ai/discussions/message', {
                            discussionId: discId,
                            parentMessageId: parentMsgId,
                            senderRoleEnumId: 'AsrUser',
                            content: text.trim()
                        }, { headers: { 'moquiSessionToken': vm.resolveCsrf() } });

                        const userMsgId = recResp.data?.messageId;

                        // 2. Explicitly Dispatch Agent Inference Turn
                        await axios.post('/rest/s1/agi-ai/discussions/dispatch', {
                            discussionId: discId,
                            parentMessageId: userMsgId,
                            userPrompt: text.trim(),
                            mode: 'discuss'
                        }, { headers: { 'moquiSessionToken': vm.resolveCsrf() } });

                        vm.loading = false;
                        await vm.fetchTree();

                        // Automatically select newly created turn node
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
        }
    };

    window.AiTurnTree = AiTurnTree;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['ai-turn-tree'] = AiTurnTree;

    const registerDiscussionTree = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('ai-turn-tree', AiTurnTree);
        } else {
            setTimeout(registerDiscussionTree, 50);
        }
    };
    registerDiscussionTree();
})();