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
            }
        }
    };

    window.AgiWorkspace = AgiWorkspace;

    if (window.moqui && window.moqui.webrootVueApp) {
        window.moqui.webrootVueApp.component('agi-workspace', AgiWorkspace);
    }
})();