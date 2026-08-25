(function () {
    const AgiPromptEditor = {
        name: 'AgiPromptEditor',
        components: {
            'discussion-tree': {
                name: 'DiscussionTreeProxy',
                render() {
                    const comp = window.DiscussionTree || window.AgiComponents?.['discussion-tree'] || (window.moqui && window.moqui.webrootVueApp?._context?.components?.['discussion-tree']);
                    return comp ? Vue.h(comp, this.$attrs, this.$slots) : null;
                }
            },
            'discussion-detail': {
                name: 'DiscussionDetailProxy',
                render() {
                    const comp = window.DiscussionDetail || window.AgiComponents?.['discussion-detail'] || (window.moqui && window.moqui.webrootVueApp?._context?.components?.['discussion-detail']);
                    return comp ? Vue.h(comp, this.$attrs, this.$slots) : null;
                }
            },
            'agi-intent-detail': {
                name: 'AgiIntentDetailProxy',
                render() {
                    const comp = window.AgiIntentDetail || window.AgiComponents?.['agi-intent-detail'] || (window.moqui && window.moqui.webrootVueApp?._context?.components?.['agi-intent-detail']);
                    return comp ? Vue.h(comp, this.$attrs, this.$slots) : null;
                }
            },
            'agi-artifact-palette': {
                name: 'AgiArtifactPaletteProxy',
                render() {
                    const comp = window.AgiArtifactPalette || window.AgiComponents?.['agi-artifact-palette'] || (window.moqui && window.moqui.webrootVueApp?._context?.components?.['agi-artifact-palette']);
                    return comp ? Vue.h(comp, this.$attrs, this.$slots) : null;
                }
            }
        },
        template: `
            <q-dialog v-model="isOpen" position="top" @hide="onDialogClosed">
                <q-card class="agi-prompt-editor-card bg-slate-900 text-white shadow-24 q-mt-sm column no-wrap" style="width: 1050px; max-width: 95vw; max-height: 90vh;">
                    
                    <!-- 1. HEADER: Target Component & Tab Switcher -->
                    <q-card-section class="q-pa-sm bg-slate-950 row items-center justify-between border-bottom-dark">
                        <div class="row items-center q-gutter-x-sm">
                            <q-icon name="psychology" color="primary" size="sm" />
                            <div>
                                <span class="text-subtitle2 text-weight-bold">AGI HARNESS COMMAND CENTER</span>
                                <q-badge color="deep-purple-8" class="q-ml-sm font-mono text-caption">
                                    TARGET: {{ targetComponent || 'nursinghome' }}
                                </q-badge>
                                <q-badge v-if="stagedTurn.isStaged" color="secondary" class="q-ml-xs font-mono text-caption text-weight-bold">
                                    STAGING ACTIVE ({{ activeStagedItemsCount }} Items)
                                </q-badge>
                            </div>
                        </div>

                        <!-- Mode Switcher Tabs with Staged Indicators -->
                        <q-tabs v-model="activeTab" dense active-color="primary" indicator-color="primary" class="text-grey-4">
                            <q-tab name="prompt" icon="terminal" label="Prompt & Directives" no-caps />
                            <q-tab name="blueprint" icon="account_tree" label="Blueprint Intent" no-caps>
                                <q-badge v-if="stagedTurn.selectedIntents.length > 0" color="secondary" floating>{{ stagedTurn.selectedIntents.length }}</q-badge>
                            </q-tab>
                            <q-tab name="context" icon="analytics" label="RAG Context & AST" no-caps>
                                <q-badge v-if="activeRagCount > 0" color="secondary" floating>{{ activeRagCount }}</q-badge>
                            </q-tab>
                            <q-tab name="history" icon="history" label="Prompt History" no-caps />
                        </q-tabs>

                        <q-btn flat round dense icon="close" text-color="white" v-close-popup />
                    </q-card-section>

                    <!-- 2. ACTIVE STAGING NOTIFICATION BAR -->
                    <div v-if="stagedTurn.isStaged" class="bg-slate-950 q-px-md q-py-xs row items-center justify-between border-bottom-dark" style="border-bottom: 1px solid #334155;">
                        <div class="row items-center q-gutter-x-xs text-caption text-secondary font-mono">
                            <q-icon name="tune" size="xs" />
                            <span>Staging Mode: Switch between tabs to refine intents, toggle RAG items, and add prompt directives before commit.</span>
                        </div>
                        <q-btn flat dense size="xs" color="grey-5" icon="close" label="Exit Staging" @click="stagedTurn.isStaged = false" />
                    </div>

                    <!-- 3. SCROLLABLE TAB CONTENT AREA -->
                    <div class="col overflow-auto bg-slate-900">
                        
                        <!-- TAB 1: PROMPT, COMMANDS & DIRECTIVES -->
                        <q-card-section v-if="activeTab === 'prompt'" class="q-pa-md">
                            <div class="q-gutter-y-sm">
                                
                                <!-- Primary Prompt Input -->
                                <div class="row items-center q-col-gutter-sm">
                                    <q-input 
                                        ref="promptInput"
                                        v-model="userPrompt" 
                                        placeholder="Type a task prompt or '/' for MCP tools..." 
                                        outlined 
                                        dense 
                                        bg-color="white"
                                        input-class="text-black font-mono"
                                        class="col"
                                        :disable="isExecuting"
                                        @update:model-value="onPromptInput"
                                        @keydown.enter="handleDirectExecute"
                                        @keydown.esc="isOpen = false"
                                    >
                                        <template v-slot:append>
                                            <q-btn flat round icon="manage_search" color="cyan-4" @click="showPalette = !showPalette">
                                                <q-tooltip class="bg-slate-900 text-caption">Browse & Focus Artifacts</q-tooltip>
                                            </q-btn>
                                        </template>
                                    </q-input>

                                    <!-- Dual Submission Action Buttons -->
                                    <div class="row q-gutter-xs">
                                        <q-btn 
                                            color="primary" 
                                            icon="bolt" 
                                            label="Direct Submit" 
                                            no-caps 
                                            dense 
                                            class="q-px-sm"
                                            :loading="isExecuting"
                                            @click="handleDirectExecute"
                                        >
                                            <q-tooltip>Direct execution via standard MCP / Agent proxy</q-tooltip>
                                        </q-btn>
                                        <q-btn 
                                            color="secondary" 
                                            icon="tune" 
                                            label="Stage & Review" 
                                            no-caps 
                                            dense 
                                            class="q-px-sm"
                                            :loading="isExecuting"
                                            @click="handleStageAndReview"
                                        >
                                            <q-tooltip>Pre-process RAG context into Staging Ground before commit</q-tooltip>
                                        </q-btn>
                                    </div>
                                </div>

                                <!-- Ad-hoc Directives & Constraints (Visible in Staging) -->
                                <div v-if="stagedTurn.isStaged" class="q-mt-sm q-pa-sm bg-slate-950 rounded-borders border-dark" style="border: 1px solid #334155;">
                                    <div class="text-caption text-weight-bold text-secondary q-mb-xs font-mono row items-center">
                                        <q-icon name="edit_note" size="xs" class="q-mr-xs" /> Ad-hoc Directives / System Constraints:
                                    </div>
                                    <q-input 
                                        v-model="stagedTurn.adHocPrompt" 
                                        type="textarea" 
                                        rows="2" 
                                        dense 
                                        outlined 
                                        bg-color="slate-900"
                                        placeholder="Add ad-hoc constraints (e.g. 'Use mantle.party.Party and enforce encrypt=true on SSN')..."
                                        class="font-mono text-caption"
                                    />
                                </div>

                                <!-- Inline Artifact Palette Drawer -->
                                <q-slide-transition>
                                    <div v-if="showPalette" class="q-mb-sm rounded-borders border-dark q-pa-xs" style="border: 1px solid #334155;">
                                        <div class="row items-center justify-between q-px-xs q-mb-xs">
                                            <span class="text-caption text-weight-bold text-cyan-4 font-mono">SELECT FOCUS ARTIFACT</span>
                                            <q-btn flat dense icon="close" size="xs" color="grey-5" @click="showPalette = false" />
                                        </div>
                                        <agi-artifact-palette @artifact-selected="onArtifactSelectedFromPalette" />
                                    </div>
                                </q-slide-transition>

                                <!-- Dynamic Tool Parameter Form -->
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

                                <!-- Slash Command Auto-complete -->
                                <div 
                                    v-if="showCommandList && availableCommands.length > 0" 
                                    class="rounded-borders border-dark q-pa-xs max-h-48 overflow-y-auto shadow-8"
                                    style="background-color: #020617; border: 1px solid #334155;"
                                >
                                    <div class="row items-center justify-between q-px-xs q-mb-xs">
                                        <div class="text-caption text-weight-bold text-cyan-4 font-mono">DISCOVERED MCP TOOLS</div>
                                        <q-btn flat dense icon="refresh" size="xs" color="cyan-4" @click="fetchDynamicTools">
                                            <q-tooltip>Reload MCP Tools</q-tooltip>
                                        </q-btn>
                                    </div>
                                    <q-list dense separator style="background-color: transparent;">
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
                                                <q-item-label class="font-mono text-caption text-weight-bolder text-cyan-4">{{ cmd.command }}</q-item-label>
                                                <q-item-label caption class="text-slate-300 text-caption ellipsis" style="color: #cbd5e1 !important;">{{ cmd.description }}</q-item-label>
                                            </q-item-section>
                                        </q-item>
                                    </q-list>
                                </div>

                            </div>
                        </q-card-section>

                        <!-- TAB 2: BLUEPRINT INTENT HIERARCHY & SELECTION -->
                        <q-card-section v-else-if="activeTab === 'blueprint'" class="q-pa-md">
                            <div class="row items-center justify-between q-mb-sm">
                                <div class="text-caption text-weight-bold text-grey-4">DOMAIN INTENT NODES (Click to toggle attachment to Staged Prompt)</div>
                                <div class="text-caption text-secondary font-mono">Selected: {{ stagedTurn.selectedIntents.length }} nodes</div>
                            </div>
                            <div class="bg-slate-950 q-pa-sm rounded-borders border-dark" style="min-height: 320px;">
                                <discussion-tree 
                                    :key="blueprintTreeKey"
                                    wiki-space-id="AGI_INTENT"
                                    :agi-artifact-id="targetArtifactId || ''"
                                    :source-reference-id="activeArtifactLocation || ''">
                                    <template v-slot:node-detail="{ node }">
                                        <discussion-detail :node="node">
                                            <div class="q-pa-xs row items-center justify-between bg-slate-900 rounded-borders q-mb-xs">
                                                <q-checkbox 
                                                    v-model="stagedTurn.selectedIntents" 
                                                    :val="node.wikiPageId || node.id" 
                                                    label="Attach Intent Specification to Prompt" 
                                                    dark 
                                                    dense 
                                                    color="secondary" 
                                                />
                                            </div>
                                            <agi-intent-detail 
                                                :node="node" 
                                                :selected-artifact="{ agiArtifactId: targetArtifactId, artifactPath: activeArtifactLocation }"
                                            />
                                        </discussion-detail>
                                    </template>
                                </discussion-tree>
                            </div>
                        </q-card-section>

                        <!-- TAB 3: ACTIVE RAG PAYLOAD & AST SCOPING -->
                        <q-card-section v-else-if="activeTab === 'context'" class="q-pa-md">
                            
                            <!-- 1. Staged RAG Knowledge Items -->
                            <div class="q-mb-md">
                                <div class="row items-center justify-between q-mb-xs">
                                    <div class="text-caption text-weight-bold text-secondary font-mono row items-center">
                                        <q-icon name="analytics" size="xs" class="q-mr-xs" /> ACTIVE RAG KNOWLEDGE SNIPPETS
                                    </div>
                                    <q-btn flat dense size="xs" color="cyan-4" icon="refresh" label="Reload RAG" @click="handleStageAndReview" />
                                </div>
                                <q-list bordered separator dense class="bg-slate-950 rounded-borders max-h-48 overflow-y-auto">
                                    <q-item v-for="(ctx, idx) in stagedTurn.stagedRagContext" :key="idx" tag="label" v-ripple>
                                        <q-item-section side top>
                                            <q-checkbox v-model="ctx.enabled" dense color="secondary" />
                                        </q-item-section>
                                        <q-item-section>
                                            <q-item-label class="text-weight-bold text-caption text-secondary">{{ ctx.category }}: {{ ctx.title }}</q-item-label>
                                            <q-item-label caption class="text-grey-4 ellipsis-2-lines">{{ ctx.snippet }}</q-item-label>
                                        </q-item-section>
                                    </q-item>
                                    <q-item v-if="stagedTurn.stagedRagContext.length === 0">
                                        <q-item-section class="text-caption text-grey-5 text-center q-pa-xs">
                                            No automated RAG context matches loaded. Click Stage & Review to query.
                                        </q-item-section>
                                    </q-item>
                                </q-list>
                            </div>

                            <!-- 2. Screen AST Scoping Controls -->
                            <div class="q-mb-sm">
                                <div class="text-caption text-weight-bold text-grey-8 q-mb-xs">SCREEN AST CONTEXT SCOPING</div>
                                <div class="row q-gutter-x-md q-pa-xs bg-slate-950 rounded-borders text-grey-8 ">
                                    <q-checkbox v-model="stagedTurn.includeRawXml" dense color="cyan-4" label="Include Raw XML AST Content" />
                                    <q-checkbox v-model="stagedTurn.includeFullAst" dense color="cyan-4" label="Include Parsed Blueprint JSON Tree" />
                                </div>
                            </div>

                            <!-- 3. Raw AST Payload Preview -->
                            <div class="q-pa-sm bg-slate-950 rounded-borders font-mono text-caption text-grey-4 max-h-40 overflow-y-auto break-all" style="white-space: pre-wrap; font-size: 10px;">
{{ activeRagContextJson || 'No AST context loaded for active artifact.' }}
                            </div>
                        </q-card-section>

                        <!-- TAB 4: PROMPT HISTORY & RE-STAGING -->
                        <q-card-section v-else-if="activeTab === 'history'" class="q-pa-md">
                            <q-list separator dense v-if="promptHistory.length > 0">
                                <q-item v-for="(hist, idx) in promptHistory" :key="idx" class="q-py-sm">
                                    <q-item-section>
                                        <div class="row items-center justify-between">
                                            <q-item-label class="font-mono text-caption text-primary">
                                                {{ hist.timestamp }} - <q-badge color="cyan-9" class="q-ml-xs">{{ hist.command || 'Prompt' }}</q-badge>
                                            </q-item-label>
                                            <q-btn flat dense size="xs" color="secondary" icon="tune" label="Re-Stage / Fork" @click="forkHistoryTurn(hist)" />
                                        </div>
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

                    </div>

                    <!-- 4. PERSISTENT DISPATCH FOOTER (Visible on all tabs when Staged) -->
                    <q-card-section class="q-py-sm q-px-md bg-slate-950 border-top-dark row justify-between items-center" style="border-top: 1px solid #334155;">
                        <div class="row items-center q-gutter-x-sm font-mono text-caption text-grey-4">
                            <div>Focus: <span class="text-primary">{{ activeArtifactLocation || 'Global' }}</span></div>
                            <q-separator vertical class="q-mx-xs" />
                            <div>Target App: <span class="text-weight-bold text-white">{{ targetComponent || 'nursinghome' }}</span></div>
                        </div>

                        <!-- Confirm Staged Dispatch Button -->
                        <div class="row q-gutter-xs items-center">
                            <q-btn 
                                v-if="stagedTurn.isStaged"
                                color="positive" 
                                icon="send" 
                                label="Submit Staged Payload to Agent" 
                                no-caps 
                                dense 
                                class="q-px-md" 
                                :loading="isExecuting" 
                                @click="confirmStagedDispatch" 
                            />
                            <q-btn 
                                v-else
                                color="primary" 
                                icon="bolt" 
                                label="Quick Dispatch" 
                                no-caps 
                                dense 
                                class="q-px-md" 
                                :loading="isExecuting" 
                                @click="handleDirectExecute" 
                            />
                        </div>
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
                blueprintTreeKey: 1,
                isExecuting: false,
                showCommandList: false,
                showPalette: false,
                selectedCommand: null,
                commandParamValues: {},
                activeRagContextJson: '',
                promptHistory: [],
                registeredCommands: [],

                // 🎯 UNIFIED MULTI-TAB STAGING MODEL
                stagedTurn: {
                    isStaged: false,
                    adHocPrompt: '',
                    selectedIntents: [],
                    stagedRagContext: [],
                    includeFullAst: true,
                    includeRawXml: false
                }
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
            },
            activeRagCount() {
                return (this.stagedTurn.stagedRagContext || []).filter(c => c.enabled).length;
            },
            activeStagedItemsCount() {
                return this.stagedTurn.selectedIntents.length + this.activeRagCount;
            }
        },
        mounted() {
            var vm = this;
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            // In AgiPromptEditor.qvt.js inside mounted():
            this.contextBus.onmessage = function (event) {
                if (event.data && (event.data.event === 'force-open-command-palette' || event.data.event === 'open-prompt-editor')) {
                    vm.targetComponent = event.data.targetComponent || 'nursinghome';
                    vm.activeArtifactLocation = event.data.artifactLocation || '';
                    vm.targetArtifactId = event.data.agiArtifactId || '';

                    // 🎯 Capture targeted element focus & ad-hoc style prompt
                    if (event.data.adHocPrompt) {
                        vm.stagedTurn.adHocPrompt = event.data.adHocPrompt;
                        vm.stagedTurn.isStaged = true;
                    }
                    if (event.data.focusCoordinate) {
                        vm.focusedElementId = event.data.focusCoordinate;
                    }

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
            resolveCsrfToken() {
                return window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || (window.opener && window.opener.moqui && window.opener.moqui.moquiSessionToken)
                    || (document.querySelector('meta[name="moqui-session-token"]')?.getAttribute('content'))
                    || "";
            },

            onArtifactSelectedFromPalette(item) {
                this.activeArtifactLocation = item.value;
                this.fetchActiveRagContext(item.value);
                this.showPalette = false;

                if (this.selectedCommand) {
                    if (this.commandParamValues.hasOwnProperty('artifactUri')) {
                        this.commandParamValues['artifactUri'] = item.value;
                    } else if (this.commandParamValues.hasOwnProperty('sourceArtifactUri')) {
                        this.commandParamValues['sourceArtifactUri'] = item.value;
                    } else if (this.commandParamValues.hasOwnProperty('screenPath')) {
                        this.commandParamValues['screenPath'] = item.screenPath;
                    }
                } else {
                    this.userPrompt += (this.userPrompt.length > 0 ? ' ' : '') + item.value;
                }
            },

            async fetchDynamicTools() {
                var vm = this;
                const headers = { 'moquiSessionToken': this.resolveCsrfToken() };

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

            async fetchActiveRagContext(artifactUri) {
                if (!artifactUri) {
                    this.activeRagContextJson = 'No active artifact location specified.';
                    this.rawFileContent = '';
                    return;
                }
                var vm = this;
                const headers = { 'moquiSessionToken': this.resolveCsrfToken() };

                try {
                    // Fetch actual JSON AST buffer from WorkspaceBuffer
                    const response = await axios.get('/rest/s1/agi-ide/getWorkspaceBuffer', {
                        params: { artifactUri: artifactUri },
                        headers: headers
                    });

                    const bufData = response.data || {};
                    let astTree = bufData.metaJsonBuffer || bufData.layoutTree || null;

                    if (typeof astTree === 'string' && astTree.trim().startsWith('{')) {
                        try { astTree = JSON.parse(astTree); } catch (e) { }
                    }

                    const payload = {
                        artifactUri: artifactUri,
                        targetComponent: vm.targetComponent,
                        astTree: astTree // 🎯 Real AST payload containing widgets & fields
                    };
                    vm.activeRagContextJson = JSON.stringify(payload, null, 2);
                } catch (err) {
                    vm.activeRagContextJson = JSON.stringify({
                        artifactUri: artifactUri,
                        status: 'error',
                        message: 'Could not fetch AST tree for this artifact.'
                    }, null, 2);
                }
            },

            // 🎯 STAGE & REVIEW: Gathers Knowledge Items and Enters Multi-Tab Staging Mode
            handleStageAndReview() {
                if (!this.userPrompt.trim()) return;
                this.isExecuting = true;

                const tkn = this.resolveCsrfToken();
                const currentFileUri = this.activeArtifactLocation || '';

                axios.post('/rest/s1/agi-ide/PreprocessRagContext', {
                    artifactUri: currentFileUri,
                    prompt: this.userPrompt.trim(),
                    targetComponent: this.targetComponent || 'nursinghome'
                }, { headers: { 'moquiSessionToken': tkn } })
                    .then(res => {
                        this.isExecuting = false;
                        this.stagedTurn.stagedRagContext = (res.data?.contextItems || []).map(item => ({
                            ...item,
                            enabled: true
                        }));
                        this.stagedTurn.isStaged = true;
                    })
                    .catch(err => {
                        this.isExecuting = false;
                        console.warn("⚠️ RAG Pre-processor offline, initializing fallback staging context:", err.message);
                        this.stagedTurn.stagedRagContext = [
                            { category: 'SKILLS.md', title: 'HIPAA Enforcement', snippet: 'encrypt="true" on sensitive fields; enable-audit-log="true" on sensitive entities', enabled: true },
                            { category: 'UDM', title: 'mantle.party.Party', snippet: 'Reuse and extend Mantle UDM entities before creating custom tables', enabled: true }
                        ];
                        this.stagedTurn.isStaged = true;
                    });
            },

            // 🎯 CONFIRM STAGED DISPATCH: Dispatches composite payload assembled from all 4 tabs
            async confirmStagedDispatch() {
                const activeRag = this.stagedTurn.stagedRagContext.filter(c => c.enabled);
                this.isExecuting = true;

                const tkn = this.resolveCsrfToken();
                const currentFileUri = this.activeArtifactLocation || '';
                const executedPromptText = this.userPrompt;

                const headers = {
                    'moquiSessionToken': tkn,
                    'Content-Type': 'application/json'
                };

                const payload = {
                    artifactUri: currentFileUri,
                    targetComponent: this.targetComponent || 'nursinghome',
                    userPrompt: this.userPrompt.trim(),
                    adHocPrompt: this.stagedTurn.adHocPrompt,
                    mcpTool: this.selectedCommand ? this.selectedCommand.command : null,
                    mcpParams: this.selectedCommand ? this.commandParamValues : null,
                    selectedIntents: this.stagedTurn.selectedIntents,
                    ragContext: activeRag,
                    rawXmlContent: this.stagedTurn.includeRawXml ? this.rawFileContent : null,
                    activeRagContext: this.stagedTurn.includeFullAst ? this.activeRagContextJson : null
                };

                try {
                    const response = await axios.post('/rest/s1/agi-ide/ExecuteStagedAgentTurn', payload, { headers });
                    this.isExecuting = false;
                    this.stagedTurn.isStaged = false;
                    const res = response.data || {};

                    let parsedRes = res;
                    if (typeof res.completionText === 'string') {
                        try { parsedRes = JSON.parse(res.completionText); } catch (e) { }
                    }

                    const newUri = parsedRes.createdArtifactUri || res.createdArtifactUri || currentFileUri;
                    const updatedXml = parsedRes.rawXmlContent || '';

                    if (newUri && this.contextBus) {
                        this.contextBus.postMessage({
                            event: 'artifact-state-mutated',
                            artifactUri: newUri,
                            rawXmlText: updatedXml
                        });
                    }

                    if (this.$q) {
                        this.$q.notify({
                            type: 'positive',
                            message: parsedRes.message || 'Staged turn dispatched to agent successfully.'
                        });
                    }

                    this.processExecutionTelemetry('Staged Agent Turn', executedPromptText, newUri, payload);
                    this.stagedTurn.adHocPrompt = '';

                } catch (err) {
                    this.isExecuting = false;
                    const errorMsg = err.response?.data?.errors || err.message || 'Staged agent execution failed.';
                    if (this.$q) this.$q.notify({ type: 'negative', message: errorMsg });
                }
            },

            // 🎯 FORK PRIOR HISTORY TURN: Restores context & intent state to all 4 tabs
            forkHistoryTurn(hist) {
                this.userPrompt = hist.text || '';
                this.activeTab = 'prompt';
                this.stagedTurn.isStaged = true;

                if (hist.payload) {
                    this.stagedTurn.adHocPrompt = hist.payload.adHocPrompt || '';
                    this.stagedTurn.selectedIntents = hist.payload.selectedIntents || [];
                    if (hist.payload.ragContext) {
                        this.stagedTurn.stagedRagContext = hist.payload.ragContext;
                    }
                }
                if (this.$q) {
                    this.$q.notify({
                        type: 'info',
                        message: 'History turn loaded into Staging Pipeline across all tabs.'
                    });
                }
            },

            processExecutionTelemetry(executedCommandName, promptText, resultUri, stagedPayload) {
                var vm = this;
                const newUri = resultUri || vm.activeArtifactLocation;

                if (newUri) {
                    vm.activeArtifactLocation = newUri;
                    vm.fetchActiveRagContext(newUri);
                }

                vm.promptHistory.unshift({
                    timestamp: new Date().toLocaleTimeString(),
                    command: executedCommandName || 'AI Agent',
                    text: promptText,
                    resultUri: newUri || '',
                    payload: stagedPayload || null
                });

                vm.blueprintTreeKey++;

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

            // 🎯 DIRECT EXECUTE TRACK: Immediate single-turn execution
            async handleDirectExecute() {
                if (!this.userPrompt.trim()) return;

                const executedPromptText = this.userPrompt.trim();

                // Component Skeleton Wizard Shortcut
                if (executedPromptText.startsWith('/new-component') ||
                    executedPromptText.startsWith('/create-component') ||
                    executedPromptText.startsWith('/component')) {

                    const parts = executedPromptText.split(/\s+/);
                    const defaultName = parts.length > 1 ? parts[1] : '';

                    if (this.contextBus) {
                        this.contextBus.postMessage({
                            event: 'open-new-component-wizard',
                            defaultName: defaultName
                        });
                    }

                    this.isOpen = false;
                    this.userPrompt = '';
                    return;
                }

                this.isExecuting = true;
                var vm = this;
                const headers = {
                    'moquiSessionToken': this.resolveCsrfToken(),
                    'Content-Type': 'application/json'
                };

                // Direct MCP Service Invocation
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

                        vm.processExecutionTelemetry(vm.selectedCommand.command, executedPromptText, res.artifactUri);

                    } catch (err) {
                        vm.isExecuting = false;
                        const errorMsg = err.response?.data?.errors || err.message || 'Failed to execute tool service.';
                        if (vm.$q) vm.$q.notify({ type: 'negative', message: errorMsg });
                    }
                    return;
                }

                const payload = {
                    userPrompt: vm.userPrompt,
                    targetComponent: vm.targetComponent || 'nursinghome',
                    focusCoordinate: vm.activeArtifactLocation || '',
                    activeRagContext: null, // Avoid passing full file content in quick/direct executions
                    availableToolSchemas: vm.registeredCommands.map(cmd => ({
                        command: cmd.command,
                        serviceName: cmd.serviceName,
                        description: cmd.description,
                        params: cmd.params
                    }))
                };

                try {
                    const response = await axios.post('/rest/s1/agi-ide/openAiProxy', payload, { headers });
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

                    const newUri = parsedRes.createdArtifactUri || res.createdArtifactUri;
                    const updatedXml = parsedRes.rawXmlContent || '';

                    if (newUri && vm.contextBus) {
                        vm.contextBus.postMessage({
                            event: 'artifact-state-mutated',
                            artifactUri: newUri,
                            rawXmlText: updatedXml
                        });
                    }

                    if (vm.$q) {
                        vm.$q.notify({
                            type: 'positive',
                            message: parsedRes.message || 'Agent processed prompt successfully.'
                        });
                    }

                    vm.processExecutionTelemetry('AI Agent', executedPromptText, newUri);

                } catch (err) {
                    vm.isExecuting = false;
                    const errorMsg = err.response?.data?.errors || err.message || 'Agent execution failed.';
                    if (vm.$q) vm.$q.notify({ type: 'negative', message: errorMsg });
                }
            },

            onDialogClosed() {
                this.userPrompt = '';
                this.showPalette = false;
                this.stagedTurn.isStaged = false;
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