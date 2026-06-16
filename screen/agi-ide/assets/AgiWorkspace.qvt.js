(function () {
    const AgiWorkspace = {
        name: 'AgiWorkspace',
        props: {
            screenPath: {
                type: String,
                default: 'SampleForm'
            }
        },
        data() {
            return {
                // Consolidated variables safely bound to this component's reactive scope
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
                }
            };
        },
        template: `
            <div class="column fit no-wrap q-pa-md q-gutter-y-md" style="min-height: 85vh;">
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
                    </div>
                </div>

                <div class="row no-wrap q-col-gutter-md col col-stretch items-stretch">
                    <div v-if="isPanelVisible('AgiCanvasEditor')" :class="[getPanelClass('AgiCanvasEditor'), 'column']">
                        <agi-sub-workspace title="Canvas Renderer" panel-name="AgiCanvasEditor" :layout-state="activeLayoutGrid" @toggle-maximize="toggleMaximize" @detach-panel="detachPanelToExternalWindow">
                            <agi-canvas-editor :screen-path="screenPath"></agi-canvas-editor>
                        </agi-sub-workspace>
                    </div>

                    <div v-if="isPanelVisible('AgiScreenEditor')" :class="[getPanelClass('AgiScreenEditor'), 'column']">
                        <agi-sub-workspace title="Screen Source Editor" panel-name="AgiScreenEditor" :layout-state="activeLayoutGrid" @toggle-maximize="toggleMaximize" @detach-panel="detachPanelToExternalWindow">
                            <agi-screen-editor :screen-path="screenPath"></agi-screen-editor>
                        </agi-sub-workspace>
                    </div>

                    <div v-if="isPanelVisible('AgiComponentEditor')" :class="[getPanelClass('AgiComponentEditor'), 'column']">
                        <agi-sub-workspace title="Component Source Editor" panel-name="AgiComponentEditor" :layout-state="activeLayoutGrid" @toggle-maximize="toggleMaximize" @detach-panel="detachPanelToExternalWindow">
                            <agi-component-editor :screen-path="screenPath"></agi-component-editor>
                        </agi-sub-workspace>
                    </div>
                </div>
                <agi-command-palette></agi-command-palette>
            </div>
        `,
        mounted() {
            window.addEventListener('beforeunload', this.closeExternalWindows);
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

            this.hydrateMcpOrchestratorFromDatabase();
        },
        beforeUnmount() {
            window.removeEventListener('beforeunload', this.closeExternalWindows);
            if (this.poller) clearInterval(this.poller);
            this.closeExternalWindows();
        },
        methods: {
            isPanelVisible(panelName) {
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
                // Quick global macro shortcuts for window arrangements
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
                // SAFETY BLOCK: Check if the orchestrator engine has mounted to the window scope yet
                if (!window.AgiMcpEngine) {
                    console.warn("⏳ AgiMcpEngine not found yet. Backing off and retrying in 50ms...");
                    setTimeout(() => this.hydrateMcpOrchestratorFromDatabase(), 50);
                    return; // Halt this execution pass until the engine is bound
                }

                console.info("📡 AgiWorkspace initiating database tool hydration stream...");

                fetch('/rest/s1/agi-ide/getAllTools', {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                })
                    .then(res => res.json())
                    .then(data => {
                        // Condition A: We have active tools stored in the database
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
                        }
                        // Condition B: The server connection worked, but the tool library is empty
                        else {
                            console.info("ℹ️ Database tool table is empty. Injecting local testing fallbacks...");
                            this.injectLocalFallbackTools();
                        }
                    })
                    .catch(err => {
                        console.warn("⚠️ Database connection failed or timed out. Injecting local testing fallbacks:", err);
                        this.injectLocalFallbackTools();
                    });
            },

            injectLocalFallbackTools() {
                window.AgiMcpEngine.registerTool({
                    command: '/add-mock-field',
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
            // Inside AgiWorkspace.qvt.js -> methods:
            triggerCommandPaletteOverlay() {
                console.info("📡 AgiWorkspace broadcasting manual click activation pass to layout overlay panel...");

                // We pass an event down the common runtime bus to wake up the hidden palette element cleanly
                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'force-open-command-palette',
                        panelName: this.activeScreens[0] || 'AgiCanvasEditor', // Fallback context matching active view
                        artifactLocation: this.screenPath
                    });
                } else {
                    // Fallback: If contextBus initialization is delayed, fall straight back to direct component search
                    const paletteComponent = window.AgiComponents?.['agi-command-palette'];
                    if (paletteComponent && typeof paletteComponent.openPalette === 'function') {
                        paletteComponent.openPalette();
                    }
                }
            },
        }
    };

    window.AgiWorkspace = AgiWorkspace;

    if (window.moqui && window.moqui.webrootVueApp) {
        window.moqui.webrootVueApp.component('agi-workspace', AgiWorkspace);
    }
})();