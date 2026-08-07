(function () {
    const AgiPromptEditor = {
        name: 'AgiPromptEditor',
        template: `
            <q-dialog v-model="isOpen" position="top" @hide="onDialogClosed">
                <q-card class="agi-prompt-editor-card bg-slate-900 text-white shadow-24 q-mt-sm" style="width: 1000px; max-width: 95vw;">
                    
                    <!-- Top Navigation Bar: Target Component & Tab Mode Selection -->
                    <q-card-section class="q-pa-sm bg-slate-950 row items-center justify-between border-bottom-dark">
                        <div class="row items-center q-gutter-x-sm">
                            <q-icon name="psychology" color="primary" size="sm" />
                            <div>
                                <span class="text-subtitle2 text-weight-bold">AGI HARNESS COMMAND CENTER</span>
                                <q-badge color="deep-purple-8" class="q-ml-sm font-mono text-caption">
                                    TARGET: {{ targetComponent || 'nursinghome' }}
                                </q-badge>
                            </div>
                        </div>

                        <!-- Mode Switcher Tabs -->
                        <q-tabs v-model="activeTab" dense active-color="primary" indicator-color="primary" class="text-grey-4">
                            <q-tab name="prompt" icon="terminal" label="Prompt & Commands" no-caps />
                            <q-tab name="blueprint" icon="account_tree" label="Blueprint Intent" no-caps />
                            <q-tab name="context" icon="analytics" label="Active RAG Payload" no-caps />
                            <q-tab name="history" icon="history" label="Prompt History" no-caps />
                        </q-tabs>

                        <q-btn flat round dense icon="close" text-color="white" v-close-popup />
                    </q-card-section>

                    <!-- TAB 1: PROMPT, SLASH COMMANDS & DYNAMIC MCP TOOLS -->
                    <q-card-section v-if="activeTab === 'prompt'" class="q-pa-md bg-slate-900">
                        <div class="q-gutter-y-sm">
                            
                            <!-- Prompt Input Field -->
                            <q-input 
                                ref="promptInput"
                                v-model="userPrompt" 
                                placeholder="Type a message or '/' for MCP commands..." 
                                outlined 
                                dense 
                                bg-color="white"
                                input-class="text-black font-mono"
                                :disable="isExecuting"
                                @update:model-value="onPromptInput"
                                @keydown.enter="handleExecute"
                            >
                                <template v-slot:append>
                                    <q-btn flat round icon="send" color="primary" @click="handleExecute" :loading="isExecuting" />
                                </template>
                            </q-input>

                            <!-- Selected Tool Parameter Form (Dynamically built from MCP Schema) -->
                            <q-slide-transition>
                                <div v-if="selectedCommand" class="q-pa-sm bg-slate-950 rounded-borders border-dark row items-center q-gutter-x-sm">
                                    <q-chip color="primary" text-color="white" dense size="sm" icon="build" removable @remove="clearSelectedCommand">
                                        {{ selectedCommand.command }}
                                    </q-chip>
                                    <span class="text-caption text-grey-4 ellipsis" style="max-width: 260px;">{{ selectedCommand.description }}</span>
                                    
                                    <div v-for="param in visibleParams" :key="param.name" class="col-auto">
                                        <q-input 
                                            v-model="commandParamValues[param.name]" 
                                            :label="param.name" 
                                            dense 
                                            outlined 
                                            class="text-caption font-mono" 
                                            style="min-width: 150px;"
                                        />
                                    </div>
                                </div>
                            </q-slide-transition>

                            <!-- Dynamic Slash Command Auto-complete Dropdown -->
                            <div 
                                v-if="showCommandList && availableCommands.length > 0" 
                                class="rounded-borders border-dark q-pa-xs max-h-48 overflow-y-auto shadow-8"
                                style="background-color: #020617; border: 1px solid #334155;"
                            >
                                <div class="row items-center justify-between q-px-xs q-mb-xs">
                                    <div class="text-caption text-weight-bold text-cyan-4 font-mono">DISCOVERED MCP TOOLS</div>
                                    <q-btn flat dense icon="refresh" size="xs" color="cyan-4" @click="fetchDynamicTools">
                                        <q-tooltip>Reload MCP Tools from Server</q-tooltip>
                                    </q-btn>
                                </div>
                                <q-list dark dense separator style="background-color: transparent;">
                                    <q-item 
                                        v-for="cmd in availableCommands" 
                                        :key="cmd.command" 
                                        clickable 
                                        v-ripple 
                                        @click="selectCommand(cmd)"
                                        class="rounded-borders bg-slate-900 q-my-xs text-white"
                                        style="background-color: #0f172a; border: 1px solid #1e293b;"
                                    >
                                        <q-item-section avatar min-width="24px">
                                            <q-icon name="bolt" color="cyan-4" size="xs" />
                                        </q-item-section>
                                        <q-item-section>
                                            <q-item-label class="font-mono text-caption text-weight-bolder text-cyan-4">
                                                {{ cmd.command }}
                                            </q-item-label>
                                            <q-item-label caption class="text-slate-300 text-caption ellipsis" style="color: #cbd5e1 !important;">
                                                {{ cmd.description }}
                                            </q-item-label>
                                        </q-item-section>
                                    </q-item>
                                </q-list>
                            </div>

                        </div>
                    </q-card-section>

                    <!-- TAB 2: BLUEPRINT INTENT HIERARCHY -->
                    <q-card-section v-else-if="activeTab === 'blueprint'" class="q-pa-md bg-slate-900" style="height: 380px; overflow-y: auto;">
                        <discussion-tree 
                            v-if="targetArtifactId || activeArtifactLocation"
                            :key="blueprintTreeKey"
                            :agi-artifact-id="targetArtifactId"
                            :source-reference-id="activeArtifactLocation">
                            <template v-slot:node-detail="{ node }">
                                <discussion-detail :node="node">
                                    <agi-intent-detail 
                                        :node="node" 
                                        :selected-artifact="{ agiArtifactId: targetArtifactId, artifactPath: activeArtifactLocation }"
                                    />
                                </discussion-detail>
                            </template>
                        </discussion-tree>
                        <div v-else class="text-center text-grey-5 q-pa-lg text-italic">
                            No active domain artifact selected. Load a screen in {{ targetComponent }} to view intent tree.
                        </div>
                    </q-card-section>

                    <!-- TAB 3: RAG PAYLOAD INSPECTOR -->
                    <q-card-section v-else-if="activeTab === 'context'" class="q-pa-md bg-slate-900" style="height: 380px; overflow-y: auto;">
                        <div class="row items-center justify-between q-mb-xs">
                            <div class="text-caption text-weight-bold text-grey-4">ACTIVE SCREEN AST & RAG CONTEXT</div>
                            <q-btn flat dense icon="refresh" size="xs" color="primary" @click="fetchActiveRagContext(activeArtifactLocation)">
                                <q-tooltip>Reload Context Payload</q-tooltip>
                            </q-btn>
                        </div>
                        <div class="q-pa-sm bg-slate-950 rounded-borders font-mono text-caption text-grey-3 break-all" style="white-space: pre-wrap;">
{{ activeRagContextJson || 'No context loaded for active artifact.' }}
                        </div>
                    </q-card-section>

                    <!-- TAB 4: PROMPT HISTORY -->
                    <q-card-section v-else-if="activeTab === 'history'" class="q-pa-md bg-slate-900" style="height: 380px; overflow-y: auto;">
                        <q-list dark separator dense v-if="promptHistory.length > 0">
                            <q-item v-for="(hist, idx) in promptHistory" :key="idx">
                                <q-item-section>
                                    <q-item-label class="font-mono text-caption text-primary">
                                        {{ hist.timestamp }} - <q-badge color="cyan-9" class="q-ml-xs">{{ hist.command || 'Prompt' }}</q-badge>
                                    </q-item-label>
                                    <q-item-label caption class="text-grey-3 font-mono q-mt-xs">{{ hist.text }}</q-item-label>
                                    <q-item-label v-if="hist.resultUri" caption class="text-cyan-4 font-mono text-caption ellipsis">
                                        👉 Created/Updated: {{ hist.resultUri }}
                                    </q-item-label>
                                </q-item-section>
                            </q-item>
                        </q-list>
                        <div v-else class="text-center text-grey-5 q-pa-lg text-italic">
                            No execution history in this session yet.
                        </div>
                    </q-card-section>

                    <!-- FOOTER STATUS -->
                    <q-card-section class="q-py-xs q-px-sm bg-slate-950 text-grey-5 text-caption row justify-between items-center border-top-dark">
                        <div>Focus: <span class="text-primary font-mono">{{ activeArtifactLocation || 'Global' }}</span></div>
                        <div>Target App: <span class="text-weight-bold text-white font-mono">{{ targetComponent || 'nursinghome' }}</span></div>
                    </q-card-section>

                </q-card>
            </q-dialog>
        `,
        data() {
            return {
                isOpen: false,
                activeTab: 'prompt',
                userPrompt: '',
                targetComponent: 'nursinghome',
                activeArtifactLocation: '',
                targetArtifactId: '',
                blueprintTreeKey: 1, // Key forcing discussion-tree reload
                isExecuting: false,
                showCommandList: false,
                selectedCommand: null,
                commandParamValues: {},
                activeRagContextJson: '',
                promptHistory: [],
                registeredCommands: []
            };
        },
        computed: {
            availableCommands() {
                if (!this.userPrompt.startsWith('/')) return [];
                const search = this.userPrompt.toLowerCase();
                return this.registeredCommands.filter(c => c.command.toLowerCase().includes(search));
            },
            visibleParams() {
                if (!this.selectedCommand || !this.selectedCommand.params) return [];
                return this.selectedCommand.params.filter(p => !p.internal);
            }
        },
        mounted() {
            var vm = this;
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = function (event) {
                if (event.data && (event.data.event === 'force-open-command-palette' || event.data.event === 'open-prompt-editor')) {
                    vm.targetComponent = event.data.targetComponent || 'nursinghome';
                    vm.activeArtifactLocation = event.data.artifactLocation || '';
                    vm.targetArtifactId = event.data.agiArtifactId || '';
                    vm.isOpen = true;

                    vm.fetchDynamicTools();
                    if (vm.activeArtifactLocation) {
                        vm.fetchActiveRagContext(vm.activeArtifactLocation);
                    }
                }
            };

            this.fetchDynamicTools();
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },
        methods: {
            async fetchDynamicTools() {
                var vm = this;
                const headers = { 'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "" };

                try {
                    const response = await axios.get('/rest/s1/agi-ai/tools', { headers });
                    const data = response.data || {};
                    const rawTools = data.tools || data.toolsList || [];

                    vm.registeredCommands = rawTools.map(t => {
                        const cleanName = t.name ? '/' + t.name.replace(/_/g, '-') : '/tool';
                        const params = [];

                        if (t.inputSchema && t.inputSchema.properties) {
                            Object.keys(t.inputSchema.properties).forEach(pKey => {
                                const prop = t.inputSchema.properties[pKey];
                                params.push({
                                    name: pKey,
                                    type: prop.type || 'string',
                                    description: prop.description || '',
                                    internal: prop.internal || false
                                });
                            });
                        }

                        return {
                            command: cleanName,
                            rawName: t.name,
                            serviceName: t.serviceName,
                            description: t.description || t.title || 'MCP Tool',
                            params: params
                        };
                    });
                } catch (err) {
                    console.warn("⚠️ Could not load dynamic MCP tools from server:", err);
                }
            },

            // 🎯 PHASE 1.2: Fetch RAG context payload for active artifact (Tab 3 Inspector)
            async fetchActiveRagContext(artifactUri) {
                if (!artifactUri) {
                    this.activeRagContextJson = 'No active artifact location specified.';
                    return;
                }
                var vm = this;
                const headers = { 'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "" };

                try {
                    const response = await axios.get('/rest/s1/agi-ai/getRawXml', {
                        params: { artifactUri: artifactUri },
                        headers: headers
                    });

                    const payload = {
                        artifactUri: artifactUri,
                        targetComponent: vm.targetComponent,
                        rawXmlContent: response.data || 'Empty XML File'
                    };
                    vm.activeRagContextJson = JSON.stringify(payload, null, 2);
                } catch (err) {
                    vm.activeRagContextJson = JSON.stringify({
                        artifactUri: artifactUri,
                        status: 'error',
                        message: 'Could not fetch raw XML AST context for this artifact.'
                    }, null, 2);
                }
            },

            // 🎯 PHASE 1.2: Post-Execution Telemetry Synchronizer
            processExecutionTelemetry(executedCommandName, promptText, resultUri) {
                var vm = this;
                const newUri = resultUri || vm.activeArtifactLocation;

                // 1. Update Active Location and re-fetch Tab 3 Context Payload
                if (newUri) {
                    vm.activeArtifactLocation = newUri;
                    vm.fetchActiveRagContext(newUri);
                }

                // 2. Log entry to Tab 4 Prompt History
                vm.promptHistory.unshift({
                    timestamp: new Date().toLocaleTimeString(),
                    command: executedCommandName || 'AI Agent',
                    text: promptText,
                    resultUri: newUri || ''
                });

                // 3. Force-reload Tab 2 Blueprint Intent Tree
                vm.blueprintTreeKey++;

                // 4. Broadcast event across contextBus to open file in workspace canvas
                if (newUri && vm.contextBus) {
                    vm.contextBus.postMessage({
                        event: 'reload-blueprint-tree',
                        artifactUri: newUri
                    });
                    vm.contextBus.postMessage({
                        event: 'open-screen-artifact',
                        artifactUri: newUri
                    });
                }

                vm.userPrompt = '';
                vm.clearSelectedCommand();
            },

            onPromptInput(val) {
                this.showCommandList = val.startsWith('/') && !this.selectedCommand;
            },

            selectCommand(cmd) {
                this.selectedCommand = cmd;
                this.showCommandList = false;
                this.userPrompt = cmd.command + ' ';
                this.commandParamValues = {};

                if (cmd.params) {
                    cmd.params.forEach(p => {
                        this.commandParamValues[p.name] = '';
                    });
                }

                if (this.commandParamValues.hasOwnProperty('targetComponent')) {
                    this.commandParamValues['targetComponent'] = this.targetComponent || 'nursinghome';
                }
            },

            clearSelectedCommand() {
                this.selectedCommand = null;
                this.userPrompt = '';
                this.commandParamValues = {};
            },

            async handleExecute() {
                if (!this.userPrompt.trim()) return;

                this.isExecuting = true;
                var vm = this;
                const headers = {
                    'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "",
                    'Content-Type': 'application/json'
                };

                const executedPromptText = vm.userPrompt;

                // 🎯 1. DIRECT SLASH COMMAND DISPATCH
                if (this.selectedCommand && this.selectedCommand.serviceName) {
                    try {
                        const response = await axios.post('/rest/s1/agi-ai/mcp/run', {
                            serviceName: vm.selectedCommand.serviceName,
                            parameters: vm.commandParamValues
                        }, { headers });

                        vm.isExecuting = false;
                        const res = response.data || {};

                        if (vm.$q) {
                            vm.$q.notify({
                                type: 'positive',
                                message: 'Tool executed successfully: ' + (res.artifactUri || 'OK')
                            });
                        }

                        // 🎯 Run Phase 1.2 Telemetry Synchronization
                        vm.processExecutionTelemetry(vm.selectedCommand.command, executedPromptText, res.artifactUri);

                    } catch (err) {
                        vm.isExecuting = false;
                        const errorMsg = err.response?.data?.errors || err.message || 'Failed to execute tool service.';
                        if (vm.$q) vm.$q.notify({ type: 'negative', message: errorMsg });
                    }
                    return;
                }

                // 🎯 2. NATURAL LANGUAGE FALLBACK: Dispatch to geminiProxy for LLM reasoning
                const payload = {
                    userPrompt: vm.userPrompt,
                    targetComponent: vm.targetComponent || 'nursinghome',
                    focusCoordinate: vm.activeArtifactLocation || ''
                };

                try {
                    const response = await axios.post('/rest/s1/agi-ide/geminiProxy', payload, { headers });
                    vm.isExecuting = false;
                    const res = response.data || {};

                    let parsedRes = res;
                    if (typeof res.completionText === 'string') {
                        try { parsedRes = JSON.parse(res.completionText); } catch (e) { }
                    }

                    if (parsedRes.status === "error") {
                        if (vm.$q) {
                            vm.$q.notify({
                                type: 'negative',
                                message: parsedRes.error || 'Agent execution encountered an error.'
                            });
                        }
                        return;
                    }

                    if (vm.$q) {
                        vm.$q.notify({
                            type: 'positive',
                            message: parsedRes.message || 'Agent processed prompt successfully.'
                        });
                    }

                    const newUri = parsedRes.createdArtifactUri || res.createdArtifactUri;

                    // 🎯 Run Phase 1.2 Telemetry Synchronization
                    vm.processExecutionTelemetry('AI Agent', executedPromptText, newUri);

                } catch (err) {
                    vm.isExecuting = false;
                    const errorMsg = err.response?.data?.errors || err.message || 'Agent execution failed.';
                    if (vm.$q) vm.$q.notify({ type: 'negative', message: errorMsg });
                }
            },

            onDialogClosed() {
                this.userPrompt = '';
                this.clearSelectedCommand();
            }
        }
    };

    window.AgiPromptEditor = AgiPromptEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-prompt-editor'] = AgiPromptEditor;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('agi-prompt-editor', AgiPromptEditor);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();