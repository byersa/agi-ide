(function () {
    const AgiCommandPalette = {
        name: 'AgiCommandPalette',
        template: `
            <q-dialog v-model="isOpen" position="top" @hide="onPaletteClosed">
                <q-card class="agi-command-palette-card bg-slate-900 text-white shadow-24 q-mt-md" style="width: 700px; max-width: 90vw;">
                    
                    <q-card-section class="q-pa-md row items-center bg-slate-950">
                        <q-icon name="terminal" size="sm" class="text-primary q-mr-md" />
                        <q-input 
                            ref="commandInput"
                            v-model="searchPrompt" 
                            placeholder="Type a command (e.g., /add-field) or ask the AI assistant..." 
                            outlined
                            dense
                            bg-color="white"
                            input-class="text-black"
                            class="col"
                            @keydown.enter="handleCommandExecute"
                            @keydown.esc="isOpen = false"
                        />
                        <q-badge color="deep-purple-7" class="q-pa-sm q-ml-md text-uppercase font-mono text-caption">
                            Context: {{ activePanel || 'Global' }}
                        </q-badge>
                    </q-card-section>

                    <q-separator dark />

                    <q-card-section class="row no-wrap q-pa-none" style="height: 300px;">
                        
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
                                <div class="text-caption text-weight-bold text-grey-5 q-mb-xs">Recent Artifact History</div>
                                <div class="text-caption text-grey-6 italic"> Staged generations and session logs path mapping active.</div>
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
                this.isOpen = true;
                this.$nextTick(() => {
                    if (this.$refs.commandInput) {
                        this.$refs.commandInput.focus();
                    }
                });
            },
            onPaletteClosed() {
                this.searchPrompt = '';
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
            appendOrUpdateStreamingToken(chunkText) {
                let lastMessage = this.aiConversationLog[this.aiConversationLog.length - 1];
                if (lastMessage && lastMessage.sender === 'agent-stream') {
                    lastMessage.text += chunkText;
                } else {
                    this.aiConversationLog.push({ sender: 'agent-stream', text: chunkText });
                }
            },
            handleCommandExecute() {
                if (!this.searchPrompt.trim()) return;

                const userPromptText = this.searchPrompt.trim();
                this.aiConversationLog.push({ sender: 'user', text: userPromptText });
                this.searchPrompt = '';
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

                const tkn = window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || (window.opener && window.opener.moqui && window.opener.moqui.moquiSessionToken)
                    || (document.querySelector('meta[name="moqui-session-token"]')?.getAttribute('content'))
                    || "";
                console.info(`tkn : [${tkn}]`);
                console.info("🔒 [AgiCommandPalette] CSRF Token resolved via:",
                    window.AGI_SERVER_CSRF_TOKEN ? "Server Injection" : "Fallback Scraper");

                const ideStore = window.useAgiIdeStore ? window.useAgiIdeStore() : null;
                const axiosConfig = ideStore ? ideStore.getAxiosConfig : {};
                // Get the active screen context from component tracking, Pinia, or direct URL parameters
                const urlParams = new URLSearchParams(window.location.search);
                const urlScreenPath = urlParams.get('screenPath');

                const currentFileUri = this.artifactLocation
                    || (ideStore && ideStore.activeScreenPath)
                    || urlScreenPath
                    || "";

                console.info(`🎯 [AgiCommandPalette] Context coordinate resolved to: [${currentFileUri}]`);

                axios.post('/rest/s1/agi-ide/geminiProxy', {
                    userPrompt: userPromptText,
                    moquiSessionToken: tkn,
                    focusCoordinate: currentFileUri
                }, axiosConfig)
                    .then(res => {
                        // 🎯 AXIOS CORRECTION: Axios rejects non-2xx status codes automatically.
                        // The body data is mounted directly on res.data instead of needing res.json().
                        if (res.status < 200 || res.status >= 300) {
                            throw new Error(`HTTP network error status: ${res.status}`);
                        }
                        return res.data;
                    })
                    .then(result => {
                        this.isAgiAgentThinking = false;
                        if (result.error) throw new Error(result.error);

                        // 🎯 DEFENSIVE UNWRAP: Unpack completionText whether it's a string or parsed object
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

                        // 1. COMMIT TO SINGLE SOURCE OF TRUTH (STORE) FIRST
                        if (payload.metaJsonBuffer) {
                            const ideStore = window.useAgiIdeStore ? window.useAgiIdeStore() : null;
                            if (ideStore) {
                                ideStore.updateActiveBlueprint({
                                    artifactUri: this.activeArtifactLocation,
                                    blueprintTree: payload.metaJsonBuffer
                                });
                            }

                            // 2. EMIT LIGHTWEIGHT SIGNAL OVER CONTEXT BUS
                            if (this.contextBus) {
                                this.contextBus.postMessage({
                                    event: 'artifact-state-mutated',
                                    artifactLocation: this.activeArtifactLocation
                                });
                            }
                        }

                        // 3. Append assistant response to chat log
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