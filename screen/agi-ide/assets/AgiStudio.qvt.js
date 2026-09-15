(function () {
    const AgiStudio = {
        name: 'AgiStudio',
        props: {
            activeArtifact: { type: String, default: '' },
            targetComponentProp: { type: String, default: 'nursinghome' }
        },
        data() {
            return {
                targetComponent: this.targetComponentProp || 'nursinghome',
                activeArtifactLocation: this.activeArtifact || '',
                activeDiscussionId: '',
                activeDiscussionNode: null,
                splitRatio: 28, // 28% Tree, 72% Detail

                // Active Assist Mode: 'discuss' | 'plan' | 'build'
                activeAssistMode: 'discuss',
                // Mode memory cache keyed by discussionId: { [discussionId]: 'discuss' | 'plan' | 'build' }
                modeMemoryCache: {},

                // Quick Viewport Switchers for AgiWorkspace
                viewports: [
                    { name: 'AgiCanvasEditor', label: 'Canvas', icon: 'preview', color: 'cyan-4' },
                    { name: 'AgiScreenEditor', label: 'Screen XML', icon: 'code', color: 'amber-4' },
                    { name: 'AgiServiceEditor', label: 'Service', icon: 'miscellaneous_services', color: 'purple-3' },
                    { name: 'AgiEntityEditor', label: 'Entity', icon: 'storage', color: 'teal-4' }
                ]
            };
        },
        computed: {
            currentArtifactLabel() {
                if (!this.activeArtifactLocation) return 'No Artifact Anchor';
                const parts = this.activeArtifactLocation.split('/');
                return parts[parts.length - 1];
            },
            isPromoted() {
                return !!(this.activeDiscussionNode?.promotedWorkEffortId);
            }
        },
        mounted() {
            const vm = this;
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = (event) => {
                if (!event.data) return;
                if (event.data.event === 'open-screen-artifact' && event.data.artifactUri) {
                    vm.activeArtifactLocation = event.data.artifactUri;
                }
                if (event.data.targetComponent) {
                    vm.targetComponent = event.data.targetComponent;
                }
            };
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },
        template: `
            <div class="fit column no-wrap bg-slate-950 text-white font-mono overflow-hidden" style="border-top: 1px solid #334155;">
                
                <!-- 1. STUDIO HEADER -->
                <div class="row items-center justify-between q-pa-xs bg-black" style="border-bottom: 1px solid #1e293b; min-height: 42px;">
                    <!-- Left: Identity, App Anchor & Active Mode Toggle -->
                    <div class="row items-center q-gutter-x-sm">
                        <q-icon name="psychology" color="primary" size="sm" />
                        <span class="text-subtitle2 text-weight-bold text-cyan-3">AGI STUDIO</span>
                        
                        <q-badge color="deep-purple-8" text-color="white" :label="targetComponent" class="text-caption text-weight-bold" />

                        <q-separator vertical dark class="q-mx-xs" />

                        <!-- 🎯 INTERACTIVE ASSIST MODE SWITCHER -->
                        <q-btn-toggle
                            v-model="activeAssistMode"
                            dense rounded no-caps
                            toggle-color="primary"
                            color="slate-900"
                            text-color="slate-400"
                            size="xs"
                            class="text-weight-bold"
                            style="border: 1px solid #334155;"
                            :options="[
                                { label: 'Discuss', value: 'discuss', icon: 'chat' },
                                { label: 'Plan', value: 'plan', icon: 'architecture' },
                                { label: 'Build', value: 'build', icon: 'handyman' }
                            ]"
                            @update:model-value="onModeChanged"
                        />

                        <!-- Promoted Work Effort Tag -->
                        <q-badge 
                            v-if="isPromoted" 
                            color="positive" 
                            text-color="black" 
                            class="q-px-sm q-py-xs text-caption text-weight-bold"
                        >
                            <q-icon name="assignment_turned_in" size="14px" class="q-mr-xs" />
                            WE #{{ activeDiscussionNode.promotedWorkEffortId }}
                        </q-badge>

                        <div class="row items-center q-gutter-x-xs text-caption text-slate-400 q-ml-xs">
                            <q-icon name="code" size="xs" color="cyan-4" />
                            <span class="text-weight-bold text-slate-300">{{ currentArtifactLabel }}</span>
                        </div>
                    </div>

                    <!-- Center: Workspace Viewport Focus Buttons -->
                    <div class="row items-center q-gutter-x-xs">
                        <span class="text-caption text-slate-500" style="font-size: 10px;">FOCUS:</span>
                        <q-btn 
                            v-for="vp in viewports" 
                            :key="vp.name"
                            flat dense no-caps
                            :icon="vp.icon"
                            :label="vp.label"
                            :color="vp.color"
                            size="xs"
                            class="q-px-xs"
                            @click="focusViewport(vp.name)"
                        >
                            <q-tooltip>Bring {{ vp.label }} into focus</q-tooltip>
                        </q-btn>
                    </div>

                    <!-- Right: Dismiss Button -->
                    <div class="row items-center">
                        <q-btn flat round dense icon="close" text-color="white" size="xs" @click="$emit('close')">
                            <q-tooltip>Close Studio</q-tooltip>
                        </q-btn>
                    </div>
                </div>

                <!-- 2. SPLIT-PANE CONVERSATION WORKSPACE -->
                <div class="col row no-wrap overflow-hidden">
                <!-- Left: Discussion & Topic Tree -->
                    <div class="column overflow-hidden" :style="{ width: splitRatio + '%', borderRight: '1px solid #334155' }">
                        <ai-turn-tree 
                            ref="treeRef"
                            :target-component="targetComponent"
                            :target-artifact-uri="activeArtifactLocation"
                            @discussion-selected="onDiscussionSelected"
                            @node-selected="onNodeSelected"
                        />
                    </div>
                
                    <!-- Right: Conversational Stream & Action Console -->
                    <div class="col column overflow-hidden">
                        <ai-turn-detail 
                            :discussion-id-prop="activeDiscussionId"
                            :node="activeDiscussionNode"
                            :mode-prop="activeAssistMode"
                            @mode-updated="onChildModeUpdated"
                            @turn-created="onTurnCreated"
                            @turn-dispatched="onTurnDispatched"
                            @discussion-promoted="onDiscussionPromoted"
                        />
                    </div>
                </div>

            </div>
        `,
        methods: {
            onTurnCreated(payload) {
                if (this.$refs.treeRef && typeof this.$refs.treeRef.insertTurnNode === 'function') {
                    this.$refs.treeRef.insertTurnNode(payload);
                }
            },
            focusViewport(panelName) {
                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'focus-editor-panel',
                        panelName: panelName
                    });
                }
            },
            onModeChanged(newMode) {
                if (this.activeDiscussionId) {
                    // Remember this mode for the active discussion
                    this.modeMemoryCache[this.activeDiscussionId] = newMode;
                }
            },
            onChildModeUpdated(newMode) {
                this.activeAssistMode = newMode;
                if (this.activeDiscussionId) {
                    this.modeMemoryCache[this.activeDiscussionId] = newMode;
                }
            },
            onDiscussionSelected(node) {
                this.activeDiscussionId = node.discussionId || node.id;
                this.activeDiscussionNode = node;

                // Restore remembered mode for this discussion, defaulting to 'discuss'
                if (this.activeDiscussionId && this.modeMemoryCache[this.activeDiscussionId]) {
                    this.activeAssistMode = this.modeMemoryCache[this.activeDiscussionId];
                } else {
                    this.activeAssistMode = 'discuss';
                }

                if (node.targetArtifactUri) {
                    this.activeArtifactLocation = node.targetArtifactUri;
                    if (this.contextBus) {
                        this.contextBus.postMessage({
                            event: 'open-screen-artifact',
                            artifactUri: node.targetArtifactUri
                        });
                    }
                }
            },
            onNodeSelected(node) {
                this.activeDiscussionNode = node;
                if (node.discussionId) {
                    this.activeDiscussionId = node.discussionId;
                    if (this.modeMemoryCache[this.activeDiscussionId]) {
                        this.activeAssistMode = this.modeMemoryCache[this.activeDiscussionId];
                    }
                }
            },
            onDiscussionPromoted(weId) {
                if (this.activeDiscussionNode) {
                    this.activeDiscussionNode.promotedWorkEffortId = weId;
                }
                // When promoted to a physical task, naturally advance the mode to 'plan' or 'build'
                this.activeAssistMode = 'plan';
                if (this.activeDiscussionId) {
                    this.modeMemoryCache[this.activeDiscussionId] = 'plan';
                }
            },
            onTurnDispatched(turnPayload) {
                if (turnPayload?.targetArtifactUri && this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'artifact-state-mutated',
                        artifactUri: turnPayload.targetArtifactUri,
                        rawXmlText: turnPayload.rawXmlContent || ''
                    });
                }
            }
        }
    };

    window.AgiStudio = AgiStudio;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-studio'] = AgiStudio;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('agi-studio', AgiStudio);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();