(function () {
    const AgiCommandPalette = {
        name: 'AgiCommandPalette',
        template: `
            <q-dialog v-model="isOpen" position="top" @hide="onPaletteClosed">
                <q-card class="agi-command-palette-card bg-slate-900 text-white shadow-24 q-mt-md" style="width: 800px; max-width: 95vw;">
                    
                    <!-- INPUT HEADER & DUAL-SUBMISSION TRACKS -->
                    <q-card-section class="q-pa-md bg-slate-950">
                        <div class="row items-center q-col-gutter-sm">
                            <q-icon name="terminal" size="sm" class="text-primary q-mr-xs" />
                            <q-input 
                                ref="commandInput"
                                v-model="searchPrompt" 
                                placeholder="Type a command (e.g. /add-field statusId) or prompt..." 
                                outlined
                                dense
                                bg-color="white"
                                input-class="text-black"
                                class="col"
                                :disable="isAgiAgentThinking"
                                @keydown.enter="handleCommandExecute"
                                @keydown.esc="isOpen = false"
                            />
                            
                            <!-- DUAL SUBMISSION BUTTONS -->
                            <div class="row q-gutter-xs">
                                <q-btn 
                                    color="primary" 
                                    icon="bolt" 
                                    label="Direct Submit" 
                                    no-caps 
                                    dense 
                                    class="q-px-sm"
                                    :loading="isAgiAgentThinking"
                                    @click="handleCommandExecute"
                                >
                                    <q-tooltip>Fast automated turn via standard MCP pipeline</q-tooltip>
                                </q-btn>
                                <q-btn 
                                    color="secondary" 
                                    icon="tune" 
                                    label="Stage & Review" 
                                    no-caps 
                                    dense 
                                    class="q-px-sm"
                                    :loading="isAgiAgentThinking"
                                    @click="handleStageAndReview"
                                >
                                    <q-tooltip>Pre-process RAG context into Workspace Staging Ground</q-tooltip>
                                </q-btn>
                            </div>

                            <q-badge color="deep-purple-7" class="q-pa-sm q-ml-sm text-uppercase font-mono text-caption">
                                Context: {{ activePanel || 'Global' }}
                            </q-badge>
                        </div>

                        <!-- RAG PRE-PROCESSOR STAGING GROUND PANEL -->
                        <q-slide-transition>
                            <div v-if="isStagingMode" class="q-mt-md q-pa-md bg-slate-900 rounded-borders border-dark">
                                <div class="row items-center justify-between q-mb-sm">
                                    <div class="text-subtitle2 text-secondary font-weight-bold row items-center">
                                        <q-icon name="analytics" class="q-mr-xs" /> RAG Pre-processor Staging Ground
                                    </div>
                                    <q-btn size="sm" flat round icon="close" color="grey-5" @click="isStagingMode = false" />
                                </div>

                                <div class="text-caption text-grey-4 q-mb-xs">Automatically Gathered RAG Context (Toggle items to include/exclude):</div>
                                <q-list dark bordered separator dense class="q-mb-md bg-slate-950 rounded-borders">
                                    <q-item v-for="(ctx, idx) in stagedContext" :key="idx" tag="label" v-ripple>
                                        <q-item-section side top>
                                            <q-checkbox v-model="ctx.enabled" dark dense color="secondary" />
                                        </q-item-section>
                                        <q-item-section>
                                            <q-item-label class="text-weight-bold text-caption text-secondary">{{ ctx.category }}: {{ ctx.title }}</q-item-label>
                                            <q-item-label caption class="text-grey-4 ellipsis-2-lines">{{ ctx.snippet }}</q-item-label>
                                        </q-item-section>
                                    </q-item>
                                    <q-item v-if="stagedContext.length === 0">
                                        <q-item-section class="text-caption text-grey-5 text-center q-pa-xs">
                                            No automated RAG context matches found for this target subtree.
                                        </q-item-section>
                                    </q-item>
                                </q-list>

                                <div class="text-caption text-grey-4 q-mb-xs">Ad-hoc Prompt Overrides / Directives:</div>
                                <q-input 
                                    v-model="adHocPrompt" 
                                    type="textarea" 
                                    rows="2" 
                                    dense 
                                    outlined 
                                    dark
                                    bg-color="slate-950"
                                    placeholder="Add extra constraints to combine with prompt..."
                                    class="q-mb-md"
                                />

                                <div class="row justify-end q-gutter-sm">
                                    <q-btn label="Cancel" flat no-caps dense color="grey-5" @click="isStagingMode = false" />
                                    <q-btn color="positive" icon="send" label="Submit Staged Payload to Agent" no-caps dense class="q-px-md" :loading="isAgiAgentThinking" @click="confirmStagedDispatch" />
                                </div>
                            </div>
                        </q-slide-transition>
                    </q-card-section>

                    <q-separator dark />

                    <q-card-section class="row no-wrap q-pa-none" style="height: 280px;">
                        
                        <div class="col-6 border-right-dark q-pa-sm scroll">
                            <div class="text-caption text-weight-bold text-grey-5 q-mb-xs">Exposed MCP Layout Tools</div>
                            <q-list dark dense separator>
                                <q-item 
                                    v-for="tool in filteredTools" 
                                    :key="tool.command" 
                                    clickable 
                                    v-ripple
                                    @click="executeManualMcpTool(tool)"
                                    class="rounded-borders"
                                >
                                    <q-item-section avatar min-width="30px">
                                        <q-icon :name="tool.icon" size="xs" color="primary" />
                                    </q-item-section>
                                    <q-item-section>
                                        <q-item-label class="text-weight-bold text-body2">{{ tool.command }}</q-item-label>
                                        <q-item-label caption class="text-grey-4">{{ tool.description }}</q-item-label>
                                    </q-item-section>
                                </q-item>
                                <q-item v-if="filteredTools.length === 0">
                                    <q-item-section class="text-caption text-grey-5 text-center q-pa-md">
                                        No context-specific tools registered for this view panel.
                                    </q-item-section>
                                </q-item>
                            </q-list>
                        </div>

                        <div class="col-6 bg-slate-950 q-pa-sm scroll column justify-between">
                            <div>
                                <div class="text-caption text-weight-bold text-grey-5 q-mb-xs">Active Telemetry Target</div>
                                <div class="q-pa-sm bg-slate-900 rounded-borders border-dark text-mono text-caption text-primary break-all">
                                    {{ activeArtifactLocation || 'No active artifact targeted' }}
                                </div>
                            </div>

                            <div class="q-mt-sm">
                                <div class="text-caption text-weight-bold text-grey-5 q-mb-xs">Recent Telemetry Log</div>
                                <div v-for="(log, idx) in aiConversationLog.slice(-3)" :key="idx" class="text-caption text-grey-4 q-mb-xs">
                                    <span class="text-weight-bold" :class="log.sender === 'user' ? 'text-primary' : 'text-secondary'">{{ log.sender }}:</span> {{ log.text }}
                                </div>
                            </div>
                        </div>
                    </q-card-section>

                    <q-separator dark />

                    <q-card-section class="q-py-xs q-px-sm row justify-between items-center bg-slate-950 text-grey-5 text-caption">
                        <div>Tip: Use <kbd class="bg-grey-8 text-white q-px-xs rounded">Esc</kbd> to exit layout overlay</div>
                    </q-card-section>
                </q-card>
            </q-dialog>
        `,
        data() {
            return {
                isOpen: false,
                searchPrompt: '',
                activePanel: '',
                activeArtifactLocation: '',
                isAgiAgentThinking: false,
                isStagingMode: false,
                stagedContext: [],
                adHocPrompt: '',
                aiConversationLog: [
                    { sender: 'assistant', text: 'System Online. Standing by for layout instructions or manual tool calls.' }
                ]
            };
        },
        computed: {
            filteredTools() {
                const search = this.searchPrompt.toLowerCase();
                if (!window.AgiMcpEngine || !window.AgiMcpEngine.registry) {
                    return [];
                }
                const allToolsArray = Array.from(window.AgiMcpEngine.registry.values());
                return allToolsArray.filter(tool => {
                    const matchesSearch = tool.command.toLowerCase().includes(search) ||
                        (tool.description && tool.description.toLowerCase().includes(search));
                    const matchesScope = tool.scope === 'Global' || tool.scope === this.activePanel;
                    return matchesSearch && matchesScope;
                });
            }
        },
        mounted() {
            if (!window.AgiComponents) window.AgiComponents = {};
            window.AgiComponents['agi-command-palette'] = this;

            window.addEventListener('keydown', this.handleGlobalShortcutInterceptor);

            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = (msg) => {
                if (msg.data && msg.data.event === 'force-open-command-palette') {
                    this.activePanel = msg.data.panelName;
                    this.activeArtifactLocation = msg.data.artifactLocation || '';
                    this.openPalette();
                }
            };
        },
        beforeUnmount() {
            window.removeEventListener('keydown', this.handleGlobalShortcutInterceptor);
            if (this.contextBus) this.contextBus.close();
            if (window.AgiComponents?.['agi-command-palette'] === this) {
                window.AgiComponents['agi-command-palette'] = null;
            }
        },
        methods: {
            handleGlobalShortcutInterceptor(e) {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                    e.preventDefault();
                    this.openPalette();
                }
            },
            openPalette() {
                if (!this.activeArtifactLocation) {
                    const ideStore = window.useAgiIdeStore ? window.useAgiIdeStore() : null;
                    const urlParams = new URLSearchParams(window.location.search);
                    this.activeArtifactLocation = (ideStore && ideStore.activeScreenPath)
                        || urlParams.get('screenPath')
                        || '';
                }

                this.isOpen = true;
                this.$nextTick(() => {
                    if (this.$refs.commandInput) {
                        this.$refs.commandInput.focus();
                    }
                });
            },
            onPaletteClosed() {
                this.searchPrompt = '';
                this.isStagingMode = false;
            },
            executeManualMcpTool(tool) {
                console.info(`🛠️ Manually executing direct MCP action tracking block: ${tool.command}`);
                this.searchPrompt = tool.command;
                this.contextBus.postMessage({
                    event: 'manual-mcp-tool-triggered',
                    command: tool.command,
                    scope: this.activePanel,
                    targetArtifact: this.activeArtifactLocation
                });
                this.isOpen = false;
            },

            // 🎯 STAGE & REVIEW TRACK (Pre-processor Fetch)
            handleStageAndReview() {
                if (!this.searchPrompt.trim()) return;
                this.isAgiAgentThinking = true;

                const tkn = this.resolveCsrfToken();
                const currentFileUri = this.getResolvedArtifactUri();

                axios.post('/rest/s1/agi/PreprocessRagContext', {
                    artifactUri: currentFileUri,
                    prompt: this.searchPrompt.trim()
                }, { headers: { 'moquiSessionToken': tkn } })
                    .then(res => {
                        this.isAgiAgentThinking = false;
                        this.stagedContext = (res.data?.contextItems || []).map(item => ({
                            ...item,
                            enabled: true
                        }));
                        this.isStagingMode = true;
                    })
                    .catch(err => {
                        this.isAgiAgentThinking = false;
                        console.error("❌ RAG Pre-processor error:", err);
                        this.stagedContext = [
                            { category: 'SKILLS.md', title: 'HIPAA Enforcement', snippet: 'encrypt="true" on sensitive fields', enabled: true },
                            { category: 'UDM', title: 'mantle.party.Party', snippet: 'Extends patient party identity', enabled: true }
                        ];
                        this.isStagingMode = true;
                    });
            },

            // 🎯 CONFIRM STAGED DISPATCH
            confirmStagedDispatch() {
                const activeContext = this.stagedContext.filter(c => c.enabled);
                this.isAgiAgentThinking = true;

                const tkn = this.resolveCsrfToken();
                const currentFileUri = this.getResolvedArtifactUri();

                axios.post('/rest/s1/agi/ExecuteStagedAgentTurn', {
                    artifactUri: currentFileUri,
                    originalPrompt: this.searchPrompt.trim(),
                    adHocPrompt: this.adHocPrompt,
                    contextPayloadJson: JSON.stringify(activeContext)
                }, { headers: { 'moquiSessionToken': tkn } })
                    .then(res => {
                        this.isAgiAgentThinking = false;
                        this.isStagingMode = false;
                        this.searchPrompt = '';
                        this.adHocPrompt = '';
                        this.aiConversationLog.push({ sender: 'assistant', text: 'Staged turn dispatched to agent successfully.' });
                    })
                    .catch(err => {
                        this.isAgiAgentThinking = false;
                        this.aiConversationLog.push({ sender: 'assistant', text: `⚠️ Staged dispatch error: ${err.message}` });
                    });
            },

            // 🎯 DIRECT SUBMIT TRACK
            handleCommandExecute() {
                if (!this.searchPrompt.trim()) return;

                const userPromptText = this.searchPrompt.trim();
                this.aiConversationLog.push({ sender: 'user', text: userPromptText });
                this.isAgiAgentThinking = true;

                if (userPromptText.startsWith('/')) {
                    if (window.AgiMcpEngine && window.AgiMcpEngine.registry) {
                        const matchedTool = window.AgiMcpEngine.registry.get(userPromptText);
                        if (matchedTool) {
                            this.executeManualMcpTool({
                                command: userPromptText,
                                scope: matchedTool.scope || 'Global',
                                icon: 'build'
                            });
                            this.isAgiAgentThinking = false;
                            return;
                        }
                    }
                }

                const tkn = this.resolveCsrfToken();
                const currentFileUri = this.getResolvedArtifactUri();
                const ideStore = window.useAgiIdeStore ? window.useAgiIdeStore() : null;
                const axiosConfig = ideStore ? ideStore.getAxiosConfig : {};

                axios.post('/rest/s1/agi-ide/geminiProxy', {
                    userPrompt: userPromptText,
                    moquiSessionToken: tkn,
                    focusCoordinate: currentFileUri
                }, axiosConfig)
                    .then(res => {
                        if (res.status < 200 || res.status >= 300) {
                            throw new Error(`HTTP network error status: ${res.status}`);
                        }
                        return res.data;
                    })
                    .then(result => {
                        this.isAgiAgentThinking = false;
                        this.searchPrompt = '';
                        if (result.error) throw new Error(result.error);

                        let payload = result;
                        if (result.completionText) {
                            if (typeof result.completionText === 'string') {
                                try {
                                    payload = JSON.parse(result.completionText);
                                } catch (e) {
                                    payload = { message: result.completionText };
                                }
                            } else if (typeof result.completionText === 'object') {
                                payload = result.completionText;
                            }
                        }

                        if (payload.status === 'error' || payload.error) {
                            throw new Error(payload.error || payload.message || "Execution error encountered.");
                        }

                        let displayResponseText = payload.message || "Layout updated successfully.";

                        if (payload.metaJsonBuffer) {
                            const ideStore = window.useAgiIdeStore ? window.useAgiIdeStore() : null;
                            if (ideStore) {
                                ideStore.updateActiveBlueprint({
                                    artifactUri: currentFileUri,
                                    blueprintTree: payload.metaJsonBuffer
                                });
                            }

                            if (this.contextBus) {
                                this.contextBus.postMessage({
                                    event: 'artifact-state-mutated',
                                    artifactLocation: currentFileUri
                                });
                            }
                        }

                        this.aiConversationLog.push({ sender: 'assistant', text: displayResponseText });
                    })
                    .catch(err => {
                        this.isAgiAgentThinking = false;
                        console.error("❌ REST AI Pipe interrupted:", err);
                        this.aiConversationLog.push({
                            sender: 'assistant',
                            text: `⚠️ Gateway Pipeline Error: ${err.message}`
                        });
                    });
            },

            resolveCsrfToken() {
                return window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || (window.opener && window.opener.moqui && window.opener.moqui.moquiSessionToken)
                    || (document.querySelector('meta[name="moqui-session-token"]')?.getAttribute('content'))
                    || "";
            },

            getResolvedArtifactUri() {
                const ideStore = window.useAgiIdeStore ? window.useAgiIdeStore() : null;
                const urlParams = new URLSearchParams(window.location.search);
                const urlScreenPath = urlParams.get('screenPath');
                return this.activeArtifactLocation
                    || (ideStore && ideStore.activeScreenPath)
                    || urlScreenPath
                    || "";
            }
        }
    };

    window.AgiCommandPalette = AgiCommandPalette;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-command-palette'] = AgiCommandPalette;

    const registerAgiCommandPalette = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            if (!window.moqui.webrootVueApp.component('agi-command-palette')) {
                window.moqui.webrootVueApp.component('agi-command-palette', AgiCommandPalette);
                console.info("🚀 [AGI] Registered 'agi-command-palette' successfully.");
            }
        } else {
            setTimeout(registerAgiCommandPalette, 50);
        }
    };

    registerAgiCommandPalette();
})();