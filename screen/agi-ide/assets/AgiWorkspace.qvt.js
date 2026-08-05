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
                windowDisplayMode: 'Collage Grid',
                displayModeOptions: ['Collage Grid', 'Focus Canvas', 'Focus Source'],
                activeScreens: ['AgiCanvasEditor', 'AgiScreenEditor', 'AgiComponentEditor'],
                availableScreensOptions: [
                    { label: 'Canvas Viewport', value: 'AgiCanvasEditor' },
                    { label: 'Screen Source', value: 'AgiScreenEditor' },
                    { label: 'Component Source', value: 'AgiComponentEditor' }
                ],
                activeLayoutGrid: {
                    AgiCanvasEditor: { state: 'docked', windowRef: null },
                    AgiScreenEditor: { state: 'docked', windowRef: null },
                    AgiComponentEditor: { state: 'docked', windowRef: null }
                },
                activeWorkspaceBuffer: {
                    workspaceBufferId: '',
                    metaJsonBuffer: null
                },
                loadedComponents: {
                    AgiCanvasEditor: false,
                    AgiScreenEditor: false,
                    AgiComponentEditor: false,
                    AgiCommandPalette: false,
                    AgiBlueprintEditor: false,
                    MoquiXmlHost: false,
                    AgiWorkEffortDetail: false,
                    AgiNewComponentWizard: false,
                },
                // 🎯 Explicit local registry map for constructors
                editorConstructors: {
                    AgiCanvasEditor: null,
                    AgiScreenEditor: null,
                    AgiComponentEditor: null,
                    AgiCommandPalette: null,
                    AgiBlueprintEditor: null,
                    MoquiXmlHost: null,
                    AgiWorkEffortDetail: null,
                    AgiNewComponentWizard: null,
                }
            };
        },
        computed: {
            // 🎯 Master loading gate: Must wait for the panel frame AND all editors
            isWorkspaceReady() {
                return this.loadedComponents.AgiCanvasEditor &&
                    this.loadedComponents.AgiScreenEditor &&
                    this.loadedComponents.AgiComponentEditor &&
                    this.loadedComponents.AgiCommandPalette &&
                    this.loadedComponents.MoquiXmlHost;
            },
            activeEditorComponent() {
                const targetEditor = this.agiIdeStore.currentArtifact?.editor;

                if (targetEditor === 'AgiComponentEditor') {
                    return 'agi-component-editor';
                }

                return 'agi-screen-editor'; // Default fallback for standard Moqui screens
            },
        },
        template: `
            <div class="column fit no-wrap q-pa-md q-gutter-y-md" style="min-height: 85vh;">
                <!-- 1. Header Toolbar Controls -->
                <div id="agi-workspace-header" class="row items-center justify-between q-pa-sm bg-grey-2 style='border-bottom: 1px solid #ccc;'">
                    <div class="row q-gutter-md">
                        <q-select
                            v-model="windowDisplayMode"
                            :options="displayModeOptions"
                            label="Window Display Mode"
                            dense
                            outlined
                            style="min-width: 220px;"
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
                            style="min-width: 320px;"
                        ></q-select>

                        <q-btn 
                            color="deep-purple-7" 
                            icon="terminal" 
                            label="AI Palette" 
                            dense 
                            class="q-px-md"
                            @click="triggerCommandPaletteOverlay"
                        >
                            <q-tooltip class="bg-slate-900 text-caption">Launch AGI AI Assistant Core</q-tooltip>
                        </q-btn>
                        <q-btn 
                            color="teal-7" 
                            icon="account_tree" 
                            label="Blueprint Manager" 
                            dense 
                            class="q-px-md q-ml-sm"
                            @click="triggerBlueprintEditorOverlay"
                        >
                            <q-tooltip class="bg-slate-900 text-caption">Launch AgiBlueprintEditor & Version Controller</q-tooltip>
                        </q-btn>
                        <q-btn 
                            color="primary" 
                            icon="add_box" 
                            label="New Component" 
                            dense 
                            class="q-px-md q-ml-sm"
                            @click="triggerNewComponentWizard"
                        >
                            <q-tooltip class="bg-slate-900 text-caption">Initialize a new Moqui component skeleton</q-tooltip>
                        </q-btn>
                    </div>
                </div>

                <!-- 2. Loading Spinner Placeholder: Shown while scripts are dynamically injected -->
                <div v-if="!isWorkspaceReady" class="col column justify-center items-center q-gutter-md bg-grey-1 text-center">
                    <q-spinner-gears color="deep-purple-7" size="4em" />
                    <div class="text-subtitle1 text-grey-7 text-weight-medium">Synchronizing Workspace Components...</div>
                </div>

                <!-- 3. Active Workspace Workspace (Rendered ONLY when isWorkspaceReady is TRUE) -->
                <div v-else class="column fit no-wrap q-pa-md q-gutter-y-md" style="min-height: 85vh;">
        
                    <div v-if="!localScreenPath || localScreenPath === ''" class="column justify-center items-center col q-gutter-md bg-grey-1 text-center">
                        <q-icon name="folder_open" size="64px" color="grey-5" />
                        <div class="text-h5 text-grey-7">No Workspace Artifact Selected</div>
                        <p class="text-caption text-grey-6 max-w-sm">
                            Please provide a qualified Moqui resource destination path in your URL query string parameter.<br/>
                            Example: ?screenPath=component://nursing-home/screen/Form.xml
                        </p>
                    </div>
                    <template v-else>
                        <!-- Canvas Renderer Panel -->
                        <div v-if="isPanelVisible('AgiCanvasEditor')" :class="[getPanelClass('AgiCanvasEditor'), 'column']">
                            <!-- 🎯 standard component tag works natively now because it's registered globally on boot -->
                            <agi-sub-workspace title="Canvas Renderer" panel-name="AgiCanvasEditor" :layout-state="activeLayoutGrid" @toggle-maximize="toggleMaximize" @detach-panel="detachPanelToExternalWindow">
                                <component 
                                    v-if="editorConstructors.AgiCanvasEditor"
                                    :is="editorConstructors.AgiCanvasEditor" 
                                    :screen-path="localScreenPath" 
                                    :layout-tree="activeWorkspaceBuffer.metaJsonBuffer" 
                                    @trigger-save="handleChildEditorSave"
                                ></component>
                            </agi-sub-workspace>
                        </div>
    
                        <!-- Screen Source Editor Panel -->
                        <div v-if="isPanelVisible('AgiScreenEditor')" :class="[getPanelClass('AgiScreenEditor'), 'column']">
                            <agi-sub-workspace title="Screen Source Editor" panel-name="AgiScreenEditor" :layout-state="activeLayoutGrid" @toggle-maximize="toggleMaximize" @detach-panel="detachPanelToExternalWindow">
                                <component 
                                    v-if="editorConstructors.AgiScreenEditor"
                                    :is="editorConstructors.AgiScreenEditor" 
                                    :screen-path="localScreenPath" 
                                    :layout-tree="activeWorkspaceBuffer.metaJsonBuffer" 
                                    @trigger-save="handleChildEditorSave"
                                ></component>
                            </agi-sub-workspace>
                        </div>

                        <!-- Component Source Editor Panel -->
                        <div v-if="isPanelVisible('AgiComponentEditor')" :class="[getPanelClass('AgiComponentEditor'), 'column']">
                            <agi-sub-workspace title="Component Source Editor" panel-name="AgiComponentEditor" :layout-state="activeLayoutGrid" @toggle-maximize="toggleMaximize" @detach-panel="detachPanelToExternalWindow">
                                <component 
                                    v-if="editorConstructors.AgiComponentEditor"
                                    :is="editorConstructors.AgiComponentEditor" 
                                    :screen-path="localScreenPath" 
                                    :layout-tree="activeWorkspaceBuffer.metaJsonBuffer" 
                                    @trigger-save="handleChildEditorSave"
                                ></component>
                            </agi-sub-workspace>
                        </div>
                    </template>
            
                </div>
                
                <component :is="editorConstructors.AgiCommandPalette" v-if="isWorkspaceReady"></component>
                <component :is="editorConstructors.AgiBlueprintEditor" v-if="isWorkspaceReady"></component>
                <component :is="editorConstructors.AgiNewComponentWizard" v-if="isWorkspaceReady"></component>
            </div>
        `,
        // Keep rest of your data watches, methods, loadRequiredComponents(), and mounted hooks exactly as they are!
        mounted() {
            // ContextBus strictly for UI signals (e.g. node focus/highlight)
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');

            // 🎯 ASYNC LOAD ALL ASSETS DYNAMICALLY ON MOUNT
            this.loadRequiredComponents();

            if (!this.localScreenPath) {
                const path = window.location.pathname;
                const workspaceToken = "/AgiWorkspace";
                const wsIndex = path.indexOf(workspaceToken);

                if (wsIndex !== -1) {
                    const baseRoute = path.substring(0, wsIndex + workspaceToken.length);

                    if (path.length > baseRoute.length) {
                        let subPath = path.substring(baseRoute.length);
                        if (subPath.startsWith('/')) subPath = subPath.substring(1);
                        if (subPath.endsWith('/')) subPath = subPath.slice(0, -1);

                        if (subPath) {
                            const segments = subPath.split('/');
                            const componentName = segments[0];
                            this.localScreenPath = `component://${componentName}/${segments.slice(1).join('/')}.xml`;
                            console.info("🎯 [AgiWorkspace] Parsed sub-path path:", this.localScreenPath);
                        }
                    }
                }
            }

            if (!this.localScreenPath) {
                const urlParams = new URLSearchParams(window.location.search);
                this.localScreenPath = urlParams.get('screenPath') || '';
            }

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

                            // Sync directly into Pinia Store
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
            if (this._unloadHandler) {
                window.removeEventListener('beforeunload', this._unloadHandler);
            }
            if (this.poller) clearInterval(this.poller);
            this.closeExternalWindows();
        },
        watch: {
            'activeWorkspaceBuffer.metaJsonBuffer': {
                handler(newTree) {
                    if (!newTree) return;

                    const uncompiledNodes = [];
                    const scan = (node) => {
                        if (node.attributes && node.attributes['ai-intent']) {
                            const hasCompiled = node.attributes['v-if'] || node.attributes['v-data'] || node.class;
                            if (!hasCompiled) {
                                uncompiledNodes.push(node);
                            }
                        }
                        const children = node.children || node.widgets;
                        if (Array.isArray(children)) {
                            children.forEach(scan);
                        }
                    };

                    if (Array.isArray(newTree)) {
                        newTree.forEach(scan);
                    } else {
                        scan(newTree);
                    }

                    if (uncompiledNodes.length > 0) {
                        console.info(`🧠 [INTENT PIPELINE] Found ${uncompiledNodes.length} uncompiled layout intent(s). Compiling...`);
                        uncompiledNodes.forEach(node => {
                            window.AgiIntentCompiler.compileIntent(
                                node.mariaId,
                                this.screenPath,
                                node.attributes['ai-intent']
                            );
                        });
                    }
                },
                deep: true,
                immediate: true
            }
        },
        methods: {
            async loadRequiredComponents() {
                const vm = this;
                const markRaw = (window.Vue && window.Vue.markRaw) ? window.Vue.markRaw : (obj) => obj;

                const assets = [
                    { name: 'AgiCanvasEditor', url: '/agi-ide-assets/AgiCanvasEditor.qvt.js', globalVar: 'AgiCanvasEditor' },
                    { name: 'AgiScreenEditor', url: '/agi-ide-assets/AgiScreenEditor.qvt.js', globalVar: 'AgiScreenEditor' },
                    { name: 'AgiComponentEditor', url: '/agi-ide-assets/AgiComponentEditor.qvt.js', globalVar: 'AgiComponentEditor' },
                    { name: 'AgiCommandPalette', url: '/agi-ide-assets/AgiCommandPalette.qvt.js', globalVar: 'AgiCommandPalette' },
                    { name: 'MoquiXmlHost', url: '/agi-ai-assets/moqui-xml-host.qvt.js', globalVar: 'MoquiXmlHost' },
                    { name: 'AgiWorkEffortDetail', url: '/agi-ai-assets/AgiWorkEffortDetail.qvt.js', globalVar: 'AgiWorkEffortDetail' },
                    { name: 'DiscussionDetail', url: '/agi-ai-assets/DiscussionDetail.qvt.js', globalVar: 'DiscussionDetail' },
                    { name: 'DiscussionTree', url: '/agi-ai-assets/DiscussionTree.qvt.js', globalVar: 'DiscussionTree' },
                    { name: 'AgiBlueprintEditor', url: '/agi-ide-assets/AgiBlueprintEditor.qvt.js', globalVar: 'AgiBlueprintEditor' },
                    { name: 'AgiNewComponentWizard', url: '/agi-ide-assets/AgiNewComponentWizard.qvt.js', globalVar: 'AgiNewComponentWizard' },
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
                        console.info(`📦 Asset loaded successfully: ${asset.url}`);

                        const checkRegistration = () => {
                            if (window[asset.globalVar]) {
                                if (vm.editorConstructors.hasOwnProperty(asset.name)) {
                                    vm.editorConstructors[asset.name] = markRaw(window[asset.globalVar]);
                                }
                                if (vm.loadedComponents.hasOwnProperty(asset.name)) {
                                    vm.loadedComponents[asset.name] = true;
                                }
                                console.info(`✅ [AgiWorkspace] Acknowledged registration for: ${asset.name}`);
                            } else {
                                setTimeout(checkRegistration, 20);
                            }
                        };
                        checkRegistration();
                    };

                    script.onerror = (err) => {
                        console.error(`❌ Failed to load asset: ${asset.url}`, err);
                    };

                    document.head.appendChild(script);
                });
            },
            // 🎯 FIXED CONTEXT DYNAMIC ASSET INJECTION
            isPanelVisible(panelName) {
                // 🎯 Guard: If the component script hasn't finished loading and registering, hide the panel!
                if (!this.loadedComponents[panelName]) return false;

                // If the user unselected it via the toolbar dropdown checklist, hide it completely
                if (!this.activeScreens.includes(panelName)) return false;

                const panel = this.activeLayoutGrid[panelName];
                if (panel.state === 'external') return false;

                const hasMaximized = Object.keys(this.activeLayoutGrid).some(
                    name => this.activeLayoutGrid[name].state === 'maximized' && this.activeScreens.includes(name)
                );
                if (hasMaximized) {
                    return panel.state === 'maximized';
                }
                return true;
            },
            getPanelClass(panelName) {
                const panel = this.activeLayoutGrid[panelName];
                if (panel.state === 'maximized') return 'col-12';

                const visibleDockedCount = Object.keys(this.activeLayoutGrid).filter(
                    name => this.activeLayoutGrid[name].state === 'docked' && this.activeScreens.includes(name)
                ).length;

                if (visibleDockedCount === 3) return 'col-4';
                if (visibleDockedCount === 2) return 'col-6';
                return 'col-12';
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
            toggleMaximize(panelName) {
                const panel = this.activeLayoutGrid[panelName];
                if (panel.state === 'maximized') {
                    panel.state = 'docked';
                } else {
                    Object.keys(this.activeLayoutGrid).forEach(name => {
                        if (this.activeLayoutGrid[name].state === 'maximized') {
                            this.activeLayoutGrid[name].state = 'docked';
                        }
                    });
                    panel.state = 'maximized';
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
                    console.warn("⏳ AgiMcpEngine not found yet. Backing off and retrying in 50ms...");
                    setTimeout(() => this.hydrateMcpOrchestratorFromDatabase(), 50);
                    return;
                }

                console.info("📡 AgiWorkspace initiating database tool hydration stream...");

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
                                } catch (err) {
                                    console.error(`❌ Hydration dropped for tool [${tool.command}]:`, err);
                                }
                            });
                            console.info(`✅ Successfully synchronized ${data.toolsList.length} database tools to AgiMcpOrchestrator.`);
                        } else {
                            console.info("ℹ️ Database tool table is empty. Injecting local testing fallbacks...");
                            vm.injectLocalFallbackTools();
                        }
                    })
                    .catch(function (err) {
                        console.warn("⚠️ Database connection failed or timed out. Injecting local testing fallbacks:", err);
                        vm.injectLocalFallbackTools();
                    });
            },
            injectLocalFallbackTools() {
                window.AgiMcpEngine.registerTool({
                    commandstore: '/add-mock-field',
                    description: 'Fallback testing field tool',
                    scope: 'AgiCanvasEditor',
                    execute: (currentTree, targetMariaId) => {
                        console.log("🏃 Executing /add-mock-field utility pass against tree...");
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
                console.info("🎯 Local fallback tool registry is ready for testing execution.");
            },
            triggerCommandPaletteOverlay() {
                console.info("📡 AgiWorkspace broadcasting manual click activation pass to layout overlay panel...");

                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'force-open-command-palette',
                        panelName: this.activeScreens[0] || 'AgiCanvasEditor',
                        artifactLocation: this.screenPath
                    });
                } else {
                    const paletteComponent = window.AgiComponents?.['agi-command-palette'];
                    if (paletteComponent && typeof paletteComponent.openPalette === 'function') {
                        paletteComponent.openPalette();
                    }
                }
            },
            triggerBlueprintEditorOverlay() {
                console.info("📡 [AgiWorkspace] Launching AgiBlueprintEditor overlay/panel...");

                // Broadcast event over context bus or toggle modal/panel state
                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'open-blueprint-editor',
                        artifactLocation: this.localScreenPath
                    });
                }
            },
            async hydrateWorkspaceBuffer() {
                const activeUser = window.AGI_SERVER_USER_ID;
                const axiosConfig = this.studdleStore?.getAxiosConfig || {};

                try {
                    if (this.localScreenPath) {
                        const response = await axios.get(`/rest/s1/agi-ai/getWorkspaceBuffer?artifactUri=${encodeURIComponent(this.localScreenPath)}&userId=${encodeURIComponent(activeUser)}`, axiosConfig);
                        const data = response.data;

                        if (data && data.metaJsonBuffer) {
                            // 🎯 ENSURE JSON STRING IS PARSED TO A LIVE OBJECT
                            const parsedBuffer = typeof data.metaJsonBuffer === 'string'
                                ? JSON.parse(data.metaJsonBuffer)
                                : data.metaJsonBuffer;

                            this.activeWorkspaceBuffer.metaJsonBuffer = parsedBuffer;
                            this.activeWorkspaceBuffer.workspaceBufferId = data.workspaceBufferId;

                            // Hydrate Pinia Store
                            const ideStore = window.useAgiIdeStore ? window.useAgiIdeStore() : null;
                            if (ideStore && typeof ideStore.updateActiveBlueprint === 'function') {
                                ideStore.updateActiveBlueprint({
                                    artifactUri: this.localScreenPath,
                                    blueprintTree: parsedBuffer
                                });
                                console.info("🎯 [AgiWorkspace] Hydrated Pinia store successfully.");
                            }
                        }
                    }
                } catch (err) {
                    console.error("Failed to hydrate workspace buffer:", err);
                }
            },
            async handleChildEditorSave() {
                console.info("📡 [AgiWorkspace] Save signal received. Reading active blueprint from agiIdeStore...");

                // 🎯 1. READ EXCLUSIVELY FROM PINIA STORE AS SINGLE SOURCE OF TRUTH
                const ideStore = window.useAgiIdeStore ? window.useAgiIdeStore() : null;
                const activeBlueprint = ideStore ? ideStore.getActiveBlueprint : this.activeWorkspaceBuffer.metaJsonBuffer;

                if (!activeBlueprint) {
                    console.warn("⚠️ [AgiWorkspace] Save aborted: Pinia store contains no active blueprint.");
                    return;
                }

                const activeUser = window.AGI_SERVER_USER_ID;
                const headers = { 'X-CSRF-Token': window.AGI_SERVER_CSRF_TOKEN };
                const jsonStringPayload = JSON.stringify(activeBlueprint);

                try {
                    // 🎯 2. PHASE 1: Commit working buffer to WorkspaceBuffer database row
                    await axios.post('/rest/s1/agi-ai/storeWorkspaceBuffer', {
                        workspaceBufferId: this.activeWorkspaceBuffer.workspaceBufferId,
                        artifactUri: this.localScreenPath,
                        userId: activeUser,
                        metaJsonBuffer: jsonStringPayload
                    }, { headers });

                    console.info("🎯 Database workspace buffer state cleanly updated.");

                    // 🎯 3. PHASE 2: Convert Meta-JSON to Moqui XML and overwrite physical screen file on disk
                    const fileSaveResponse = await axios.post('/rest/s1/agi-ai/saveScreenXml', {
                        artifactUri: this.localScreenPath,
                        metaJsonBuffer: jsonStringPayload
                    }, { headers });

                    if (fileSaveResponse.data?.status === 'SUCCESS') {
                        this.$q?.notify({
                            type: 'positive',
                            message: 'Screen XML successfully compiled and saved to disk!'
                        });
                        console.info("🚀 [SAVE PIPELINE COMPLETE] Physical XML file overwritten on disk:", fileSaveResponse.data.savedFilePath);
                    } else {
                        throw new Error(fileSaveResponse.data?.status || 'XML file write failed');
                    }

                } catch (err) {
                    console.error("❌ Failed to complete workspace save pipeline:", err);
                    this.$q?.notify({
                        type: 'negative',
                        message: 'Failed to write workspace modifications to disk.'
                    });
                }
            },
            triggerNewComponentWizard() {
                console.info("📡 [AgiWorkspace] Opening New Component Wizard...");
                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'open-new-component-wizard'
                    });
                }
            },
        },
    };

    window.AgiWorkspace = AgiWorkspace;

    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-workspace'] = AgiWorkspace; // Lowercase matching the XML container type element attribute
    window.AgiComponents['AgiWorkspace'] = AgiWorkspace;  // Pascal case safety handle

    const registerAgiWorkspace = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            if (!window.moqui.webrootVueApp.component('agi-workspace')) {
                window.moqui.webrootVueApp.component('agi-workspace', AgiWorkspace);
                console.info("🚀 [AGI] Registered 'agi-workspace' component successfully.");
            }
        } else {
            console.warn("⚠️ [AGI] webrootVueApp not ready yet, retrying registration... Preserved window definitions.");
            setTimeout(registerAgiWorkspace, 50);
        }
    };

    registerAgiWorkspace();
})();