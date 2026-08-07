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
                                <!-- Selected Tool Parameter Form (Dynamically built from MCP Schema) -->
                                <q-slide-transition>
                                    <div v-if="selectedCommand" class="q-pa-sm bg-slate-950 rounded-borders border-dark row items-center q-gutter-x-sm">
                                        <q-chip color="primary" text-color="white" dense size="sm" icon="build" removable @remove="clearSelectedCommand">
                                            {{ selectedCommand.command }}
                                        </q-chip>
                                        <span class="text-caption text-grey-4 ellipsis" style="max-width: 260px;">{{ selectedCommand.description }}</span>
                                        
                                        <!-- 🎯 Render visibleParams instead of raw params -->
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
                            v-if="targetArtifactId"
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
                        <div class="text-caption text-weight-bold text-grey-4 q-mb-xs">ACTIVE SCREEN AST & RAG CONTEXT</div>
                        <div class="q-pa-sm bg-slate-950 rounded-borders font-mono text-caption text-grey-3 break-all" style="white-space: pre-wrap;">
{{ activeRagContextJson || 'No context loaded.' }}
                        </div>
                    </q-card-section>

                    <!-- TAB 4: PROMPT HISTORY -->
                    <q-card-section v-else-if="activeTab === 'history'" class="q-pa-md bg-slate-900" style="height: 380px; overflow-y: auto;">
                        <q-list dark separator dense>
                            <q-item v-for="(hist, idx) in promptHistory" :key="idx">
                                <q-item-section>
                                    <q-item-label class="font-mono text-caption text-primary">{{ hist.timestamp }} - {{ hist.command || 'Prompt' }}</q-item-label>
                                    <q-item-label caption class="text-grey-3">{{ hist.text }}</q-item-label>
                                </q-item-section>
                            </q-item>
                        </q-list>
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
                isExecuting: false,
                showCommandList: false,
                selectedCommand: null,
                commandParamValues: {},
                activeRagContextJson: '',
                promptHistory: [],
                registeredCommands: [] // 🎯 Populated dynamically from AgiMcpBridgeServices
            };
        },
        computed: {
            availableCommands() {
                if (!this.userPrompt.startsWith('/')) return [];
                const search = this.userPrompt.toLowerCase();
                return this.registeredCommands.filter(c => c.command.toLowerCase().includes(search));
            },
            // Filter out parameters marked as internal in the MCP schema definition
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
                    vm.isOpen = true;
                    // Load dynamic tools from server whenever prompt editor opens
                    vm.fetchDynamicTools();
                }
            };

            // Initial fetch on mount
            this.fetchDynamicTools();
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },
        methods: {
            // 🎯 Fetch dynamically registered MCP tools from AgiMcpBridgeServices
            fetchDynamicTools() {
                var vm = this;
                $.ajax({
                    type: 'GET',
                    url: '/rest/s1/agi-ai/tools', // Points to AgiMcpBridgeServices.list#Tools or load#DynamicTools endpoint
                    dataType: 'json',
                    headers: { 'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "" },
                    success: function (data) {
                        const rawTools = data.tools || data.toolsList || [];
                        vm.registeredCommands = rawTools.map(t => {
                            // Format tool name into slash command format (e.g., create_screen -> /create-screen)
                            const cleanName = t.name ? '/' + t.name.replace(/_/g, '-') : '/tool';

                            // Extract parameter definitions from JSON Schema
                            const params = [];
                            if (t.inputSchema && t.inputSchema.properties) {
                                Object.keys(t.inputSchema.properties).forEach(pKey => {
                                    const prop = t.inputSchema.properties[pKey];
                                    params.push({
                                        name: pKey,
                                        type: prop.type || 'string',
                                        description: prop.description || '',
                                        internal: prop.internal || false // 🎯 Driven by backend schema
                                    });
                                });
                            }

                            return {
                                command: cleanName,
                                rawName: t.name,
                                serviceName: t.serviceName, // 🎯 Dynamic service identifier from backend
                                description: t.description || t.title || 'MCP Tool',
                                params: params
                            };
                        });
                    },
                    error: function (err) {
                        console.warn("⚠️ Could not load dynamic MCP tools from server:", err);
                    }
                });
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

                // 🎯 Automatically bind contextual defaults in background
                if (this.commandParamValues.hasOwnProperty('targetComponent')) {
                    this.commandParamValues['targetComponent'] = this.targetComponent || 'nursinghome';
                }
            },

            clearSelectedCommand() {
                this.selectedCommand = null;
                this.userPrompt = '';
                this.commandParamValues = {};
            },

            handleExecute() {
                if (!this.userPrompt.trim()) return;

                this.isExecuting = true;
                var vm = this;

                // 🎯 DYNAMIC DISPATCH: Generic service call based on schema-provided serviceName
                if (this.selectedCommand && this.selectedCommand.serviceName) {
                    $.ajax({
                        type: 'POST',
                        url: '/rest/s1/agi-ai/mcp/run', // Generic REST proxy for dynamic MCP services
                        data: JSON.stringify({
                            serviceName: vm.selectedCommand.serviceName,
                            parameters: vm.commandParamValues
                        }),
                        contentType: 'application/json',
                        dataType: 'json',
                        headers: { 'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "" },
                        success: function (res) {
                            vm.isExecuting = false;
                            if (vm.$q) {
                                vm.$q.notify({
                                    type: 'positive',
                                    message: 'Tool executed successfully: ' + (res.artifactUri || res.rootArtifactPath || 'OK')
                                });
                            }
                            vm.promptHistory.unshift({
                                timestamp: new Date().toLocaleTimeString(),
                                command: vm.selectedCommand.command,
                                text: vm.userPrompt
                            });
                            vm.userPrompt = '';
                            vm.clearSelectedCommand();

                            if (res.artifactUri && vm.contextBus) {
                                vm.contextBus.postMessage({
                                    event: 'open-screen-artifact',
                                    artifactUri: res.artifactUri
                                });
                            }
                        },
                        error: function (err) {
                            vm.isExecuting = false;
                            if (vm.$q) vm.$q.notify({ type: 'negative', message: 'Failed to execute tool service.' });
                        }
                    });
                    return;
                }

                // Standard Gemini proxy fallback for natural language prompts...
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