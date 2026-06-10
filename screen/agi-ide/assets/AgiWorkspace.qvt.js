(function() {
    const AgiWorkspace = {
        name: 'AgiWorkspace',
        template: `
            <div class="row no-wrap q-col-gutter-md fit items-stretch" style="min-height: 80vh;">
                <!-- AgiCanvasEditor Panel -->
                <div v-if="isPanelVisible('AgiCanvasEditor')" :class="[getPanelClass('AgiCanvasEditor'), 'column']">
                    <q-card flat bordered class="col column">
                        <q-card-section class="row items-center justify-between q-py-xs bg-grey-3">
                            <div class="text-subtitle2 text-bold">Canvas Renderer</div>
                            <div class="row q-gutter-xs">
                                <q-btn flat round dense size="sm" :icon="activeLayoutGrid.AgiCanvasEditor.state === 'maximized' ? 'fullscreen_exit' : 'fullscreen'" @click="toggleMaximize('AgiCanvasEditor')"></q-btn>
                                <q-btn flat round dense size="sm" icon="open_in_new" @click="detachPanelToExternalWindow('AgiCanvasEditor')"></q-btn>
                            </div>
                        </q-card-section>
                        <q-separator></q-separator>
                        <q-card-section class="col relative-position q-pa-none">
                            <agi-canvas-editor :screen-path="screenPath"></agi-canvas-editor>
                        </q-card-section>
                    </q-card>
                </div>

                <!-- AgiScreenEditor Panel -->
                <div v-if="isPanelVisible('AgiScreenEditor')" :class="[getPanelClass('AgiScreenEditor'), 'column']">
                    <q-card flat bordered class="col column">
                        <q-card-section class="row items-center justify-between q-py-xs bg-grey-3">
                            <div class="text-subtitle2 text-bold">Screen Source Editor</div>
                            <div class="row q-gutter-xs">
                                <q-btn flat round dense size="sm" :icon="activeLayoutGrid.AgiScreenEditor.state === 'maximized' ? 'fullscreen_exit' : 'fullscreen'" @click="toggleMaximize('AgiScreenEditor')"></q-btn>
                                <q-btn flat round dense size="sm" icon="open_in_new" @click="detachPanelToExternalWindow('AgiScreenEditor')"></q-btn>
                            </div>
                        </q-card-section>
                        <q-separator></q-separator>
                        <q-card-section class="col relative-position q-pa-none">
                            <agi-screen-editor :screen-path="screenPath"></agi-screen-editor>
                        </q-card-section>
                    </q-card>
                </div>

                <!-- AgiComponentEditor Panel -->
                <div v-if="isPanelVisible('AgiComponentEditor')" :class="[getPanelClass('AgiComponentEditor'), 'column']">
                    <q-card flat bordered class="col column">
                        <q-card-section class="row items-center justify-between q-py-xs bg-grey-3">
                            <div class="text-subtitle2 text-bold">Component Source Editor</div>
                            <div class="row q-gutter-xs">
                                <q-btn flat round dense size="sm" :icon="activeLayoutGrid.AgiComponentEditor.state === 'maximized' ? 'fullscreen_exit' : 'fullscreen'" @click="toggleMaximize('AgiComponentEditor')"></q-btn>
                                <q-btn flat round dense size="sm" icon="open_in_new" @click="detachPanelToExternalWindow('AgiComponentEditor')"></q-btn>
                            </div>
                        </q-card-section>
                        <q-separator></q-separator>
                        <q-card-section class="col relative-position q-pa-none">
                            <agi-component-editor :screen-path="screenPath"></agi-component-editor>
                        </q-card-section>
                    </q-card>
                </div>
            </div>
        `,
        props: {
            screenPath: {
                type: String,
                default: 'SampleForm'
            }
        },
        data() {
            return {
                activeLayoutGrid: {
                    AgiCanvasEditor: { state: 'docked', windowRef: null },
                    AgiScreenEditor: { state: 'docked', windowRef: null },
                    AgiComponentEditor: { state: 'docked', windowRef: null }
                }
            };
        },
        mounted() {
            window.addEventListener('beforeunload', this.closeExternalWindows);
            // Poller to detect when external windows are closed by user
            this.poller = setInterval(() => {
                Object.keys(this.activeLayoutGrid).forEach(name => {
                    const panel = this.activeLayoutGrid[name];
                    if (panel.state === 'external' && panel.windowRef && panel.windowRef.closed) {
                        panel.state = 'docked';
                        panel.windowRef = null;
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
                const panel = this.activeLayoutGrid[panelName];
                if (panel.state === 'external') return false;
                
                const hasMaximized = Object.keys(this.activeLayoutGrid).some(
                    name => this.activeLayoutGrid[name].state === 'maximized'
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
                    name => this.activeLayoutGrid[name].state === 'docked'
                ).length;
                
                if (visibleDockedCount === 3) return 'col-4';
                if (visibleDockedCount === 2) return 'col-6';
                return 'col-12';
            },
            toggleMaximize(panelName) {
                const panel = this.activeLayoutGrid[panelName];
                if (panel.state === 'maximized') {
                    panel.state = 'docked';
                } else {
                    // Dock all others, set this to maximized
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
})();
