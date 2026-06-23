(function () {
    const AgiCommandPalette = {
        name: 'AgiCommandPalette',
        template: `
            <q-dialog v-model="isOpen" position="top" @hide="onPaletteClosed">
                <q-card class="agi-command-palette-card bg-slate-900 text-white shadow-24 q-mt-md" style="width: 700px; max-width: 90vw;">
                    
                    <q-card-section class="q-pa-sm row items-center">
                        <q-icon name="terminal" size="sm" class="text-primary q-mr-sm" />
                        <q-input 
                            ref="commandInput"
                            v-model="searchPrompt" 
                            placeholder="Type a command (e.g., /add-field) or ask the AI assistant..." 
                            dark 
                            borderless 
                            dense
                            class="col"
                            @keydown.enter="handleCommandExecute"
                            @keydown.esc="isOpen = false"
                        />
                        <q-badge color="deep-purple-7" class="q-pa-xs text-uppercase font-mono text-caption">
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
                        <div class="text-weight-medium">Automation Groups International © 2026</div>
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

                // NEW: Stateful tracking variables for the streaming AI conversation
                wsConnection: null,
                isAgiAgentThinking: false,
                aiConversationLog: [
                    { sender: 'assistant', text: 'System Online. Standing by for layout instructions or manual tool calls.' }
                ]
            };
        },
        computed: {
            filteredTools() {
                const search = this.searchPrompt.toLowerCase();

                // Safety guard: If the orchestrator registry isn't hydrated yet, return an empty array safely
                if (!window.AgiMcpEngine || !window.AgiMcpEngine.registry) {
                    return [];
                }

                // Convert the Map's values into a real array so we can use standard array .filter()
                const allToolsArray = Array.from(window.AgiMcpEngine.registry.values());

                return allToolsArray.filter(tool => {
                    const matchesSearch = tool.command.toLowerCase().includes(search) ||
                        (tool.description && tool.description.toLowerCase().includes(search));
                    const matchesScope = tool.scope === 'Global' || tool.scope === this.activePanel;
                    return matchesSearch && matchesScope;
                });
            }
        },
        // Inside your AgiCommandPalette.qvt.js definition map:
        mounted() {
            // FIX: Overwrite the global entry with the true reactive Vue instance scope
            if (!window.AgiComponents) window.AgiComponents = {};
            window.AgiComponents['agi-command-palette'] = this;

            // Hook into global keydown shortcut triggers (Ctrl + K)
            window.addEventListener('keydown', this.handleGlobalShortcutInterceptor);

            // Initialize BroadcastChannel listener to capture focus updates pushed by sibling panel click handles
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = (msg) => {
                if (msg.data && msg.data.event === 'workspace-panel-focused') {
                    this.activePanel = msg.data.panelName;
                    this.activeArtifactLocation = msg.data.artifactLocation || '';
                    console.info(`⚡ AgiCommandPalette synchronized context frame target to: [${this.activePanel}]`);

                    // Context changed! Re-sync our WebSocket channel loop to the focused panel coordinate
                    this.initializeAgiWebSocketSession();
                }
                if (msg.data && msg.data.event === 'force-open-command-palette') {
                    this.activePanel = msg.data.panelName;
                    this.activeArtifactLocation = msg.data.artifactLocation || '';
                    this.openPalette();
                }
            };

            // Trigger the initial channel connection sequence on startup pass
            this.initializeAgiWebSocketSession();
        },
        beforeUnmount() {
            window.removeEventListener('keydown', this.handleGlobalShortcutInterceptor);
            if (this.contextBus) this.contextBus.close();

            // Clean up our global context marker cleanly when the workspace panel layout tears down
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

                // Fire manual execution event out across the common runtime loop bus
                this.contextBus.postMessage({
                    event: 'manual-mcp-tool-triggered',
                    command: tool.command,
                    scope: this.activePanel,
                    targetArtifact: this.activeArtifactLocation
                });

                this.isOpen = false; // Collapse overlay following tool execution trigger action pass
            },

            appendOrUpdateStreamingToken(chunkText) {
                let lastMessage = this.aiConversationLog[this.aiConversationLog.length - 1];
                if (lastMessage && lastMessage.sender === 'agent-stream') {
                    lastMessage.text += chunkText;
                } else {
                    this.aiConversationLog.push({ sender: 'agent-stream', text: chunkText });
                }
            },
            initializeAgiWebSocketSession() {
                if (this.wsConnection) {
                    if (this.wsConnection.readyState === WebSocket.OPEN || this.wsConnection.readyState === WebSocket.CONNECTING) {
                        this.wsConnection.close();
                    }
                }
                // Open a persistent socket channel targeting the current active panel context 
                const currentChannel = this.activePanel || 'global_canvas';
                const socketUrl = `ws://${window.location.host}/agi-ws/${currentChannel}?token=816554a337e2d73431bd2903642f993b`;

                console.info("🔌 Opening communication line to server-side ADK core...", socketUrl);
                this.wsConnection = new WebSocket(socketUrl);

                this.wsConnection.onmessage = (event) => {
                    try {
                        const payload = JSON.parse(event.data);

                        // 🎯 NEW INTERCEPTOR BRANCH: Catch our dynamic tool mutations
                        if (payload.event === 'artifact-state-mutated') {
                            console.info("📡 [WIRE] Forwarding server layout mutation to workspace bus...");
                            if (this.contextBus) {
                                this.contextBus.postMessage({
                                    event: 'artifact-state-mutated',
                                    mutatedTree: payload.mutatedTree
                                });
                            }
                            return;
                        }

                        if (payload.type === 'blueprint-updated') {
                            console.info("🔄 [SYNC] Server broadcasted an active Meta-JSON blueprint modification:", payload.artifactPath);

                            // Check if the canvas editor is mounted and update its reactive tree data reference
                            const canvasEditor = window.AgiComponents?.['agi-canvas-editor'];
                            if (canvasEditor && canvasEditor.blueprintTree) {
                                // Re-hydrate the reactive canvas array; Vue 3 will automatically trigger a UI redraw pass
                                canvasEditor.blueprintTree[0] = typeof payload.newData === 'string'
                                    ? JSON.parse(payload.newData)
                                    : payload.newData;

                                console.info("🎨 [RENDER] Canvas Editor synchronized and forced a reactive redraw stream.");
                            }
                            return;
                        }

                        // Track 1: Incrementally append text tokens as they stream back from the ADK agent 
                        if (payload.type === 'textToken') {
                            this.isAgiAgentThinking = true;
                            this.appendOrUpdateStreamingToken(payload.text);
                        }

                        // Track 2: Catch the finished tool action command dispatched by the endpoint 
                        if (payload.type === 'command') {
                            this.isAgiAgentThinking = false;
                            console.info("🎯 ADK Agent returned structural tool command payload:", payload.data);

                            // Route the action through our local client orchestrator registry
                            window.AgiMcpEngine.executeTool(
                                payload.data.command,
                                window.AgiComponents['agi-canvas-editor'].blueprintTree[0],
                                this.activeArtifactLocation
                            );

                            this.aiConversationLog.push({
                                sender: 'assistant',
                                text: `Successfully executed layout modification: **${payload.data.command}**.`
                            });
                        }

                        // Track 3: Gracefully handle processing errors 
                        if (payload.type === 'error') {
                            this.isAgiAgentThinking = false;
                            this.aiConversationLog.push({ sender: 'assistant', text: `⚠️ ADK Error: ${payload.message}` });
                        }
                    } catch (err) {
                        console.warn("Failed parsing streaming wire token payload:", err);
                    }
                };
            },

            // Inside AgiCommandPalette.qvt.js -> methods:
            handleCommandExecute() {
                if (!this.searchPrompt.trim()) return;

                const userPromptText = this.searchPrompt.trim();
                this.aiConversationLog.push({ sender: 'user', text: userPromptText });
                this.searchPrompt = '';
                this.isAgiAgentThinking = true;

                // Handle local slash commands instantly by reading directly from our live global engine registry
                if (userPromptText.startsWith('/')) {
                    if (window.AgiMcpEngine && window.AgiMcpEngine.registry) {
                        const matchedTool = window.AgiMcpEngine.registry.get(userPromptText);
                        if (matchedTool) {
                            // Adapt standard tool format for our manual trigger execution map
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

                // Quick temporary alternative inside AgiCommandPalette.qvt.js -> handleCommandExecute()
                // Swap out the this.wsConnection.send() block with a clean, flat HTTP POST:

                // Inside AgiCommandPalette.qvt.js -> handleCommandExecute()
                // Look for your temporary fetch fallback block and update the options mapping:
                const tkn = window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || (window.opener && window.opener.moqui && window.opener.moqui.moquiSessionToken)
                    || (document.querySelector('meta[name="moqui-session-token"]')?.getAttribute('content'))
                    || "";

                console.info("🔒 [AgiCommandPalette] CSRF Token resolved via:",
                    window.AGI_SERVER_CSRF_TOKEN ? "Server Injection" : "Fallback Scraper");

                fetch('/rest/s1/agi-ide/geminiProxy', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-Token': tkn
                    },
                    body: JSON.stringify({
                        // 🎯 NEW: Ship the session token as the multi-turn memory anchor
                        moquiSessionToken: window.moqui?.moquiSessionToken || tkn,
                        userPrompt: userPromptText,
                        activeTree: window.AgiComponents['agi-canvas-editor']?.blueprintTree?.[0] || {},
                        focusCoordinate: this.activeArtifactLocation || ''
                    })
                })
                    .then(res => {
                        if (!res.ok) {
                            throw new Error(`HTTP network error status: ${res.status}`);
                        }
                        return res.json();
                    })
                    .then(result => {
                        this.isAgiAgentThinking = false;
                        if (result.error) throw new Error(result.error);

                        let actionCommand = null;
                        let displayResponseText = "";
                        const rawText = (result.completionText || "").trim();

                        // 🎯 SAFELY DETECT OR PROBE PAYLOAD STRUCTURE
                        if (rawText.startsWith("{") || rawText.startsWith("[")) {
                            try {
                                actionCommand = JSON.parse(rawText);
                            } catch (e) {
                                console.warn("Failed parsing text that looked like JSON, treating as text explanation.");
                                displayResponseText = rawText;
                            }
                        } else {
                            displayResponseText = rawText;
                        }

                        // If it's a legacy JSON command string, pipe it into the client canvas executor
                        if (actionCommand && actionCommand.command) {
                            const canvasEditor = window.AgiComponents?.['agi-canvas-editor'];
                            const layoutBlueprintTree = canvasEditor?.blueprintTree?.[0] || {};

                            window.AgiMcpEngine.executeTool(
                                actionCommand.command,
                                layoutBlueprintTree,
                                this.activeArtifactLocation
                            );

                            displayResponseText = `Successfully executed layout modification: **${actionCommand.command}**.`;
                        }

                        // Push the actual message (either Gemini's narrative or our success token) to the UI logs
                        this.aiConversationLog.push({
                            sender: 'assistant',
                            text: displayResponseText || "Server operation completed successfully."
                        });
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
})();