(function () {
    const AgiPromptEditor = {
        name: 'AgiPromptEditor',
        props: {
            activeArtifact: { type: String, default: '' },
            targetComponentProp: { type: String, default: 'nursinghome' }
        },
        data() {
            return {
                currentMode: 'plan',
                activeTab: 'history',
                inspectingHistoryId: null,
                userPrompt: '',
                targetComponent: this.targetComponentProp || 'nursinghome',
                activeArtifactLocation: this.activeArtifact || '',
                focusedElementId: '',
                isExecuting: false,
                showPalette: false,
                selectedPayloadMember: 'notes',

                // Header Screen Switchers
                availableEditors: [
                    { name: 'AgiCanvasEditor', label: 'Canvas', icon: 'preview', color: 'cyan-4' },
                    { name: 'AgiScreenEditor', label: 'Screen XML', icon: 'code', color: 'amber-4' },
                    { name: 'AgiServiceEditor', label: 'Service', icon: 'miscellaneous_services', color: 'purple-3' },
                    { name: 'AgiEntityEditor', label: 'Entity', icon: 'storage', color: 'teal-4' }
                ],

                // Assist Modes
                assistModes: [
                    { label: 'Plan', value: 'plan', icon: 'lightbulb', color: 'amber-4' },
                    { label: 'Build', value: 'build', icon: 'build', color: 'primary' },
                    { label: 'Test', value: 'test', icon: 'fact_check', color: 'teal-4' },
                    { label: 'Discuss', value: 'discuss', icon: 'forum', color: 'green-4' }
                ],

                // Staged Payload Envelope
                payloadEnvelope: {
                    agiPayloadId: null,
                    mode: 'plan',
                    targetComponent: 'nursinghome',
                    artifactUri: '',
                    targetMariaId: null,
                    notes: '',
                    recommendedArchetype: '',
                    recommendedArchetypeUri: '',
                    selectedEntities: [],
                    facets: {
                        hipaa: 'true',
                        domain: 'clinical'
                    }
                },

                // Parsed Output Payload State (Empty until current prompt returns)
                lastParsedResult: null,

                // Intent History Ledger
                historySearchFilter: '',
                matchingHistoricalPayloads: [],
                expandedHistoryNodes: {},
                historyDetailCache: {},

                // Catalog Registries
                availableArchetypes: [],
                detectedEntities: [],
                registeredMcpTools: [],

                // Facet Input
                newFacetKey: '',
                newFacetVal: '',
                // Current Prompt Scratchpad
                currentPromptState: {
                    userPrompt: '',
                    currentMode: 'plan',
                    activeArtifactLocation: this.activeArtifact || '',
                    focusedElementId: '',
                    payloadEnvelope: {
                        agiPayloadId: null,
                        mode: 'plan',
                        targetComponent: 'nursinghome',
                        artifactUri: '',
                        targetMariaId: null,
                        notes: '',
                        recommendedArchetype: '',
                        recommendedArchetypeUri: '',
                        selectedEntities: [],
                        facets: { hipaa: 'true', domain: 'clinical' }
                    }
                },

                // Filter Drawer & Table Definition
                showHistoryFilterDrawer: false,
                historyFilter: {
                    searchTerm: '',
                    mode: null,
                    fromDate: '',
                    toDate: '',
                    currentArtifactOnly: true
                },
                pagination: {
                    sortBy: 'lastUpdatedStamp',
                    descending: true,
                    page: 1,
                    rowsPerPage: 10
                },
                historyColumns: [
                    { name: 'agiPayloadId', label: 'ID', field: 'agiPayloadId', sortable: true, align: 'left', style: 'width: 70px;' },
                    { name: 'lastUpdatedStamp', label: 'Timestamp', field: 'lastUpdatedStamp', sortable: true, align: 'left', style: 'width: 150px;' },
                    { name: 'modeEnumId', label: 'Mode', field: 'modeEnumId', sortable: true, align: 'center', style: 'width: 80px;' },
                    { name: 'statusId', label: 'Status', field: 'statusId', sortable: true, align: 'center', style: 'width: 90px;' },
                    {
                        name: 'userPromptText', label: 'Prompt Intent', field: 'userPromptText', sortable: false, align: 'left',
                        format: (val) => {
                            if (!val) return '';
                            const text = val.replace(/\s+/g, ' ').trim();
                            return text.length > 120 ? text.substring(0, 117) + '...' : text;
                        },
                        classes: 'ellipsis font-mono'
                    },
                    { name: 'actions', label: 'Inspect Actions', field: 'actions', sortable: false, align: 'center', style: 'width: 170px;' }
                ],
            };
        },

        computed: {
            currentArtifactLabel() {
                if (!this.activeArtifactLocation) return 'No Artifact Selected';
                const parts = this.activeArtifactLocation.split('/');
                return parts[parts.length - 1];
            },
            modeActionLabel() {
                switch (this.currentMode) {
                    case 'plan': return 'Formulate Plan';
                    case 'build': return 'Dispatch Build';
                    case 'test': return 'Execute Test';
                    case 'discuss': return 'Log Intent';
                    default: return 'Dispatch Turn';
                }
            },
            modeActionIcon() {
                switch (this.currentMode) {
                    case 'plan': return 'lightbulb';
                    case 'build': return 'bolt';
                    case 'test': return 'fact_check';
                    case 'discuss': return 'forum';
                    default: return 'send';
                }
            },
            modeActionColor() {
                switch (this.currentMode) {
                    case 'plan': return 'amber-9';
                    case 'build': return 'positive';
                    case 'test': return 'teal-8';
                    case 'discuss': return 'green-8';
                    default: return 'primary';
                }
            }
        },

        watch: {
            activeArtifact(newUri) {
                if (newUri && newUri !== this.activeArtifactLocation) {
                    this.activeArtifactLocation = newUri;
                    this.payloadEnvelope.artifactUri = newUri;
                }
            },
            currentMode(newMode) {
                this.payloadEnvelope.mode = newMode;
            }
        },

        mounted() {
            const vm = this;
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = (event) => {
                if (!event.data) return;

                if (event.data.event === 'open-screen-artifact' || event.data.event === 'open-prompt-editor') {
                    if (event.data.artifactUri) {
                        vm.activeArtifactLocation = event.data.artifactUri;
                        vm.payloadEnvelope.artifactUri = event.data.artifactUri;
                    }
                    if (event.data.targetComponent) vm.targetComponent = event.data.targetComponent;
                }
                if (event.data.event === 'element-selected-by-id' && event.data.mariaId) {
                    if (!event.data.mariaId.includes('agi-workspace-root')) {
                        vm.focusedElementId = event.data.mariaId;
                    }
                }
            };

            this.payloadEnvelope.artifactUri = this.activeArtifactLocation;
            this.fetchArchetypeCatalog();
            this.fetchEntityGrounding();
            this.fetchRegisteredTools();
            this.searchHistoricalIntents('');
        },

        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },

        template: `
            <div class="agi-prompt-editor-docked fit column no-wrap bg-slate-950 text-white overflow-hidden" style="min-height: 540px; border-top: 1px solid #334155;">
                
                <!-- 1. STUDIO HEADER -->
                <div class="row items-center justify-between q-pa-xs bg-black" style="border-bottom: 1px solid #1e293b;">
                    <!-- Left: Identity & Artifact Coordinate -->
                    <div class="row items-center q-gutter-x-sm">
                        <q-icon name="psychology" color="primary" size="sm" />
                        <span class="text-subtitle2 text-weight-bold font-mono text-cyan-3">AGI STUDIO</span>
                        <q-badge color="deep-purple-8" :label="targetComponent" class="font-mono text-caption" />
                        
                        <q-separator vertical dark class="q-mx-xs" />
                        
                        <div class="row items-center q-gutter-x-xs font-mono text-caption text-slate-300">
                            <q-icon name="code" size="xs" color="cyan-4" />
                            <span class="text-weight-bold">{{ currentArtifactLabel }}</span>
                            <q-btn flat round dense icon="folder_open" size="xs" color="cyan-4" @click="showPalette = !showPalette">
                                <q-tooltip>Switch Artifact</q-tooltip>
                            </q-btn>
                        </div>
                    </div>

                    <!-- Center: Viewport Switcher -->
                    <div class="row items-center q-gutter-x-xs">
                        <span class="text-caption font-mono text-slate-400" style="font-size: 10px;">VIEWPORTS:</span>
                        <q-btn 
                            v-for="ed in availableEditors" 
                            :key="ed.name"
                            flat dense no-caps
                            :icon="ed.icon"
                            :label="ed.label"
                            :color="ed.color"
                            size="xs"
                            class="font-mono q-px-xs"
                            @click="bringEditorIntoView(ed.name)"
                        >
                            <q-tooltip>Focus {{ ed.label }} in AgiWorkspace</q-tooltip>
                        </q-btn>
                    </div>

                    <!-- Right: Mode Select & Dismiss -->
                    <div class="row items-center q-gutter-x-xs">
                        <q-select
                            v-model="currentMode"
                            :options="assistModes"
                            emit-value map-options dense outlined dark
                            color="amber-4" 
                            bg-color="slate-900"
                            style="min-width: 130px; border: 1px solid #475569; border-radius: 4px;"
                            class="font-mono text-caption"
                            popup-content-class="bg-slate-900 text-white font-mono text-caption"
                        >
                            <template v-slot:selected-item="scope">
                                <span class="text-weight-bold text-amber-3 font-mono text-caption">
                                    {{ scope.opt.label }}
                                </span>
                            </template>
                        </q-select>
                        <q-btn flat round dense icon="close" text-color="white" size="xs" @click="$emit('close')">
                            <q-tooltip>Close Studio</q-tooltip>
                        </q-btn>
                    </div>
                </div>

                <!-- Inline Artifact Palette Drawer -->
                <q-slide-transition>
                    <div v-if="showPalette" class="bg-slate-900 q-pa-xs" style="border-bottom: 1px solid #334155;">
                        <component 
                            v-if="hasPaletteComp" 
                            :is="editorConstructors.AgiArtifactPalette" 
                            @artifact-selected="onArtifactSelected" 
                        />
                    </div>
                </q-slide-transition>

                <!-- 2. ANCHORED PROMPT BAR -->
                <div class="bg-slate-900 q-pa-sm" style="border-bottom: 1px solid #334155;">
                    <div class="row items-start q-col-gutter-sm">
                        <div class="col">
                            <q-input 
                                v-model="userPrompt" 
                                type="textarea"
                                rows="2"
                                dark outlined dense 
                                placeholder="State intent, requirements, or directives (Ctrl+Enter to dispatch)..."
                                class="font-mono text-caption"
                                style="background-color: #020617; border-radius: 4px;"
                                input-style="color: #f8fafc; font-family: monospace; font-size: 11px;"
                                :disable="isExecuting"
                                @keydown.ctrl.enter="handleDirectDispatch"
                            />
                        </div>
                        <div class="col-auto column q-gutter-y-xs" style="min-width: 150px;">
                            <q-btn 
                                :color="modeActionColor" 
                                :icon="modeActionIcon" 
                                :label="modeActionLabel" 
                                no-caps 
                                class="q-px-md font-mono text-weight-bold full-width" 
                                style="height: 38px;"
                                :loading="isExecuting" 
                                @click="handleDirectDispatch" 
                            />
                            <q-btn 
                                v-if="currentMode === 'plan' && lastParsedResult?.status === 'PLANNED'"
                                color="amber-10" 
                                text-color="black"
                                icon="upgrade" 
                                label="Promote to Build" 
                                dense no-caps
                                class="font-mono text-caption text-weight-bold"
                                @click="promotePlanToBuild"
                            />
                        </div>
                    </div>
                </div>

                <!-- 3. HIGH-CONTRAST TAB STRIP -->
                <div class="bg-slate-900 q-px-xs" style="border-bottom: 1px solid #475569; background-color: #0f172a;">
                    <q-tabs
                        v-model="activeTab"
                        dense no-caps inline-label
                        align="left"
                        active-color="cyan-3"
                        active-bg-color="slate-800"
                        indicator-color="cyan-4"
                        class="text-grey-4 font-mono text-caption"
                        style="min-height: 36px;"
                    >
                        <!-- Tab 1: Intent Ledger & History (Leftmost) -->
                        <q-tab 
                            name="history" 
                            icon="history" 
                            label="Intent Ledger &amp; History" 
                            class="q-px-md text-weight-medium"
                            :class="activeTab === 'history' ? 'text-cyan-3 text-weight-bolder' : 'text-slate-300'"
                            style="border-right: 1px solid #334155;"
                        />
                        <!-- Tab 2: Staged Input Payload -->
                        <q-tab 
                            name="payload" 
                            icon="tune" 
                            label="Staged Input Payload" 
                            class="q-px-md text-weight-medium"
                            :class="activeTab === 'payload' ? 'text-cyan-3 text-weight-bolder' : 'text-slate-300'"
                            style="border-right: 1px solid #334155;"
                        />
                        <!-- Tab 3: Parsed Output Result -->
                        <q-tab 
                            name="result" 
                            icon="fact_check" 
                            label="Parsed Output Result" 
                            class="q-px-md text-weight-medium"
                            :class="activeTab === 'result' ? 'text-cyan-3 text-weight-bolder' : 'text-slate-300'"
                            style="border-right: 1px solid #334155;"
                        >
                            <q-badge v-if="lastParsedResult" color="positive" floating rounded style="top: 4px; right: 4px;" />
                        </q-tab>
                        <!-- Tab 4: MCP Tools & Preferences -->
                        <q-tab 
                            name="mcp" 
                            icon="settings" 
                            label="MCP Tools &amp; Preferences" 
                            class="q-px-md text-weight-medium"
                            :class="activeTab === 'mcp' ? 'text-cyan-3 text-weight-bolder' : 'text-slate-300'"
                        />
                    </q-tabs>
                </div>

                <!-- 4. TAB PANELS -->
                <div class="col overflow-hidden bg-slate-900 font-mono">
                    <q-tab-panels v-model="activeTab" animated class="fit bg-slate-900">
                        
                        <!-- ============================================================= -->
                        <!-- TAB 1: STAGED INPUT PAYLOAD (Nerdish Live Wire Doc / Editor)  -->
                        <!-- ============================================================= -->
                        <q-tab-panel name="payload" class="fit q-pa-none row no-wrap bg-slate-950">
                            
                            <!-- Left Pane: Interactive Wrapped JSON Outline (40% Width) -->
                            <div 
                                class="col-5 column q-pa-sm bg-black overflow-y-auto" 
                                style="border-right: 1px solid #334155; min-width: 280px; max-width: 440px; font-family: monospace; font-size: 11px; line-height: 1.45;"
                            >
                                <div class="row items-center justify-between text-slate-500 q-mb-xs" style="border-bottom: 1px solid #1e293b; padding-bottom: 4px;">
                                    <span class="text-caption text-weight-bold text-slate-400">WIRE_PAYLOAD_ENVELOPE.json</span>
                                    <span class="text-caption text-cyan-4 cursor-pointer" @click="fetchArchetypeCatalog">↻ sync</span>
                                </div>

                                <div class="text-slate-500">{</div>

                                <!-- Member: mode -->
                                <div class="q-pl-sm q-py-xs cursor-pointer hover-bg-dark rounded-borders"
                                     :style="selectedPayloadMember === 'mode' ? 'background-color: #0c4a6e; border-left: 2px solid #38bdf8;' : ''"
                                     @click="selectedPayloadMember = 'mode'">
                                    <span class="text-cyan-4">"mode"</span><span class="text-slate-500">: </span><span class="text-amber-3">"{{ currentMode }}"</span><span class="text-slate-500">,</span>
                                </div>

                                <!-- Member: targetComponent -->
                                <div class="q-pl-sm q-py-xs text-slate-400">
                                    <span class="text-cyan-4">"targetComponent"</span><span class="text-slate-500">: </span><span class="text-teal-3">"{{ targetComponent }}"</span><span class="text-slate-500">,</span>
                                </div>

                                <!-- Member: artifactUri -->
                                <div class="q-pl-sm q-py-xs cursor-pointer hover-bg-dark rounded-borders"
                                     :style="selectedPayloadMember === 'artifactUri' ? 'background-color: #0c4a6e; border-left: 2px solid #38bdf8;' : ''"
                                     style="word-break: break-all; white-space: pre-wrap;"
                                     @click="selectedPayloadMember = 'artifactUri'">
                                    <span class="text-cyan-4">"artifactUri"</span><span class="text-slate-500">: </span><span class="text-teal-2">"{{ activeArtifactLocation || 'null' }}"</span><span class="text-slate-500">,</span>
                                </div>

                                <!-- Member: userPrompt -->
                                <div class="q-pl-sm q-py-xs cursor-pointer hover-bg-dark rounded-borders"
                                     :style="selectedPayloadMember === 'notes' ? 'background-color: #0c4a6e; border-left: 2px solid #38bdf8;' : ''"
                                     style="word-break: break-all; white-space: pre-wrap;"
                                     @click="selectedPayloadMember = 'notes'">
                                    <span class="text-cyan-4">"userPrompt"</span><span class="text-slate-500">: </span><span class="text-slate-300">"{{ userPrompt ? (userPrompt.length > 60 ? userPrompt.substring(0, 57) + '...' : userPrompt) : '' }}"</span><span class="text-slate-500">,</span>
                                </div>

                                <!-- Member: notes (Directives) -->
                                <div class="q-pl-sm q-py-xs cursor-pointer hover-bg-dark rounded-borders"
                                     :style="selectedPayloadMember === 'notes' ? 'background-color: #0c4a6e; border-left: 2px solid #38bdf8;' : ''"
                                     style="word-break: break-all; white-space: pre-wrap;"
                                     @click="selectedPayloadMember = 'notes'">
                                    <span class="text-cyan-4">"notes"</span><span class="text-slate-500">: </span><span class="text-amber-2">"{{ payloadEnvelope.notes || '' }}"</span><span class="text-slate-500">,</span>
                                </div>

                                <!-- Member: recommendedArchetype -->
                                <div class="q-pl-sm q-py-xs cursor-pointer hover-bg-dark rounded-borders"
                                     :style="selectedPayloadMember === 'archetype' ? 'background-color: #0c4a6e; border-left: 2px solid #38bdf8;' : ''"
                                     style="word-break: break-all; white-space: pre-wrap;"
                                     @click="selectedPayloadMember = 'archetype'">
                                    <span class="text-cyan-4">"recommendedArchetype"</span><span class="text-slate-500">: </span><span class="text-cyan-2">"{{ payloadEnvelope.recommendedArchetype || 'master-detail' }}"</span><span class="text-slate-500">,</span>
                                </div>

                                <!-- Member: selectedEntities -->
                                <div class="q-pl-sm q-py-xs cursor-pointer hover-bg-dark rounded-borders"
                                     :style="selectedPayloadMember === 'entities' ? 'background-color: #0c4a6e; border-left: 2px solid #38bdf8;' : ''"
                                     style="word-break: break-all; white-space: pre-wrap;"
                                     @click="selectedPayloadMember = 'entities'">
                                    <span class="text-cyan-4">"selectedEntities"</span><span class="text-slate-500">: [</span>
                                    <span class="text-teal-3">{{ (payloadEnvelope.selectedEntities || []).join(', ') }}</span>
                                    <span class="text-slate-500">],</span>
                                </div>

                                <!-- Member: facets -->
                                <div class="q-pl-sm q-py-xs cursor-pointer hover-bg-dark rounded-borders"
                                     :style="selectedPayloadMember === 'facets' ? 'background-color: #0c4a6e; border-left: 2px solid #38bdf8;' : ''"
                                     style="word-break: break-all; white-space: pre-wrap;"
                                     @click="selectedPayloadMember = 'facets'">
                                    <span class="text-cyan-4">"facets"</span><span class="text-slate-500">: {</span>
                                    <div v-for="(v, k) in payloadEnvelope.facets" :key="k" class="q-pl-md">
                                        <span class="text-purple-3">"{{ k }}"</span><span class="text-slate-500">: </span><span class="text-amber-2">"{{ v }}"</span><span class="text-slate-500">,</span>
                                    </div>
                                    <span class="text-slate-500">}</span>
                                </div>

                                <div class="text-slate-500">}</div>
                            </div>

                            <!-- Right Pane: Active Member Detail Editor (60% Width) -->
                            <div class="col column q-pa-md bg-slate-900 overflow-y-auto">
                                
                                <!-- 1. DIRECTIVES & NOTES EDITOR -->
                                <div v-if="selectedPayloadMember === 'notes'" class="column fit">
                                    <div class="text-caption text-weight-bold text-amber-4 q-mb-xs">ADDITIONAL DIRECTIVES &amp; NOTES</div>
                                    <div class="text-caption text-slate-400 q-mb-sm" style="font-size: 10px;">
                                        Payload notes injected directly into prompt directives without ad-hoc string formatting[cite: 3].
                                    </div>
                                    <q-input 
                                        v-model="payloadEnvelope.notes" 
                                        type="textarea" 
                                        dark outlined 
                                        class="col font-mono text-caption"
                                        style="background-color: #020617; border: 1px solid #475569; border-radius: 4px; height: 100%;"
                                        input-style="color: #f8fafc; font-family: monospace; font-size: 12px; line-height: 1.5; resize: none;"
                                        placeholder="Type additional architectural notes, constraints, or UI preferences..."
                                    />
                                </div>

                                <!-- 2. ARCHETYPE PICKER -->
                                <div v-if="selectedPayloadMember === 'archetype'" class="column fit">
                                    <div class="row items-center justify-between q-mb-xs">
                                        <div>
                                            <span class="text-caption text-weight-bold text-cyan-4">CANONICAL ARCHETYPES</span>
                                            <div class="text-caption text-slate-400" style="font-size: 10px;">Select from dynamically discovered workspace blueprints[cite: 9].</div>
                                        </div>
                                        <q-btn flat dense icon="refresh" size="xs" color="cyan-4" label="Rescan" @click="fetchArchetypeCatalog" />
                                    </div>

                                    <div class="row q-gutter-sm q-mt-xs">
                                        <q-card 
                                            v-for="arch in availableArchetypes" 
                                            :key="arch.uri"
                                            clickable v-ripple
                                            class="cursor-pointer bg-slate-950 border-dark"
                                            :style="payloadEnvelope.recommendedArchetype === arch.name ? 'border: 1px solid #06b6d4; background-color: #082f49;' : 'border: 1px solid #334155;'"
                                            style="min-width: 200px; max-width: 250px;"
                                            @click="selectArchetype(arch)"
                                        >
                                            <q-card-section class="q-pa-sm">
                                                <div class="row items-center justify-between">
                                                    <span class="text-caption text-weight-bold text-cyan-3">{{ arch.name }}</span>
                                                    <q-icon v-if="payloadEnvelope.recommendedArchetype === arch.name" name="check_circle" color="cyan-4" size="xs" />
                                                </div>
                                                <div class="text-caption text-slate-400 q-mt-xs" style="font-size: 10px;">{{ arch.description || arch.uri }}</div>
                                            </q-card-section>
                                        </q-card>
                                    </div>
                                </div>

                                <!-- 3. ENTITY PICKER -->
                                <div v-if="selectedPayloadMember === 'entities'" class="column fit">
                                    <div class="text-caption text-weight-bold text-teal-4 q-mb-xs">ENTITY SCHEMAS &amp; GROUNDING</div>
                                    <div class="text-caption text-slate-400 q-mb-sm" style="font-size: 10px;">Entities attached to this payload turn for RAG context[cite: 3].</div>

                                    <q-list dense separator class="bg-slate-950 rounded-borders border-dark">
                                        <q-item v-for="(ent, idx) in detectedEntities" :key="idx" tag="label" class="q-pa-xs">
                                            <q-item-section side top>
                                                <q-checkbox v-model="payloadEnvelope.selectedEntities" :val="ent.entityName" dense color="teal-4" />
                                            </q-item-section>
                                            <q-item-section>
                                                <q-item-label class="text-caption text-weight-bold text-teal-3">{{ ent.entityName }}</q-item-label>
                                                <q-item-label caption class="text-slate-400" style="font-size: 9px;">{{ ent.description || 'Mantle UDM Entity' }}</q-item-label>
                                            </q-item-section>
                                        </q-item>
                                    </q-list>
                                </div>

                                <!-- 4. FACETS EDITOR -->
                                <div v-if="selectedPayloadMember === 'facets'" class="column fit">
                                    <div class="text-caption text-weight-bold text-purple-3 q-mb-xs">INTENT FACETS</div>
                                    <div class="text-caption text-slate-400 q-mb-sm" style="font-size: 10px;">Key-value directives triggering layered instruction overlays[cite: 1, 3].</div>

                                    <div class="row q-gutter-xs q-mb-md">
                                        <q-chip 
                                            v-for="(v, k) in payloadEnvelope.facets" 
                                            :key="k" 
                                            dense size="md" removable 
                                            color="slate-950" text-color="amber-3"
                                            style="border: 1px solid #334155;"
                                            @remove="delete payloadEnvelope.facets[k]"
                                        >
                                            <strong class="text-purple-3">{{ k }}:</strong>&nbsp;{{ v }}
                                        </q-chip>
                                    </div>

                                    <div class="row items-center q-gutter-x-sm bg-slate-950 q-pa-sm rounded-borders" style="max-width: 480px; border: 1px solid #334155;">
                                        <q-input v-model="newFacetKey" dense outlined placeholder="key (e.g. hipaa)" bg-color="slate-900" class="col text-caption text-white" />
                                        <q-input v-model="newFacetVal" dense outlined placeholder="value (e.g. true)" bg-color="slate-900" class="col text-caption text-white" @keydown.enter="addFacet" />
                                        <q-btn dense flat round icon="add" color="amber-4" @click="addFacet" />
                                    </div>
                                </div>

                                <!-- 5. ARTIFACT URI / MODE DETAILS -->
                                <div v-if="selectedPayloadMember === 'artifactUri' || selectedPayloadMember === 'mode'" class="column fit">
                                    <div class="text-caption text-weight-bold text-cyan-4 q-mb-xs">TARGET COORDINATE &amp; MODE</div>
                                    <q-input 
                                        v-model="activeArtifactLocation" 
                                        label="Target Artifact Location"
                                        dark outlined dense 
                                        bg-color="slate-950" 
                                        class="text-caption font-mono q-mb-md"
                                        @update:model-value="val => payloadEnvelope.artifactUri = val"
                                    />
                                </div>

                            </div>
                        </q-tab-panel>

                        <!-- ============================================================= -->
                        <!-- TAB 2: PARSED OUTPUT RESULT (Clean, Dedicated State)          -->
                        <!-- ============================================================= -->
                        <q-tab-panel name="result" class="fit q-pa-md overflow-y-auto">
                            <!-- Empty / Awaiting State -->
                            <div v-if="!lastParsedResult" class="column items-center justify-center fit text-slate-500 italic text-caption">
                                <q-icon name="hourglass_empty" size="48px" class="q-mb-sm text-slate-600" />
                                <div>Awaiting turn execution response. Dispatch a Plan or Build prompt above to inspect results.</div>
                            </div>

                            <!-- Populated Result Viewport -->
                            <div v-else class="column q-gutter-y-md">
                                <div class="row items-center justify-between bg-slate-950 q-pa-sm rounded-borders" style="border: 1px solid #334155;">
                                    <div class="row items-center q-gutter-x-sm">
                                        <q-badge :color="lastParsedResult.status === 'PLANNED' ? 'amber-9' : 'positive'" :label="lastParsedResult.status" class="text-subtitle2 q-px-sm" />
                                        <span class="text-caption text-slate-300">Target: {{ lastParsedResult.createdArtifactUri || lastParsedResult.targetArtifactUri }}</span>
                                    </div>
                                    <q-badge v-if="lastParsedResult.recommendedArchetype" color="cyan-9" :label="'Archetype: ' + lastParsedResult.recommendedArchetype" />
                                </div>

                                <div v-if="lastParsedResult.formulationSteps && lastParsedResult.formulationSteps.length > 0" class="column q-gutter-y-xs">
                                    <div class="text-subtitle2 text-cyan-4 font-mono text-weight-bold">FORMULATION IMPLEMENTATION STEPS</div>
                                    <q-list dense separator class="bg-black rounded-borders" style="border: 1px solid #1e293b;">
                                        <q-item v-for="(step, sIdx) in lastParsedResult.formulationSteps" :key="sIdx" class="q-pa-sm">
                                            <q-item-section avatar min-width="24px">
                                                <q-icon name="check_circle" color="teal-4" size="xs" />
                                            </q-item-section>
                                            <q-item-section class="text-caption text-slate-200">{{ step }}</q-item-section>
                                        </q-item>
                                    </q-list>
                                </div>

                                <div v-if="lastParsedResult.architectureSummary" class="q-pa-sm bg-black rounded-borders" style="border: 1px solid #1e293b;">
                                    <div class="text-caption text-weight-bold text-amber-4 q-mb-xs">ARCHITECTURAL SUMMARY</div>
                                    <div class="text-caption text-slate-200" style="line-height: 1.5;">{{ lastParsedResult.architectureSummary }}</div>
                                </div>

                                <div v-if="lastParsedResult.rawXmlContent" class="column q-gutter-y-xs">
                                    <div class="text-caption text-weight-bold text-cyan-4">GENERATED XML (BUFFER DRAFT)</div>
                                    <pre class="bg-black text-slate-200 q-pa-sm rounded-borders overflow-auto text-caption" style="max-height: 250px; border: 1px solid #1e293b;">{{ lastParsedResult.rawXmlContent }}</pre>
                                </div>
                            </div>
                        </q-tab-panel>

                        <!-- ============================================================= -->
                        <!-- TAB 3: INTENT HISTORY & LEDGER (Smart One-Click Re-staging)   -->
                        <!-- ============================================================= -->
                        <!-- TOP ANCHOR: HISTORICAL INSPECTION NOTICE BANNER -->
                        <div v-if="inspectingHistoryId" class="row items-center justify-between q-px-md q-py-xs bg-amber-10 text-black font-mono text-caption text-weight-bolder">
                            <div class="row items-center q-gutter-x-sm">
                                <q-icon name="history_edu" size="sm" color="black" />
                                <span>INSPECTING HISTORICAL INTENT #{{ inspectingHistoryId }} (READ ONLY SNAPSHOT)</span>
                            </div>
                            <div class="row items-center q-gutter-x-xs">
                                <q-btn dense flat no-caps size="xs" color="black" icon="restore" label="Return to Current Prompt" class="bg-amber-3 text-weight-bolder q-px-sm" @click="restoreCurrentPrompt" />
                            </div>
                        </div>
                        
                        <!-- TOP OF ILH TAB: BAR & FILTER DRAWER -->
                        <q-tab-panel name="history" class="fit q-pa-none column overflow-hidden bg-slate-950">
                            
                            <!-- ILH Sub-Toolbar -->
                            <div class="row items-center justify-between q-pa-xs bg-slate-900 border-bottom-dark" style="border-bottom: 1px solid #334155;">
                                <div class="row items-center q-gutter-x-xs">
                                    <q-btn 
                                        :color="inspectingHistoryId ? 'slate-800' : 'cyan-8'" 
                                        :text-color="inspectingHistoryId ? 'slate-400' : 'white'"
                                        icon="edit_note" 
                                        label="Current Prompt" 
                                        dense no-caps 
                                        size="sm"
                                        class="font-mono text-weight-bold q-px-sm"
                                        @click="restoreCurrentPrompt"
                                    >
                                        <q-tooltip>Return to active uncommitted prompt scratchpad</q-tooltip>
                                    </q-btn>
                                    <q-badge v-if="!inspectingHistoryId" color="positive" label="Active" class="font-mono text-caption" />
                                </div>
                        
                                <div class="row items-center q-gutter-x-xs">
                                    <q-btn flat dense icon="filter_alt" :color="showHistoryFilterDrawer ? 'cyan-4' : 'slate-400'" label="Search &amp; Filters" size="xs" @click="showHistoryFilterDrawer = !showHistoryFilterDrawer" />
                                    <q-btn flat dense icon="refresh" color="cyan-4" label="Refresh" size="xs" @click="searchHistoricalIntents" />
                                </div>
                            </div>
                        
                            <!-- Collapsible Search & Filter Tray -->
                            <q-slide-transition>
                                <div v-if="showHistoryFilterDrawer" class="q-pa-sm bg-black border-bottom-dark row q-col-gutter-sm items-center" style="border-bottom: 1px solid #334155;">
                                    <div class="col-4">
                                        <q-input v-model="historyFilter.searchTerm" dense outlined dark placeholder="Search prompt text, entity, or keyword..." class="font-mono text-caption" bg-color="slate-950" @keydown.enter="searchHistoricalIntents" />
                                    </div>
                                    <div class="col-2">
                                        <q-select v-model="historyFilter.mode" :options="['', 'plan', 'build', 'test', 'discuss']" dense outlined dark label="Mode" bg-color="slate-950" class="font-mono text-caption" />
                                    </div>
                                    <div class="col-2">
                                        <q-input v-model="historyFilter.fromDate" dense outlined dark type="date" label="From" bg-color="slate-950" class="font-mono text-caption" />
                                    </div>
                                    <div class="col-2">
                                        <q-input v-model="historyFilter.toDate" dense outlined dark type="date" label="To" bg-color="slate-950" class="font-mono text-caption" />
                                    </div>
                                    <div class="col-2 row items-center justify-end q-gutter-x-xs">
                                        <q-checkbox v-model="historyFilter.currentArtifactOnly" label="This Screen" dense dark color="cyan-4" class="text-caption font-mono text-slate-300" />
                                        <q-btn color="cyan-9" icon="search" dense size="sm" @click="searchHistoricalIntents" />
                                    </div>
                                </div>
                            </q-slide-transition>
                        
                            <!-- Quasar Data Table -->
                            <div class="col fit overflow-hidden">
                                <q-table
                                    :rows="matchingHistoricalPayloads"
                                    :columns="historyColumns"
                                    row-key="agiPayloadId"
                                    v-model:pagination="pagination"
                                    dense dark flat
                                    class="fit bg-slate-950 font-mono text-caption"
                                    table-class="text-slate-200"
                                    table-header-class="bg-slate-900 text-cyan-4 font-mono text-weight-bold"
                                    :selected-rows-label="() => ''"
                                    @row-click="onHistoryRowClick"
                                >
                                    <!-- Mode Chip -->
                                    <template v-slot:body-cell-modeEnumId="props">
                                        <q-td :props="props">
                                            <q-badge :color="getModeBadgeColor(props.value)" :label="formatMode(props.value)" class="text-weight-bold" />
                                        </q-td>
                                    </template>
                        
                                    <!-- Status Chip -->
                                    <template v-slot:body-cell-statusId="props">
                                        <q-td :props="props">
                                            <q-badge :color="props.value === 'AasActive' || props.value === 'SUCCESS' ? 'positive' : (props.value === 'PLANNED' ? 'amber-9' : 'slate-700')" :label="props.value" />
                                        </q-td>
                                    </template>
                        
                                    <!-- Actions Cell -->
                                    <template v-slot:body-cell-actions="props">
                                        <q-td :props="props" class="q-gutter-x-xs">
                                            <q-btn flat dense size="xs" color="cyan-3" icon="tune" label="Input" @click.stop="inspectHistoricalTurn(props.row, 'payload')">
                                                <q-tooltip>Show Staged Input Payload in Input tab</q-tooltip>
                                            </q-btn>
                                            <q-btn flat dense size="xs" color="teal-3" icon="fact_check" label="Output" @click.stop="inspectHistoricalTurn(props.row, 'result')">
                                                <q-tooltip>Show Parsed Output Result in Output tab</q-tooltip>
                                            </q-btn>
                                        </q-td>
                                    </template>
                                    <template v-slot:body-cell-userPromptText="props">
                                        <q-td :props="props" class="ellipsis font-mono" style="max-width: 480px;">
                                            <span :title="props.row.userPromptText">{{ props.value }}</span>
                                        </q-td>
                                    </template>
                                </q-table>
                            </div>
                        </q-tab-panel>

                        <!-- ============================================================= -->
                        <!-- TAB 4: MCP TOOLS & PREFERENCES                                -->
                        <!-- ============================================================= -->
                        <q-tab-panel name="mcp" class="fit q-pa-sm overflow-y-auto">
                            <div class="text-caption text-weight-bold text-cyan-4 q-mb-xs">DISCOVERED MCP TOOLS</div>
                            <q-list dense separator class="bg-black rounded-borders" style="border: 1px solid #1e293b;">
                                <q-item v-for="tool in registeredMcpTools" :key="tool.name" class="q-pa-xs">
                                    <q-item-section avatar min-width="24px">
                                        <q-icon :name="tool.readOnly ? 'visibility' : 'build'" :color="tool.readOnly ? 'cyan-4' : 'amber-4'" size="xs" />
                                    </q-item-section>
                                    <q-item-section>
                                        <q-item-label class="text-caption font-mono text-white">{{ tool.name }}</q-item-label>
                                        <q-item-label caption class="text-slate-400" style="font-size: 9px;">{{ tool.description }}</q-item-label>
                                    </q-item-section>
                                    <q-item-section side>
                                        <q-badge :color="tool.readOnly ? 'cyan-9' : 'amber-9'" :label="tool.readOnly ? 'Read Only' : 'Mutation'" />
                                    </q-item-section>
                                </q-item>
                            </q-list>
                        </q-tab-panel>

                    </q-tab-panels>
                </div>

            </div>
        `,

        methods: {
            resolveCsrfToken() {
                return window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || "";
            },

            bringEditorIntoView(panelName) {
                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'focus-editor-panel',
                        panelName: panelName
                    });
                }
            },

            addFacet() {
                if (!this.newFacetKey.trim()) return;
                this.payloadEnvelope.facets[this.newFacetKey.trim()] = this.newFacetVal.trim();
                this.newFacetKey = '';
                this.newFacetVal = '';
            },

            selectArchetype(arch) {
                this.payloadEnvelope.recommendedArchetype = arch.name;
                this.payloadEnvelope.recommendedArchetypeUri = arch.uri;
            },

            async fetchArchetypeCatalog() {
                const headers = { 'moquiSessionToken': this.resolveCsrfToken() };
                try {
                    const resp = await axios.get('/rest/s1/agi-ai/mcp/resources', {
                        params: { category: 'screen', subCategory: 'archetype' },
                        headers
                    });
                    this.availableArchetypes = resp.data?.resources || [];
                } catch (e) {
                    console.warn("Could not load archetypes:", e);
                }
            },

            async fetchEntityGrounding() {
                this.detectedEntities = [
                    { entityName: 'mantle.party.Party', description: 'Base Mantle Party identity' },
                    { entityName: 'mantle.party.Person', description: 'Demographic Person record' },
                    { entityName: 'mantle.party.PartyRole', description: 'Role binding (e.g. Resident)' },
                    { entityName: 'mantle.facility.Facility', description: 'Clinical Facility / Room' },
                    { entityName: 'nursinghome.clinical.PatientPrescription', description: 'Active clinical prescription' },
                    { entityName: 'nursinghome.clinical.PatientAllergy', description: 'Patient allergy and reaction' }
                ];
            },

            async fetchRegisteredTools() {
                const headers = { 'moquiSessionToken': this.resolveCsrfToken() };
                try {
                    const resp = await axios.get('/rest/s1/agi-ai/mcp/tools', { headers });
                    this.registeredMcpTools = resp.data?.tools || [];
                } catch (e) {
                    console.warn("Could not load MCP tools:", e);
                }
            },

            async searchHistoricalIntents(term = '') {
                const headers = { 'moquiSessionToken': this.resolveCsrfToken() };
                try {
                    const resp = await axios.get('/rest/s1/agi-ai/payloads', {
                        params: { searchTerm: term, targetComponent: this.targetComponent },
                        headers
                    });
                    this.matchingHistoricalPayloads = resp.data?.payloadList || [];
                } catch (e) {
                    console.warn("Could not load history:", e);
                }
            },

            async lazyLoadHistoryDetail(payloadId) {
                if (this.historyDetailCache[payloadId]) return;
                const headers = { 'moquiSessionToken': this.resolveCsrfToken() };
                try {
                    const resp = await axios.get('/rest/s1/agi-ai/payload', {
                        params: { agiPayloadId: payloadId },
                        headers
                    });
                    this.historyDetailCache[payloadId] = resp.data?.payloadDetails || resp.data;
                } catch (e) { }
            },

            restageHistoricalTurn(pld) {
                const cached = this.historyDetailCache[pld.agiPayloadId] || {};
                const storedPld = cached.payload || {};

                this.userPrompt = pld.userPromptText || storedPld.userPromptText || '';
                if (pld.modeEnumId) this.currentMode = pld.modeEnumId.replace('Aam', '').toLowerCase();

                this.payloadEnvelope.notes = storedPld.notes || '';
                this.payloadEnvelope.recommendedArchetype = storedPld.recommendedArchetype || '';
                this.payloadEnvelope.recommendedArchetypeUri = storedPld.recommendedArchetypeUri || '';
                this.payloadEnvelope.selectedEntities = storedPld.selectedEntities || [];
                this.payloadEnvelope.facets = storedPld.facets || pld.facets || {};

                if (pld.artifactUri) {
                    this.activeArtifactLocation = pld.artifactUri;
                    this.payloadEnvelope.artifactUri = pld.artifactUri;
                }

                this.activeTab = 'payload';
                this.$q?.notify({
                    type: 'info',
                    message: 'Re-staged historical turn into Staged Input Payload.'
                });
            },

            promotePlanToBuild() {
                this.currentMode = 'build';
                this.payloadEnvelope.mode = 'build';
                this.activeTab = 'payload';
                this.$q?.notify({
                    type: 'positive',
                    message: 'Promoted Plan to Build Mode. Ready for AST code mutation dispatch[cite: 3].'
                });
            },

            async handleDirectDispatch() {
                if (!this.userPrompt.trim()) return;

                this.isExecuting = true;
                this.lastParsedResult = null; // Clear previous result on fresh dispatch
                const tkn = this.resolveCsrfToken();
                const headers = { 'moquiSessionToken': tkn, 'Content-Type': 'application/json' };

                const dispatchBody = {
                    agiPayloadId: this.payloadEnvelope.agiPayloadId,
                    mode: this.currentMode,
                    artifactUri: this.activeArtifactLocation,
                    targetComponent: this.targetComponent,
                    focusCoordinate: this.focusedElementId || null,
                    userPrompt: this.userPrompt.trim(),
                    adHocPrompt: this.payloadEnvelope.notes,
                    facets: this.payloadEnvelope.facets,
                    selectedArchetypes: this.payloadEnvelope.recommendedArchetypeUri ? [this.payloadEnvelope.recommendedArchetypeUri] : [],
                    selectedEntities: this.payloadEnvelope.selectedEntities
                };

                try {
                    const response = await axios.post('/rest/s1/agi-ide/executeStagedAgentTurn', dispatchBody, { headers });
                    this.isExecuting = false;
                    const res = response.data || {};

                    let parsedRes = res;
                    if (typeof res.completionText === 'string') {
                        try { parsedRes = JSON.parse(res.completionText); } catch (e) { }
                    }

                    this.lastParsedResult = parsedRes;
                    this.activeTab = 'result';

                    if (parsedRes.status === 'PLANNED') {
                        if (parsedRes.targetArtifactUri) {
                            this.activeArtifactLocation = parsedRes.targetArtifactUri;
                            this.payloadEnvelope.artifactUri = parsedRes.targetArtifactUri;
                        }
                        if (parsedRes.recommendedArchetype) {
                            this.payloadEnvelope.recommendedArchetype = parsedRes.recommendedArchetype;
                        }
                        if (Array.isArray(parsedRes.suggestedEntities)) {
                            this.payloadEnvelope.selectedEntities = parsedRes.suggestedEntities;
                        }
                        this.$q?.notify({ type: 'info', message: 'Architectural Plan formulated. Review results.' });
                    } else if (parsedRes.status === 'SUCCESS') {
                        if (this.contextBus) {
                            this.contextBus.postMessage({
                                event: 'artifact-state-mutated',
                                artifactUri: parsedRes.targetArtifactUri || this.activeArtifactLocation,
                                rawXmlText: parsedRes.rawXmlContent || ''
                            });
                        }
                        this.$q?.notify({ type: 'positive', message: 'Turn applied to Workspace Buffer draft.' });
                    }

                } catch (err) {
                    this.isExecuting = false;
                    this.$q?.notify({ type: 'negative', message: err.response?.data?.errors || err.message || 'Turn dispatch failed.' });
                }
            },
            // Switches from Historical Inspection to the active working draft
            restoreCurrentPrompt() {
                this.inspectingHistoryId = null;
                this.userPrompt = this.currentPromptState.userPrompt;
                this.currentMode = this.currentPromptState.currentMode;
                this.activeArtifactLocation = this.currentPromptState.activeArtifactLocation;
                this.focusedElementId = this.currentPromptState.focusedElementId;
                this.payloadEnvelope = JSON.parse(JSON.stringify(this.currentPromptState.payloadEnvelope));
                this.lastParsedResult = null;
                this.activeTab = 'payload';
                this.$q?.notify({ type: 'info', message: 'Restored active working prompt.' });
            },

            // Load a historical row into the viewing state
            async inspectHistoricalTurn(row, targetTab = 'payload') {
                this.inspectingHistoryId = row.agiPayloadId;

                // Fetch full payload details if not cached
                if (!this.historyDetailCache[row.agiPayloadId]) {
                    await this.lazyLoadHistoryDetail(row.agiPayloadId);
                }
                const fullDetail = this.historyDetailCache[row.agiPayloadId] || {};
                const storedPld = fullDetail.payload || {};
                const storedRes = fullDetail.result || fullDetail.parsedResult || {};

                // Hydrate viewing controls
                this.userPrompt = row.userPromptText || storedPld.userPrompt || '';
                if (row.modeEnumId) this.currentMode = row.modeEnumId.replace('Aam', '').toLowerCase();
                if (row.artifactUri) this.activeArtifactLocation = row.artifactUri;

                this.payloadEnvelope = {
                    agiPayloadId: row.agiPayloadId,
                    mode: this.currentMode,
                    targetComponent: this.targetComponent,
                    artifactUri: row.artifactUri || '',
                    notes: storedPld.notes || '',
                    recommendedArchetype: storedPld.recommendedArchetype || '',
                    recommendedArchetypeUri: storedPld.recommendedArchetypeUri || '',
                    selectedEntities: storedPld.selectedEntities || [],
                    facets: storedPld.facets || {}
                };

                this.lastParsedResult = storedRes;
                this.activeTab = targetTab;
            },

            // Intelligent paste from Staged Input into the active scratchpad
            copyInputToCurrentPrompt() {
                this.currentPromptState.payloadEnvelope = JSON.parse(JSON.stringify(this.payloadEnvelope));
                this.currentPromptState.userPrompt = this.userPrompt;
                this.currentPromptState.currentMode = this.currentMode;
                this.currentPromptState.activeArtifactLocation = this.activeArtifactLocation;
                this.$q?.notify({ type: 'positive', message: 'Copied staged input values to Current Prompt.' });
            },

            // Intelligent paste from Parsed Output into the active scratchpad
            pasteOutputToCurrentPrompt() {
                if (!this.lastParsedResult) return;
                const res = this.lastParsedResult;

                // Smart Field Alignment
                if (res.targetArtifactUri || res.cleanArtifactUri) {
                    this.currentPromptState.activeArtifactLocation = res.cleanArtifactUri || res.targetArtifactUri;
                    this.currentPromptState.payloadEnvelope.artifactUri = this.currentPromptState.activeArtifactLocation;
                }
                if (res.recommendedArchetype) {
                    this.currentPromptState.payloadEnvelope.recommendedArchetype = res.recommendedArchetype;
                    this.currentPromptState.payloadEnvelope.recommendedArchetypeUri = res.recommendedArchetypeUri || '';
                }
                if (Array.isArray(res.suggestedEntities)) {
                    this.currentPromptState.payloadEnvelope.selectedEntities = [...res.suggestedEntities];
                }
                if (res.formulationSteps && res.formulationSteps.length > 0) {
                    const stepsText = res.formulationSteps.join('\n');
                    this.currentPromptState.payloadEnvelope.notes = (this.currentPromptState.payloadEnvelope.notes ? this.currentPromptState.payloadEnvelope.notes + '\n\n' : '') + stepsText;
                } else if (res.architectureSummary) {
                    this.currentPromptState.payloadEnvelope.notes = (this.currentPromptState.payloadEnvelope.notes ? this.currentPromptState.payloadEnvelope.notes + '\n\n' : '') + res.architectureSummary;
                }

                this.$q?.notify({ type: 'positive', message: 'Intelligently mapped Parsed Output into Current Prompt.' });
            },
            // Badge color mapping for execution/artifact modes
            getModeBadgeColor(mode) {
                if (!mode) return 'grey-7';
                switch (mode.toLowerCase()) {
                    case 'execute':
                    case 'run':
                        return 'positive';
                    case 'generate':
                    case 'create':
                        return 'primary';
                    case 'modify':
                    case 'patch':
                        return 'warning';
                    case 'plan':
                    case 'analyze':
                        return 'secondary';
                    case 'error':
                    case 'failed':
                        return 'negative';
                    default:
                        return 'blue-grey-6';
                }
            },
            formatMode(modeEnumId) {
                if (!modeEnumId) return 'N/A';
                // Handles enum IDs like 'AamPlan', 'AamBuild', or raw strings like 'plan'
                const clean = modeEnumId.toString().replace(/^Aam/, '').trim();
                return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
            },
            onHistoryRowClick(evt, row) {
                // Avoid double-firing if an action button inside the row was clicked
                if (evt.target.closest('.q-btn') || evt.target.closest('button')) return;

                // Loads the selected record into the top banner, mode selector, and active panels
                this.inspectHistoricalTurn(row, 'payload');
            },
        },
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