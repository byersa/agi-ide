(function () {
    const AgiStudio = {
        name: 'AgiStudio',
        props: {
            activeArtifact: { type: String, default: '' },
            targetComponentProp: { type: String, default: '' }
        },
        data() {
            return {
                targetComponent: this.targetComponentProp || '',
                activeArtifactLocation: this.activeArtifact || '',
                activeDiscussionId: '',
                activeDiscussionNode: null,
                splitRatio: 28,

                activeAssistMode: 'discuss',
                modeMemoryCache: {},

                // Viewport Dock State
                activePanel: null, // 'AgiCanvasEditor' | 'AgiScreenEditor' | 'AgiServiceEditor' | 'AgiEntityEditor' | null
                stagedXmlSource: '',
                stagedLayoutTree: null,

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
            <div class="column no-wrap bg-slate-950 text-white font-mono overflow-hidden" style="height: 78vh; max-height: 78vh; min-height: 400px; width: 100%; border-top: 1px solid #334155;">
                
                <!-- 1. STUDIO HEADER -->
                <div class="row items-center justify-between q-pa-xs bg-black" style="border-bottom: 1px solid #1e293b; min-height: 42px;">
                    <div class="row items-center q-gutter-x-sm">
                        <q-icon name="psychology" color="primary" size="sm" />
                        <span class="text-subtitle2 text-weight-bold text-cyan-3">AGI STUDIO</span>
                        
                        <q-badge v-if="targetComponent" color="deep-purple-8" text-color="white" :label="targetComponent" class="text-caption text-weight-bold" />

                        <q-separator vertical dark class="q-mx-xs" />

                        <!-- 4-MODE ASSIST SWITCHER -->
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
                                { label: 'Search', value: 'search', icon: 'search' },
                                { label: 'Discuss', value: 'discuss', icon: 'chat' },
                                { label: 'Plan', value: 'plan', icon: 'architecture' },
                                { label: 'Build', value: 'build', icon: 'handyman' }
                            ]"
                            @update:model-value="onModeChanged"
                        />

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

                    <!-- VIEWPORT TOGGLES -->
                    <div class="row items-center q-gutter-x-xs">
                        <span class="text-caption text-slate-500" style="font-size: 10px;">VIEWPORTS:</span>
                        <q-btn 
                            v-for="vp in viewports" 
                            :key="vp.name"
                            flat dense no-caps
                            :icon="vp.icon"
                            :label="vp.label"
                            :color="activePanel === vp.name ? 'white' : vp.color"
                            :class="activePanel === vp.name ? 'bg-slate-800 text-weight-bolder' : ''"
                            size="xs"
                            class="q-px-xs rounded-borders"
                            style="border: 1px solid rgba(255,255,255,0.1);"
                            @click="focusViewport(vp.name)"
                        >
                            <q-tooltip>{{ activePanel === vp.name ? 'Close' : 'Open' }} {{ vp.label }}</q-tooltip>
                        </q-btn>
                    </div>

                    <div class="row items-center">
                        <q-btn flat round dense icon="close" text-color="white" size="xs" @click="$emit('close')">
                            <q-tooltip>Close Studio</q-tooltip>
                        </q-btn>
                    </div>
                </div>

                <!-- 2. MAIN WORKSPACE (SPLIT: CONVERSATION ON LEFT, ACTIVE VIEWPORT ON RIGHT) -->
                <div class="row no-wrap overflow-hidden" style="flex: 1 1 0%; height: calc(100% - 42px); max-height: calc(100% - 42px); width: 100%; min-height: 0;">
                    
                    <!-- Left: Turn Tree (Strict Viewport Boundary) -->
                    <div class="column no-wrap overflow-hidden" 
                         :style="{ width: splitRatio + '%', flex: '0 0 ' + splitRatio + '%', maxWidth: splitRatio + '%', height: '100%', minHeight: '0', borderRight: '1px solid #334155' }">
                        <ai-turn-tree 
                            ref="treeRef"
                            :target-component="targetComponent"
                            :active-mode="activeAssistMode"
                            @discussion-selected="onDiscussionSelected"
                            @node-selected="onNodeSelected"
                            @mode-filter-selected="onChildModeUpdated"
                        />
                    </div>
                
                    <!-- Center: Turn Detail & Conversation -->
                    <div class="col column no-wrap overflow-hidden" 
                         :style="activePanel ? 'border-right: 1px solid #334155; height: 100%; min-height: 0;' : 'height: 100%; min-height: 0;'">
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
    
                    <!-- Right: Embedded Viewport Panel -->
                    <div v-if="activePanel" class="col column no-wrap overflow-hidden bg-slate-900" style="max-width: 50%; height: 100%; min-height: 0;">
                        <div class="row items-center justify-between q-pa-xs bg-slate-950" style="border-bottom: 1px solid #334155; height: 32px;">
                            <span class="text-caption text-weight-bold text-cyan-3 font-mono q-ml-xs">
                                {{ activePanel.replace('Agi', '').replace('Editor', '') }} Dock
                            </span>
                            <q-btn flat round dense icon="close" size="xs" color="slate-400" @click="activePanel = null" />
                        </div>
    
                        <div class="col overflow-hidden relative-position" style="height: calc(100% - 32px);">
                            <agi-canvas-editor 
                                v-if="activePanel === 'AgiCanvasEditor'"
                                :screen-path="activeArtifactLocation"
                                :layout-tree="stagedLayoutTree"
                            />
                            <agi-screen-editor 
                                v-else-if="activePanel === 'AgiScreenEditor'"
                                :screen-path="activeArtifactLocation"
                                :layout-tree="stagedLayoutTree"
                            />
                            <div v-else class="fit row flex-center text-slate-500 text-caption font-mono">
                                Editor for {{ activePanel }} active on {{ activeArtifactLocation }}
                            </div>
                        </div>
                    </div>
    
                </div>
            </div>
        `,
        methods: {
            onTurnCreated(payload) {
                if (payload?.createdNodes && payload.createdNodes.length > 0) {
                    if (this.$refs.treeRef && typeof this.$refs.treeRef.fetchTree === 'function') {
                        this.$refs.treeRef.fetchTree();
                    }
                    return;
                }
                if (this.$refs.treeRef && typeof this.$refs.treeRef.insertTurnNode === 'function') {
                    this.$refs.treeRef.insertTurnNode(payload);
                }
            },
            focusViewport(panelName) {
                this.activePanel = (this.activePanel === panelName) ? null : panelName;

                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'focus-editor-panel',
                        panelName: panelName
                    });
                }
            },
            onModeChanged(newMode) {
                this.activeAssistMode = newMode;
                if (this.activeDiscussionId) {
                    this.modeMemoryCache[this.activeDiscussionId] = newMode;
                }
                if (this.activeDiscussionNode) {
                    this.activeDiscussionNode.mode = newMode;
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

                    const label = (node.label || '').toLowerCase();
                    const isPlan = node.mode === 'plan'
                        || !!node.stagedPayloadId
                        || label.startsWith('📋 plan:')
                        || label.includes('formulate the formal implementation plan');

                    if (isPlan) {
                        this.activeAssistMode = 'plan';
                    } else if (node.mode === 'build') {
                        this.activeAssistMode = 'build';
                    } else if (this.modeMemoryCache[this.activeDiscussionId]) {
                        this.activeAssistMode = this.modeMemoryCache[this.activeDiscussionId];
                    } else {
                        this.activeAssistMode = node.mode || 'discuss';
                    }
                }
            },
            onDiscussionPromoted(weId) {
                if (this.activeDiscussionNode) {
                    this.activeDiscussionNode.promotedWorkEffortId = weId;
                }
                this.activeAssistMode = 'plan';
                if (this.activeDiscussionId) {
                    this.modeMemoryCache[this.activeDiscussionId] = 'plan';
                }
                if (this.$refs.treeRef && typeof this.$refs.treeRef.fetchTree === 'function') {
                    this.$refs.treeRef.fetchTree();
                }
            },
            async onTurnDispatched(turnPayload) {
                let targetUri = turnPayload?.targetArtifactUri || turnPayload?.createdArtifactUri;
                if (!targetUri) {
                    targetUri = this.activeArtifactLocation || (this.targetComponent ? `component://${this.targetComponent}/screen/${this.targetComponent}.xml` : '');
                }

                this.activeArtifactLocation = targetUri;

                if (turnPayload?.rawXmlContent) {
                    this.stagedXmlSource = turnPayload.rawXmlContent;

                    if (!this.activePanel) {
                        this.activePanel = 'AgiScreenEditor';
                    }

                    try {
                        const headers = {};
                        if (window.AGI_SERVER_CSRF_TOKEN) headers['X-CSRF-Token'] = window.AGI_SERVER_CSRF_TOKEN;
                        const resp = await axios.post('/rest/s1/agi-ide/parseXmlToTree', {
                            xmlText: this.stagedXmlSource,
                            artifactLocation: targetUri
                        }, { headers });
                        this.stagedLayoutTree = resp.data?.layoutTree || null;
                    } catch (e) {
                        console.warn("Could not parse XML to AST layout tree:", e);
                    }
                }

                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'artifact-state-mutated',
                        artifactUri: targetUri,
                        rawXmlText: turnPayload?.rawXmlContent || ''
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