(function () {
    const AgiWorkspace = {
        name: 'AgiWorkspace',
        props: {
            screenPath: {
                type: String,
                default: null,
            }
        },
        data() {
            return {
                localScreenPath: this.screenPath || '',
                companionQvtPath: '',
                showArtifactPalette: false,
                targetComponentName: 'nursinghome',
                ignoredFrameworkComponents: ['agi-ide', 'agi-ai', 'moqui-usl', 'mantle-usl', 'webroot', 'tools'],

                windowDisplayMode: 'Collage Grid',
                displayModeOptions: ['Collage Grid', 'Focus Canvas', 'Focus Source'],
                activeScreens: ['AgiCanvasEditor', 'AgiScreenEditor', 'AgiComponentEditor'],
                availableScreensOptions: [
                    { label: 'Canvas Viewport', value: 'AgiCanvasEditor' },
                    { label: 'Screen Source', value: 'AgiScreenEditor' },
                    { label: 'Component Source', value: 'AgiComponentEditor' }
                ],

                // 🎯 PANEL WINDOW STATES & QUASAR GRID DYNAMICS
                // State Options: 'docked' (default 2x2 half), 'maximized' (col-12 full), 'left' (col-md-6), 'right' (col-md-6), 'minimized'
                activeLayoutGrid: {
                    AgiCanvasEditor: { state: 'docked', windowRef: null },
                    AgiScreenEditor: { state: 'docked', windowRef: null },
                    AgiComponentEditor: { state: 'docked', windowRef: null }
                },
                focusedPanel: 'AgiCanvasEditor',

                activeWorkspaceBuffer: {
                    workspaceBufferId: '',
                    metaJsonBuffer: null
                },
                loadedComponents: {
                    AgiCanvasEditor: false,
                    AgiScreenEditor: false,
                    AgiComponentEditor: false,
                    AgiPromptEditor: false,
                    MoquiXmlHost: false,
                    AgiArtifactPalette: false,
                    AgiWorkEffortDetail: false,
                    AgiNewComponentWizard: false,
                    AgiIntentDetail: false,
                },
                editorConstructors: {
                    AgiCanvasEditor: null,
                    AgiScreenEditor: null,
                    AgiComponentEditor: null,
                    AgiPromptEditor: null,
                    AgiArtifactPalette: null,
                    MoquiXmlHost: null,
                    AgiWorkEffortDetail: null,
                    AgiNewComponentWizard: null,
                    AgiIntentDetail: null,
                }
            };
        },
        computed: {
            isWorkspaceReady() {
                return this.loadedComponents.AgiCanvasEditor &&
                    this.loadedComponents.AgiScreenEditor &&
                    this.loadedComponents.AgiComponentEditor &&
                    this.loadedComponents.AgiPromptEditor &&
                    this.loadedComponents.MoquiXmlHost;
            }
        },
        mounted() {
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.loadRequiredComponents();
            this.resolveTargetComponentAndPath();

            // 🎯 KEYBOARD SHORTCUT LISTENER (Super / Meta / OS / Alt + Arrow Keys)
            this._keyHandler = (e) => this.handleKeyboardSnapping(e);
            window.addEventListener('keydown', this._keyHandler);

            this._unloadHandler = () => this.closeExternalWindows();
            window.addEventListener('beforeunload', this._unloadHandler);

            this.poller = setInterval(() => {
                Object.keys(this.activeLayoutGrid).forEach(name => {
                    const panel = this.activeLayoutGrid[name];
                    if (panel.state === 'external' && panel.windowRef && panel.windowRef.closed) {
                        panel.state = 'docked';
                        panel.windowRef = null;
                        if (!this.activeScreens.includes(name)) this.activeScreens.push(name);
                    }
                });
            }, 1000);

            if (window.moqui && typeof window.moqui.addNotificationListener === 'function') {
                window.moqui.addNotificationListener('agi-ide-workspace', (notification) => {
                    try {
                        const packet = typeof notification.message === 'string'
                            ? JSON.parse(notification.message)
                            : notification.message;

                        if (packet && packet.event === 'artifact-state-mutated' && packet.mutatedTree) {
                            console.info("📡 [AgiWorkspace] Intercepted backend structural mutation. Syncing Pinia store...");
                            this.activeWorkspaceBuffer.metaJsonBuffer = packet.mutatedTree;

                            const ideStore = window.useAgiIdeStore ? window.useAgiIdeStore() : null;
                            if (ideStore && typeof ideStore.updateActiveBlueprint === 'function') {
                                ideStore.updateActiveBlueprint({
                                    artifactUri: this.localScreenPath,
                                    blueprintTree: packet.mutatedTree
                                });
                            }
                        }
                    } catch (err) {
                        console.error("❌ Error parsing agi-ide-workspace notification payload:", err);
                    }
                });
            }

            this.hydrateMcpOrchestratorFromDatabase();
            this.hydrateWorkspaceBuffer();
        },
        beforeUnmount() {
            if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
            if (this._unloadHandler) window.removeEventListener('beforeunload', this._unloadHandler);
            if (this.poller) clearInterval(this.poller);
            this.closeExternalWindows();
        },
        template: `
            <div class="column fit no-wrap q-pa-md q-gutter-y-md" style="min-height: 90vh;">
                <!-- 1. Header Controls Toolbar -->
                <div id="agi-workspace-header" class="row items-center justify-between q-pa-sm bg-slate-900 text-white rounded-borders shadow-2">
                    
                    <!-- Left Identity Badge -->
                    <div class="row items-center q-gutter-x-sm">
                        <q-icon name="dashboard_customize" color="primary" size="sm" />
                        <div>
                            <div class="text-caption text-grey-4 text-uppercase font-mono" style="font-size: 10px; letter-spacing: 1px;">
                                ACTIVE TARGET APP
                            </div>
                            <div class="text-subtitle1 text-weight-bolder text-primary font-mono row items-center">
                                {{ targetComponentName }}
                                <q-badge color="deep-purple-8" class="q-ml-xs text-caption font-mono" style="font-size: 9px;">
                                    DOMAIN APP
                                </q-badge>
                            </div>
                        </div>
                    </div>

                    <!-- Right Controls -->
                    <div class="row items-center q-gutter-x-sm">
                        <q-select
                            v-model="windowDisplayMode"
                            :options="displayModeOptions"
                            label="Display Mode"
                            dense
                            outlined
                            dark
                            bg-color="slate-800"
                            style="min-width: 160px;"
                            @update:model-value="handleDisplayModeChange"
                        ></q-select>

                        <q-select
                            v-model="activeScreens"
                            :options="availableScreensOptions"
                            label="Active Canvas Editors"
                            multiple
                            use-chips
                            emit-value
                            map-options
                            dense
                            outlined
                            dark
                            bg-color="slate-800"
                            style="min-width: 260px;"
                        ></q-select>

                        <q-btn 
                            color="deep-purple-7" 
                            icon="terminal" 
                            label="AI Prompt" 
                            dense 
                            class="q-px-sm"
                            @click="triggerPromptOverlay"
                        >
                            <q-tooltip class="bg-slate-900 text-caption">Launch AGI AI Assistant Core</q-tooltip>
                        </q-btn>
                        
                        <q-btn 
                            color="primary" 
                            icon="add_box" 
                            label="New Component" 
                            dense 
                            class="q-px-sm"
                            @click="triggerNewComponentWizard"
                        >
                            <q-tooltip class="bg-slate-900 text-caption">Initialize a new Moqui component skeleton</q-tooltip>
                        </q-btn>

                        <q-btn 
                            color="cyan-8" 
                            icon="folder_open" 
                            label="Artifacts" 
                            dense 
                            class="q-px-sm"
                            @click="showArtifactPalette = true"
                        >
                            <q-tooltip class="bg-slate-900 text-caption">Browse and focus workspace artifacts</q-tooltip>
                        </q-btn>
                    </div>
                </div>

                <!-- 2. Loading Spinner Placeholder -->
                <div v-if="!isWorkspaceReady" class="col column justify-center items-center q-gutter-md bg-grey-1 text-center">
                    <q-spinner-gears color="deep-purple-7" size="4em" />
                    <div class="text-subtitle1 text-grey-7 text-weight-medium">Synchronizing Workspace Components for {{ targetComponentName }}...</div>
                </div>

                <!-- 3. Active Workspace Grid (2x2 Panel Window Manager Pattern) -->
                <div v-else class="col column fit no-wrap" style="min-height: 80vh;">
        
                    <div v-if="!localScreenPath || localScreenPath === ''" class="column justify-center items-center col q-gutter-md bg-grey-1 text-center rounded-borders">
                        <q-icon name="folder_open" size="64px" color="primary" />
                        <div class="text-h5 text-grey-8 text-weight-bold">Target App: {{ targetComponentName }}</div>
                        <p class="text-caption text-grey-7 max-w-sm">
                            No artifact screen selected for <strong>{{ targetComponentName }}</strong>.<br/>
                            Select an artifact screen from the Blueprint Manager or command palette to begin editing.
                        </p>
                    </div>

                    <!-- 🎯 QUASAR GRID CONTAINER FOR 2x2 PANEL LAYOUT -->
                    <div v-else class="row q-col-gutter-md fit items-stretch align-content-start">
                        
                        <!-- Canvas Renderer Panel -->
                        <div 
                            v-if="isPanelVisible('AgiCanvasEditor')" 
                            :class="[getPanelClass('AgiCanvasEditor')]" 
                            style="min-height: 420px;"
                            @click="focusedPanel = 'AgiCanvasEditor'"
                        >
                            <div class="fit column rounded-borders border-dark overflow-hidden bg-slate-900" style="border: 1px solid #334155;">
                                <div class="bg-slate-950 text-white q-pa-xs row items-center justify-between font-mono text-caption">
                                    <div class="row items-center q-gutter-x-xs">
                                        <q-icon name="preview" color="info" />
                                        <span class="text-weight-bold">Canvas Renderer</span>
                                    </div>
                                    <div class="row items-center q-gutter-x-xs">
                                        <q-btn flat dense icon="west" size="xs" color="cyan-4" @click.stop="snapPanel('AgiCanvasEditor', 'left')"><q-tooltip>Snap Left (Super+Left)</q-tooltip></q-btn>
                                        <q-btn flat dense icon="east" size="xs" color="cyan-4" @click.stop="snapPanel('AgiCanvasEditor', 'right')"><q-tooltip>Snap Right (Super+Right)</q-tooltip></q-btn>
                                        <q-btn flat dense :icon="activeLayoutGrid.AgiCanvasEditor.state === 'maximized' ? 'fullscreen_exit' : 'fullscreen'" size="xs" color="primary" @click.stop="toggleMaximize('AgiCanvasEditor')"><q-tooltip>Maximize (Super+Up)</q-tooltip></q-btn>
                                    </div>
                                </div>
                                <div class="col overflow-auto">
                                    <component 
                                        v-if="editorConstructors.AgiCanvasEditor"
                                        :is="editorConstructors.AgiCanvasEditor" 
                                        :screen-path="localScreenPath" 
                                        :layout-tree="activeWorkspaceBuffer.metaJsonBuffer" 
                                        @trigger-save="handleChildEditorSave"
                                    ></component>
                                </div>
                            </div>
                        </div>
    
                        <!-- Screen Source Editor Panel -->
                        <div 
                            v-if="isPanelVisible('AgiScreenEditor')" 
                            :class="[getPanelClass('AgiScreenEditor')]" 
                            style="min-height: 420px;"
                            @click="focusedPanel = 'AgiScreenEditor'"
                        >
                            <div class="fit column rounded-borders border-dark overflow-hidden bg-slate-900" style="border: 1px solid #334155;">
                                <div class="bg-slate-950 text-white q-pa-xs row items-center justify-between font-mono text-caption">
                                    <div class="row items-center q-gutter-x-xs">
                                        <q-icon name="code" color="cyan-4" />
                                        <span class="text-weight-bold">XML Screen Editor</span>
                                    </div>
                                    <div class="row items-center q-gutter-x-xs">
                                        <q-btn flat dense icon="west" size="xs" color="cyan-4" @click.stop="snapPanel('AgiScreenEditor', 'left')"><q-tooltip>Snap Left (Super+Left)</q-tooltip></q-btn>
                                        <q-btn flat dense icon="east" size="xs" color="cyan-4" @click.stop="snapPanel('AgiScreenEditor', 'right')"><q-tooltip>Snap Right (Super+Right)</q-tooltip></q-btn>
                                        <q-btn flat dense :icon="activeLayoutGrid.AgiScreenEditor.state === 'maximized' ? 'fullscreen_exit' : 'fullscreen'" size="xs" color="primary" @click.stop="toggleMaximize('AgiScreenEditor')"><q-tooltip>Maximize (Super+Up)</q-tooltip></q-btn>
                                    </div>
                                </div>
                                <div class="col overflow-auto">
                                    <component 
                                        v-if="editorConstructors.AgiScreenEditor"
                                        :is="editorConstructors.AgiScreenEditor" 
                                        :screen-path="localScreenPath" 
                                        :layout-tree="activeWorkspaceBuffer.metaJsonBuffer" 
                                        @trigger-save="handleChildEditorSave"
                                    ></component>
                                </div>
                            </div>
                        </div>

                        <!-- Component Source Editor Panel -->
                        <div 
                            v-if="isPanelVisible('AgiComponentEditor')" 
                            :class="[getPanelClass('AgiComponentEditor')]" 
                            style="min-height: 420px;"
                            @click="focusedPanel = 'AgiComponentEditor'"
                        >
                            <div class="fit column rounded-borders border-dark overflow-hidden bg-slate-900" style="border: 1px solid #334155;">
                                <div class="bg-slate-950 text-white q-pa-xs row items-center justify-between font-mono text-caption">
                                    <div class="row items-center q-gutter-x-xs">
                                        <q-icon name="javascript" color="warning" />
                                        <span class="text-weight-bold">QVT Component Script Editor</span>
                                    </div>
                                    <div class="row items-center q-gutter-x-xs">
                                        <q-btn flat dense icon="west" size="xs" color="cyan-4" @click.stop="snapPanel('AgiComponentEditor', 'left')"><q-tooltip>Snap Left (Super+Left)</q-tooltip></q-btn>
                                        <q-btn flat dense icon="east" size="xs" color="cyan-4" @click.stop="snapPanel('AgiComponentEditor', 'right')"><q-tooltip>Snap Right (Super+Right)</q-tooltip></q-btn>
                                        <q-btn flat dense :icon="activeLayoutGrid.AgiComponentEditor.state === 'maximized' ? 'fullscreen_exit' : 'fullscreen'" size="xs" color="primary" @click.stop="toggleMaximize('AgiComponentEditor')"><q-tooltip>Maximize (Super+Up)</q-tooltip></q-btn>
                                    </div>
                                </div>
                                <div class="col overflow-auto">
                                    <component 
                                        v-if="editorConstructors.AgiComponentEditor"
                                        :is="editorConstructors.AgiComponentEditor" 
                                        :screen-path="companionQvtPath || localScreenPath" 
                                        :layout-tree="activeWorkspaceBuffer.metaJsonBuffer" 
                                        @trigger-save="handleChildEditorSave"
                                    ></component>
                                </div>
                            </div>
                        </div>

                    </div>
            
                </div>
                
                <component :is="editorConstructors.AgiPromptEditor" v-if="isWorkspaceReady"></component>
                <component :is="editorConstructors.AgiNewComponentWizard" v-if="isWorkspaceReady"></component>

                <!-- ARTIFACT PALETTE MODAL -->
                <q-dialog v-model="showArtifactPalette" position="top">
                    <q-card style="width: 600px; max-width: 90vw;" class="bg-slate-900 text-white shadow-24">
                        <q-card-section class="row items-center justify-between bg-slate-950 q-pa-sm border-bottom-dark">
                            <div class="text-subtitle2 text-weight-bold font-mono text-cyan-4">
                                <q-icon name="folder_open" class="q-mr-xs" /> WORKSPACE ARTIFACT PALETTE
                            </div>
                            <q-btn flat round dense icon="close" text-color="white" v-close-popup />
                        </q-card-section>
                        <q-card-section class="q-pa-sm">
                            <component 
                                v-if="editorConstructors.AgiArtifactPalette" 
                                :is="editorConstructors.AgiArtifactPalette" 
                                @artifact-selected="onArtifactSelectedFromWorkspace"
                            ></component>
                        </q-card-section>
                    </q-card>
                </q-dialog>

            </div>
        `,
        methods: {
            // 🎯 QUASAR GRID CLASS GENERATOR (Computes 2x2 vs Fullscreen vs Snapped Half Width)
            getPanelClass(panelName) {
                const panel = this.activeLayoutGrid[panelName];

                // If maximized, take full row (col-12)
                if (panel.state === 'maximized') return 'col-12';

                // If an individual panel is explicitly snapped left or right
                if (panel.state === 'left' || panel.state === 'right') return 'col-12 col-md-6';

                // Check if another panel is maximized
                const hasMaximized = Object.keys(this.activeLayoutGrid).some(
                    name => this.activeLayoutGrid[name].state === 'maximized' && this.activeScreens.includes(name)
                );
                if (hasMaximized) {
                    return panel.state === 'maximized' ? 'col-12' : 'hidden';
                }

                // Default 2x2 grid layout (2 panels per row on medium+ screens)
                return 'col-12 col-md-6';
            },

            isPanelVisible(panelName) {
                if (!this.loadedComponents[panelName]) return false;
                if (!this.activeScreens.includes(panelName)) return false;
                return this.activeLayoutGrid[panelName].state !== 'minimized';
            },

            // 🎯 KEYBOARD SHORTCUT SNAPPING (Super / Meta / OS / Alt + Arrow Keys)
            handleKeyboardSnapping(e) {
                const isSuper = e.metaKey || e.ctrlKey || e.altKey;
                if (!isSuper || !this.focusedPanel) return;

                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    this.snapPanel(this.focusedPanel, 'left');
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    this.snapPanel(this.focusedPanel, 'right');
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.toggleMaximize(this.focusedPanel);
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.activeLayoutGrid[this.focusedPanel].state = 'docked';
                }
            },

            snapPanel(panelName, side) {
                const current = this.activeLayoutGrid[panelName].state;
                this.activeLayoutGrid[panelName].state = (current === side) ? 'docked' : side;
            },

            toggleMaximize(panelName) {
                const panel = this.activeLayoutGrid[panelName];
                if (panel.state === 'maximized') {
                    panel.state = 'docked';
                } else {
                    Object.keys(this.activeLayoutGrid).forEach(name => {
                        this.activeLayoutGrid[name].state = 'docked';
                    });
                    panel.state = 'maximized';
                }
            },

            // ... Existing methods (loadRequiredComponents, resolveTargetComponentAndPath, etc.) remain unchanged ...
            resolveTargetComponentAndPath() {
                let path = window.location.pathname;
                const urlParams = new URLSearchParams(window.location.search);
                let queryPath = urlParams.get('screenPath') || this.screenPath || '';

                if (queryPath) {
                    this.localScreenPath = queryPath;
                } else {
                    const workspaceToken = "/AgiWorkspace";
                    const wsIndex = path.indexOf(workspaceToken);

                    if (wsIndex !== -1) {
                        let subPath = path.substring(wsIndex + workspaceToken.length);
                        if (subPath.startsWith('/')) subPath = subPath.substring(1);
                        if (subPath.endsWith('/')) subPath = subPath.slice(0, -1);

                        if (subPath) {
                            const segments = subPath.split('/');
                            const parsedComp = segments[0];
                            this.localScreenPath = `component://${parsedComp}/${segments.slice(1).join('/')}.xml`;
                        }
                    }
                }

                if (this.localScreenPath && this.localScreenPath.startsWith("component://")) {
                    const cleanPath = this.localScreenPath.replace("component://", "");
                    const parts = cleanPath.split('/');
                    const candidateComp = parts[0];

                    if (!this.ignoredFrameworkComponents.includes(candidateComp)) {
                        this.targetComponentName = candidateComp;
                    }
                }
            },

            async loadRequiredComponents() {
                const vm = this;
                const markRaw = (window.Vue && window.Vue.markRaw) ? window.Vue.markRaw : (obj) => obj;

                const assets = [
                    { name: 'AgiCanvasEditor', url: '/agi-ide-assets/AgiCanvasEditor.qvt.js', globalVar: 'AgiCanvasEditor' },
                    { name: 'AgiScreenEditor', url: '/agi-ide-assets/AgiScreenEditor.qvt.js', globalVar: 'AgiScreenEditor' },
                    { name: 'AgiComponentEditor', url: '/agi-ide-assets/AgiComponentEditor.qvt.js', globalVar: 'AgiComponentEditor' },
                    { name: 'AgiPromptEditor', url: '/agi-ide-assets/AgiPromptEditor.qvt.js', globalVar: 'AgiPromptEditor' },
                    { name: 'AgiArtifactPalette', url: '/agi-ide-assets/AgiArtifactPalette.qvt.js', globalVar: 'AgiArtifactPalette' },
                    { name: 'MoquiXmlHost', url: '/agi-ai-assets/moqui-xml-host.qvt.js', globalVar: 'MoquiXmlHost' },
                    { name: 'AgiWorkEffortDetail', url: '/agi-ai-assets/AgiWorkEffortDetail.qvt.js', globalVar: 'AgiWorkEffortDetail' },
                    { name: 'DiscussionDetail', url: '/agi-ai-assets/DiscussionDetail.qvt.js', globalVar: 'DiscussionDetail' },
                    { name: 'DiscussionTree', url: '/agi-ai-assets/DiscussionTree.qvt.js', globalVar: 'DiscussionTree' },
                    { name: 'AgiNewComponentWizard', url: '/agi-ide-assets/AgiNewComponentWizard.qvt.js', globalVar: 'AgiNewComponentWizard' },
                    { name: 'AgiIntentDetail', url: '/agi-ide-assets/AgiIntentDetail.qvt.js', globalVar: 'AgiIntentDetail' },
                ];

                assets.forEach(asset => {
                    if (window[asset.globalVar]) {
                        if (vm.editorConstructors.hasOwnProperty(asset.name)) {
                            vm.editorConstructors[asset.name] = markRaw(window[asset.globalVar]);
                        }
                        if (vm.loadedComponents.hasOwnProperty(asset.name)) {
                            vm.loadedComponents[asset.name] = true;
                        }
                        return;
                    }

                    const script = document.createElement('script');
                    script.type = 'text/javascript';
                    script.src = asset.url;
                    script.async = true;

                    script.onload = () => {
                        const checkRegistration = () => {
                            if (window[asset.globalVar]) {
                                if (vm.editorConstructors.hasOwnProperty(asset.name)) {
                                    vm.editorConstructors[asset.name] = markRaw(window[asset.globalVar]);
                                }
                                if (vm.loadedComponents.hasOwnProperty(asset.name)) {
                                    vm.loadedComponents[asset.name] = true;
                                }
                            } else {
                                setTimeout(checkRegistration, 20);
                            }
                        };
                        checkRegistration();
                    };
                    document.head.appendChild(script);
                });
            },

            handleDisplayModeChange(val) {
                if (val === 'Focus Canvas') {
                    this.activeScreens = ['AgiCanvasEditor'];
                } else if (val === 'Focus Source') {
                    this.activeScreens = ['AgiScreenEditor'];
                } else {
                    this.activeScreens = ['AgiCanvasEditor', 'AgiScreenEditor', 'AgiComponentEditor'];
                }
            },

            detachPanelToExternalWindow(panelName) {
                const panel = this.activeLayoutGrid[panelName];
                panel.state = 'external';

                const childWin = window.open('/apps/agi-ide/amaTerminal?componentName=' + panelName, '_blank', 'width=1000,height=800,menubar=no,toolbar=no,location=no,status=no');
                if (childWin) {
                    panel.windowRef = childWin;

                    const injectStyles = () => {
                        try {
                            const doc = childWin.document;
                            if (!doc || !doc.head) return;
                            document.querySelectorAll('link[rel="stylesheet"], style').forEach(el => {
                                const clone = doc.importNode(el, true);
                                doc.head.appendChild(clone);
                            });
                        } catch (e) {
                            console.error("Failed to inject styles into child window", e);
                        }
                    };

                    setTimeout(injectStyles, 500);
                    childWin.addEventListener('load', injectStyles);
                }
            },

            closeExternalWindows() {
                Object.keys(this.activeLayoutGrid).forEach(name => {
                    const win = this.activeLayoutGrid[name].windowRef;
                    if (win && !win.closed) {
                        win.close();
                    }
                    this.activeLayoutGrid[name].windowRef = null;
                    if (this.activeLayoutGrid[name].state === 'external') {
                        this.activeLayoutGrid[name].state = 'docked';
                    }
                });
            },

            hydrateMcpOrchestratorFromDatabase() {
                if (!window.AgiMcpEngine) {
                    setTimeout(() => this.hydrateMcpOrchestratorFromDatabase(), 50);
                    return;
                }

                const vm = this;
                const axiosConfig = this.studdleStore?.getAxiosConfig || {};
                axios.get('/rest/s1/agi-ide/getAllTools', axiosConfig)
                    .then(function (response) {
                        const data = response.data;
                        if (data && data.toolsList && data.toolsList.length > 0) {
                            data.toolsList.forEach(tool => {
                                try {
                                    const executionFactory = new Function(tool.scriptBody);
                                    const executableFunction = executionFactory();

                                    window.AgiMcpEngine.registerTool({
                                        command: tool.command,
                                        description: tool.description,
                                        scope: tool.scope,
                                        execute: executableFunction
                                    });
                                } catch (err) { }
                            });
                        } else {
                            vm.injectLocalFallbackTools();
                        }
                    })
                    .catch(function () {
                        vm.injectLocalFallbackTools();
                    });
            },

            injectLocalFallbackTools() {
                window.AgiMcpEngine.registerTool({
                    commandstore: '/add-mock-field',
                    description: 'Fallback testing field tool',
                    scope: 'AgiCanvasEditor',
                    execute: (currentTree) => {
                        const newTree = JSON.parse(JSON.stringify(currentTree));
                        const mockNode = {
                            type: 'FormField',
                            name: 'mockControl_' + Date.now(),
                            text: 'Mocked Input Field Element',
                            mariaId: 'SampleForm#mockControl_' + Date.now(),
                            children: []
                        };
                        if (newTree.children) newTree.children.push(mockNode);
                        return newTree;
                    }
                });
            },

            triggerPromptOverlay() {
                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'open-prompt-editor',
                        panelName: this.activeScreens[0],
                        artifactLocation: this.localScreenPath,
                        targetComponent: this.targetComponentName
                    });
                }
            },

            triggerNewComponentWizard() {
                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'open-new-component-wizard'
                    });
                }
            },

            async hydrateWorkspaceBuffer() {
                const activeUser = window.AGI_SERVER_USER_ID;
                const axiosConfig = this.studdleStore?.getAxiosConfig || {};

                try {
                    if (this.localScreenPath) {
                        const response = await axios.get(`/rest/s1/agi-ide/getWorkspaceBuffer?artifactUri=${encodeURIComponent(this.localScreenPath)}&userId=${encodeURIComponent(activeUser)}`, axiosConfig);
                        const data = response.data;

                        if (data && data.metaJsonBuffer) {
                            const parsedBuffer = typeof data.metaJsonBuffer === 'string'
                                ? JSON.parse(data.metaJsonBuffer)
                                : data.metaJsonBuffer;

                            this.activeWorkspaceBuffer.metaJsonBuffer = parsedBuffer;
                            this.activeWorkspaceBuffer.workspaceBufferId = data.workspaceBufferId;

                            const ideStore = window.useAgiIdeStore ? window.useAgiIdeStore() : null;
                            if (ideStore && typeof ideStore.updateActiveBlueprint === 'function') {
                                ideStore.updateActiveBlueprint({
                                    artifactUri: this.localScreenPath,
                                    blueprintTree: parsedBuffer
                                });
                            }
                        }
                    }
                } catch (err) {
                    console.error("Failed to hydrate workspace buffer:", err);
                }
            },

            async handleChildEditorSave() {
                const ideStore = window.useAgiIdeStore ? window.useAgiIdeStore() : null;
                const activeBlueprint = ideStore ? ideStore.getActiveBlueprint : this.activeWorkspaceBuffer.metaJsonBuffer;

                if (!activeBlueprint) return;

                const activeUser = window.AGI_SERVER_USER_ID;
                const headers = { 'X-CSRF-Token': window.AGI_SERVER_CSRF_TOKEN };
                const jsonStringPayload = JSON.stringify(activeBlueprint);

                try {
                    await axios.post('/rest/s1/agi-ide/storeWorkspaceBuffer', {
                        workspaceBufferId: this.activeWorkspaceBuffer.workspaceBufferId,
                        artifactUri: this.localScreenPath,
                        userId: activeUser,
                        metaJsonBuffer: jsonStringPayload
                    }, { headers });

                    const fileSaveResponse = await axios.post('/rest/s1/agi-ide/saveScreenXml', {
                        artifactUri: this.localScreenPath,
                        metaJsonBuffer: jsonStringPayload
                    }, { headers });

                    if (fileSaveResponse.data?.status === 'SUCCESS') {
                        this.$q?.notify({
                            type: 'positive',
                            message: 'Screen XML successfully compiled and saved to disk!'
                        });
                    }
                } catch (err) {
                    this.$q?.notify({
                        type: 'negative',
                        message: 'Failed to write workspace modifications to disk.'
                    });
                }
            },

            onArtifactSelectedFromWorkspace(item) {
                this.showArtifactPalette = false;
                const uri = item.value || '';

                if (uri.endsWith('.xml')) {
                    this.localScreenPath = uri;
                    const lastSlash = uri.lastIndexOf('/');
                    const dir = uri.substring(0, lastSlash);
                    const fileName = uri.substring(lastSlash + 1).replace('.xml', '');
                    this.companionQvtPath = `${dir}/assets/${fileName}.qvt.js`;

                } else if (uri.endsWith('.qvt.js')) {
                    this.companionQvtPath = uri;
                    if (uri.includes('/assets/')) {
                        const fileName = uri.substring(uri.lastIndexOf('/') + 1).replace('.qvt.js', '.xml');
                        const parentDir = uri.substring(0, uri.indexOf('/assets/'));
                        this.localScreenPath = `${parentDir}/${fileName}`;
                    } else {
                        this.localScreenPath = uri.replace('.qvt.js', '.xml');
                    }
                } else {
                    this.localScreenPath = uri;
                    this.companionQvtPath = null;
                }

                this.activeScreens = ['AgiCanvasEditor', 'AgiScreenEditor', 'AgiComponentEditor'];
                this.hydrateWorkspaceBuffer();

                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'open-screen-artifact',
                        artifactLocation: this.localScreenPath,
                        companionQvtLocation: this.companionQvtPath,
                        targetComponent: this.targetComponentName
                    });
                }
            }
        }
    };

    window.AgiWorkspace = AgiWorkspace;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-workspace'] = AgiWorkspace;
    window.AgiComponents['AgiWorkspace'] = AgiWorkspace;

    const registerAgiWorkspace = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            if (!window.moqui.webrootVueApp.component('agi-workspace')) {
                window.moqui.webrootVueApp.component('agi-workspace', AgiWorkspace);
            }
        } else {
            setTimeout(registerAgiWorkspace, 50);
        }
    };

    registerAgiWorkspace();
})();