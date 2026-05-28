// runtime/component/agi-ide/screen/agi-ide/assets/IdeWorkspaceComponent.qvt.js
(function () {
    window.webmcpConfig = { hideTrigger: true, headless: true };

    const componentDef = {
        name: 'IdeWorkspaceComponent',

        data() {
            return {
                activeComponent: null,
                showCommandPalette: false,

                canvasTransform: { x: 0, y: 0, scale: 1 },
                isPanning: false,
                panStart: { x: 0, y: 0 },

                telemetryLogs: [
                    { timestamp: new Date().toLocaleTimeString(), type: 'info', text: '📡 [ORCHESTRATOR] Blueprint Loom initialized successfully.' },
                    { timestamp: new Date().toLocaleTimeString(), type: 'success', text: '⚡ [BROADCAST] AgiAgentBus channel bound to local window thread.' }
                ],

                availableApps: [],
                activeGraphNodes: [],

                globalHubs: [
                    { id: 'aitree', label: 'AITree Framework Platform', x: 200, y: 150, color: '#3f51b5', description: 'Core Clinical & Communication Platform' },
                    { id: 'nursing-home', label: 'Nursing Home Management System', x: 550, y: 150, color: '#00897b', description: 'HIPAA & Compliance Domain' },
                    { id: 'agi-ai', label: 'AGI Unified AI Component', x: 375, y: 400, color: '#9c27b0', description: 'AI Engine Data Mappings' }
                ]
            }
        },

        mounted() {
            console.info("🎨 [BLUEPRINT LOOM] Initializing modern orchestration canvas plane...");
            this.fetchAvailableApps();
            this.initAgentBus();
        },

        methods: {
            async fetchAvailableApps() {
                try {
                    const response = await fetch('./IdeWorkspace/getAvailableComponents');
                    if (!response.ok) throw new Error(`HTTP status ${response.status}`);
                    const data = await response.json();
                    this.availableApps = data || [];
                } catch (e) {
                    this.logTelemetry('error', `Component discovery failed: ${e.message}`);
                }
            },

            async selectTargetApp(componentId) {
                if (!componentId) {
                    this.activeComponent = null;
                    this.activeGraphNodes = [];
                    this.logTelemetry('info', 'Switched context to Global Horizon View.');
                    return;
                }
                this.activeComponent = componentId;
                this.canvasTransform = { x: 0, y: 0, scale: 1 };
                this.logTelemetry('info', `Context shifting to application boundary: [${componentId}]...`);
                await this.fetchComponentTopology(componentId);
            },

            async fetchComponentTopology(componentId) {
                try {
                    const response = await fetch(`./IdeWorkspace/getComponentTopology?targetApp=${encodeURIComponent(componentId)}`);
                    if (!response.ok) throw new Error(`HTTP status ${response.status}`);
                    const data = await response.json();
                    this.activeGraphNodes = data.nodes || [];
                    this.logTelemetry('success', `Loom canvas fully woven. Visualized ${this.activeGraphNodes.length} active architectural artifact nodes for [${componentId}].`);
                } catch (e) {
                    this.activeGraphNodes = [];
                    this.logTelemetry('error', `Failed to extract application topology graph: ${e.message}`);
                }
            },

            initAgentBus() {
                // REMEDIATION: Bind explicitly to window scope to ensure cross-window and console availability
                window.agiAgentBus = new BroadcastChannel('AgiAgentBus');

                window.agiAgentBus.onmessage = (event) => {
                    const { type, agentId, text, status } = event.data;

                    if (type === 'handshake') {
                        this.logTelemetry('success', `🔗 [AMA LINKED] Target container [${agentId}] successfully registered on channel.`);
                        return;
                    }

                    this.logTelemetry('info', `[AMA FEEDBACK - ${agentId}] ${type.toUpperCase()}: ${text}`);
                };
            },

            // TARGETED SPAWNER: Tied explicitly to an individual node's structural footprint
            spawnTargetedAMA(node) {
                // Generate an isolated, completely unique key signature for this specific execution loop
                const cleanLabel = node.label.replace(/[^a-zA-Z0-9]/g, '_');
                const amaId = `ama_${node.type}_${cleanLabel}`;

                this.logTelemetry('info', `Initializing dedicated AMA container context [${amaId}]...`);

                const targetUrl = `./amaTerminal?id=${amaId}&amaContext=${encodeURIComponent(node.type)}`;
                const amaWindow = window.open(targetUrl, amaId, 'width=650,height=550,resizable=yes,scrollbars=yes');

                if (!amaWindow) {
                    this.logTelemetry('error', 'Browser blocked AMA window popup. Please verify popup location permissions.');
                }
            },

            // Update the dispatch method to utilize the global window channel
            dispatchRoutedCommand(node, taskText) {
                if (window.agiAgentBus) {
                    const cleanLabel = node.label.replace(/[^a-zA-Z0-9]/g, '_');
                    const targetAmaId = `ama_${node.type}_${cleanLabel}`;

                    this.logTelemetry('info', `Routing localized intent payload to [${targetAmaId}]...`);

                    window.agiAgentBus.postMessage({
                        amaTarget: targetAmaId,
                        global: false,
                        type: 'command',
                        text: taskText
                    });
                } else {
                    this.logTelemetry('error', 'Communication Failure: Global window.agiAgentBus is not initialized.');
                }
            },

            logTelemetry(type, text) {
                this.telemetryLogs.unshift({ timestamp: new Date().toLocaleTimeString(), type, text });
            },

            startPan(e) {
                if (e.target.classList.contains('loom-infinite-stage') || e.target.classList.contains('loom-grid-overlay')) {
                    this.isPanning = true;
                    this.panStart = { x: e.clientX - this.canvasTransform.x, y: e.clientY - this.canvasTransform.y };
                }
            },
            onPan(e) {
                if (this.isPanning) {
                    this.canvasTransform.x = e.clientX - this.panStart.x;
                    this.canvasTransform.y = e.clientY - this.panStart.y;
                }
            },
            endPan() { this.isPanning = false; },
            handleZoom(e) {
                e.preventDefault();
                const factor = 1.1;
                this.canvasTransform.scale = e.deltaY < 0 ? Math.min(this.canvasTransform.scale * factor, 2) : Math.max(this.canvasTransform.scale / factor, 0.4);
            }
        },

        template: `
            <q-layout view="hHh Lpr fFf" class="blueprint-loom-shell bg-grey-2" style="height: 100vh; overflow: hidden;">
                
                <q-header class="text-white q-py-xs q-px-md shadow-4 row justify-between items-center" style="background: #0f172a; z-index: 2000;">
                    <div class="row items-center q-gutter-sm">
                        <q-icon name="hub" size="sm" color="amber-6" />
                        <div class="text-subtitle1 text-weight-bold" style="font-family: monospace; letter-spacing: 1px;">AGI // BLUEPRINT LOOM</div>
                    </div>
                    
                    <div class="row items-center">
                        <q-select 
                            dark dense outlined options-dense bg-color="slate-800"
                            label="Target Domain Scope"
                            v-model="activeComponent"
                            :options="availableApps"
                            emit-value map-options
                            @update:model-value="selectTargetApp"
                            style="min-width: 280px;"
                        />
                    </div>
                </q-header>

                <q-page-container>
                    <q-page class="relative-position overflow-hidden loom-infinite-stage"
                         @mousedown="startPan" @mousemove="onPan" @mouseup="endPan" @mouseleave="endPan" @wheel="handleZoom"
                         style="height: calc(100vh - 120px); cursor: grab; user-select: none; background-color: #0f172a;">
                        
                        <div class="absolute-full pointer-events-none loom-grid-overlay" 
                             :style="{
                                 backgroundImage: 'radial-gradient(#334155 1.5px, transparent 1.5px)',
                                 backgroundSize: (30 * canvasTransform.scale) + 'px ' + (30 * canvasTransform.scale) + 'px',
                                 backgroundPosition: canvasTransform.x + 'px ' + canvasTransform.y + 'px'
                             }">
                        </div>

                        <div class="loom-transform-layer absolute"
                             :style="{ transform: 'translate(' + canvasTransform.x + 'px, ' + canvasTransform.y + 'px) scale(' + canvasTransform.scale + ')' }">
                            
                            <template v-if="!activeComponent">
                                <q-card v-for="hub in globalHubs" :key="hub.id"
                                        class="absolute text-white shadow-24 cursor-pointer"
                                        @click="selectTargetApp(hub.id)"
                                        :style="{ left: hub.x + 'px', top: hub.y + 'px', width: '280px', background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }">
                                    <q-card-section class="q-pa-md">
                                        <div class="row items-center q-gutter-sm q-mb-xs">
                                            <q-icon name="token" :style="{ color: hub.color }" size="sm" />
                                            <div class="text-subtitle2 font-weight-bold text-grey-2">{{ hub.label }}</div>
                                        </div>
                                        <div class="text-caption text-grey-5">{{ hub.description }}</div>
                                    </q-card-section>
                                </q-card>
                            </template>

                            <template v-else>
                                <q-card v-for="node in activeGraphNodes" :key="node.id"
                                        class="absolute text-white shadow-12"
                                        :style="{ left: node.x + 'px', top: node.y + 'px', width: '280px', background: '#1e293b', border: '1px solid #475569', borderRadius: '6px' }">
                                    
                                    <q-card-section class="q-py-xs q-px-sm bg-slate-800 row justify-between items-center" style="background: #273549; border-bottom: 1px solid #475569;">
                                        <div class="row items-center q-gutter-xs">
                                            <q-icon :name="node.type === 'screen' ? 'wallpaper' : 'dns'" color="amber-6" size="xs" />
                                            <span class="text-caption font-weight-bold monospace text-grey-2" style="font-size: 11px;">{{ node.label }}</span>
                                        </div>
                                    </q-card-section>
                                    
                                    <q-card-section class="q-pa-sm column q-gutter-xs">
                                        <q-btn color="cyan-7" text-color="slate-900" size="xs" label="Spawn Agent Actuator (AMA)" icon="launch" @click="spawnTargetedAMA(node)" class="text-weight-bold" />
                                        <q-btn outline color="cyan-4" size="xs" label="Run Speculative Refactor" icon="bolt" @click="dispatchRoutedCommand(node, 'Execute speculative analysis loop on ' + node.label)" />
                                    </q-card-section>
                                </q-card>
                            </template>

                        </div>
                    </q-page>
                </q-page-container>

                <q-footer class="bg-black text-green-4 monospace q-pa-sm" style="height: 120px; overflow-y: auto; border-top: 2px solid #334155; font-size: 12px; line-height: 1.4;">
                    <div v-for="(log, lIdx) in telemetryLogs" :key="lIdx">
                        <span class="text-grey-6">[{{ log.timestamp }}]</span>
                        <span :class="log.type === 'error' ? 'text-red' : (log.type === 'success' ? 'text-amber' : 'text-green')"> {{ log.text }}</span>
                    </div>
                </q-footer>

            </q-layout>
        `
    };

    window.IdeWorkspaceComponent = componentDef;
})();