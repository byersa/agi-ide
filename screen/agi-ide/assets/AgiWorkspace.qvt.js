(function () {
    const AgiWorkspace = {
        name: 'AgiWorkspace',
        props: {
            screenPath: {
                type: String,
                default: null,
            },
            layoutTree: {
                type: [Object, Array, String],
                default: () => null
            }
        },
        data() {
            return {
                localScreenPath: this.screenPath || '',
                companionQvtPath: '',
                themeArtifactPath: 'component://nursinghome/theme/default.theme.json',
                showArtifactPalette: false,
                targetComponentName: 'nursinghome',
                ignoredFrameworkComponents: ['agi-ide', 'agi-ai', 'moqui-usl', 'mantle-usl', 'webroot', 'tools'],

                activeFocusedCoordinate: '',
                activeServiceUri: '',
                isDirty: false,
                showUnsavedSwitchDialog: false,
                pendingSwitchItem: null,

                windowDisplayMode: 'Collage Grid',
                displayModeOptions: ['Collage Grid', 'Focus Canvas', 'Focus Source', 'Focus Theme'],
                activeScreens: ['AgiCanvasEditor', 'AgiScreenEditor', 'AgiComponentEditor', 'AgiStyleEditor'],
                availableScreensOptions: [
                    { label: 'Canvas Viewport', value: 'AgiCanvasEditor' },
                    { label: 'Screen Source', value: 'AgiScreenEditor' },
                    { label: 'Service Editor', value: 'AgiServiceEditor' },
                    { label: 'Entity Editor', value: 'AgiEntityEditor' },
                    { label: 'Component Source', value: 'AgiComponentEditor' },
                    { label: 'Theme / Style Editor', value: 'AgiStyleEditor' }
                ],

                activeLayoutGrid: {
                    AgiCanvasEditor: { state: 'docked', windowRef: null },
                    AgiScreenEditor: { state: 'docked', windowRef: null },
                    AgiServiceEditor: { state: 'docked', windowRef: null },
                    AgiEntityEditor: { state: 'docked', windowRef: null },
                    AgiComponentEditor: { state: 'docked', windowRef: null },
                    AgiStyleEditor: { state: 'docked', windowRef: null }
                },
                focusedPanel: 'AgiCanvasEditor',

                activeWorkspaceBuffer: {
                    workspaceBufferId: '',
                    metaJsonBuffer: null
                },
                loadedComponents: {
                    AgiCanvasEditor: false,
                    AgiScreenEditor: false,
                    AgiServiceEditor: false,
                    AgiEntityEditor: false,
                    AgiComponentEditor: false,
                    AgiStyleEditor: false,
                    AgiPromptEditor: false,
                    MoquiXmlHost: true,
                    AgiArtifactPalette: false,
                    AgiWorkEffortDetail: false,
                    AgiNewComponentWizard: false,
                    AgiIntentDetail: false,
                    AgiTestRunner: false,
                },
                editorConstructors: {
                    AgiCanvasEditor: null,
                    AgiScreenEditor: null,
                    AgiServiceEditor: null,
                    AgiEntityEditor: null,
                    AgiComponentEditor: null,
                    AgiStyleEditor: null,
                    AgiPromptEditor: null,
                    AgiArtifactPalette: null,
                    MoquiXmlHost: null,
                    AgiWorkEffortDetail: null,
                    AgiNewComponentWizard: null,
                    AgiIntentDetail: null,
                    AgiTestRunner: null,
                }
            };
        },
        computed: {
            isWorkspaceReady() {
                return !!(
                    this.loadedComponents.AgiCanvasEditor &&
                    this.loadedComponents.AgiScreenEditor &&
                    this.loadedComponents.AgiComponentEditor &&
                    this.loadedComponents.AgiStyleEditor
                );
            }
        },
        mounted() {
            const vm = this;
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');

            // 🎯 Listen for local broadcast mutations from AgiPromptEditor, Move Tools, or Canvas
            this.contextBus.onmessage = function (event) {
                if (!event.data) return;

                // Handle external artifact relocation
                if (event.data.event === 'artifact-relocated') {
                    const oldUri = event.data.oldUri;
                    const newUri = event.data.newUri;

                    if (vm.localScreenPath === oldUri || !vm.localScreenPath) {
                        console.info(`🚚 [AgiWorkspace] Switching active artifact path from ${oldUri} -> ${newUri}`);
                        vm.executeArtifactSwitch({ value: newUri });
                    }
                    return;
                }

                if (event.data.event === 'open-screen-artifact' && event.data.artifactUri) {
                    if (vm.localScreenPath !== event.data.artifactUri) {
                        vm.executeArtifactSwitch({ value: event.data.artifactUri });
                    }
                    return;
                }

                if (event.data.event === 'element-selected-by-id' && event.data.mariaId) {
                    if (!event.data.mariaId.includes('agi-workspace-root') && !event.data.mariaId.includes('AgiWorkspace')) {
                        vm.activeFocusedCoordinate = event.data.mariaId;
                    }
                    return;
                }

                if (event.data.event === 'artifact-state-mutated') {
                    console.info("📡 [AgiWorkspace] Detected artifact mutation via ContextBus. Setting isDirty=true...");
                    vm.isDirty = true;
                    vm.hydrateWorkspaceBuffer();
                }

                if (event.data?.event === 'open-service-artifact') {
                    vm.activeServiceUri = event.data.serviceUri || '';
                    if (!vm.activeScreens.includes('AgiServiceEditor')) {
                        vm.activeScreens.push('AgiServiceEditor');
                    }
                    vm.focusedPanel = 'AgiServiceEditor';
                }
            };

            this.loadRequiredComponents();
            this.resolveTargetComponentAndPath();

            // Keyboard Handlers (Save Ctrl+S, Snapping Super+Arrows)
            this._keyHandler = (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    vm.handleChildEditorSave();
                    return;
                }
                vm.handleKeyboardSnapping(e);
            };
            window.addEventListener('keydown', this._keyHandler);

            // Prevent accidental tab closure if unsaved draft exists
            this._unloadHandler = (e) => {
                if (vm.isDirty) {
                    e.preventDefault();
                    e.returnValue = 'You have unsaved changes in the workspace buffer. Are you sure you want to leave?';
                    return e.returnValue;
                }
                vm.closeExternalWindows();
            };
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
                <div id="agi-workspace-header" @click.stop class="row items-center justify-between q-pa-sm bg-grey-10 text-white rounded-borders shadow-2">
                    
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
                                <q-badge v-if="isDirty" color="amber-10" text-color="black" class="q-ml-sm text-caption font-mono text-weight-bold animate-pulse">
                                    <q-icon name="warning" size="xs" class="q-mr-xs" /> 
                                </q-badge>
                            </div>
                        </div>
                    </div>
                
                    <!-- Right Controls: Explicit @click.stop on interactive controls -->
                    <div class="row items-center q-gutter-x-sm" @click.stop>
                        
                        <q-btn 
                            :color="isDirty ? 'positive' : 'grey-8'" 
                            icon="save" 
                            :label="isDirty ? 'Save to Disk (*)' : 'Saved'" 
                            dense 
                            class="q-px-sm font-mono text-weight-bold"
                            @click.stop="handleChildEditorSave"
                        >
                            <q-tooltip class="bg-grey-10 text-caption">Compile and write workspace draft to physical XML file (Ctrl+S)</q-tooltip>
                        </q-btn>
                
                        <q-btn 
                            v-if="isDirty"
                            color="negative" 
                            flat
                            icon="undo" 
                            label="Revert" 
                            dense 
                            class="q-px-sm font-mono"
                            @click.stop="revertBufferToDisk"
                        >
                            <q-tooltip class="bg-grey-10 text-caption">Discard buffer draft and restore original file from disk</q-tooltip>
                        </q-btn>
                
                        <q-separator vertical dark class="q-mx-xs" />
                
                        <q-select
                            v-model="windowDisplayMode"
                            :options="displayModeOptions"
                            label="Display Mode"
                            dense
                            outlined
                            dark
                            bg-color="grey-9"
                            style="min-width: 150px;"
                            @click.stop
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
                            bg-color="grey-9"
                            style="min-width: 240px;"
                            @click.stop
                        ></q-select>
                
                        <q-btn 
                            color="deep-purple-7" 
                            icon="terminal" 
                            label="AI Prompt" 
                            dense 
                            class="q-px-sm"
                            @click.stop="triggerPromptOverlay"
                        >
                            <q-tooltip class="bg-grey-10 text-caption">Launch AGI AI Assistant Core</q-tooltip>
                        </q-btn>
                        
                        <q-btn 
                            color="primary" 
                            icon="add_box" 
                            label="New Component" 
                            dense 
                            class="q-px-sm"
                            @click.stop="triggerNewComponentWizard"
                        >
                            <q-tooltip class="bg-grey-10 text-caption">Initialize a new Moqui component skeleton</q-tooltip>
                        </q-btn>
                
                        <q-btn 
                            color="cyan-8" 
                            icon="folder_open" 
                            label="Artifacts" 
                            dense 
                            class="q-px-sm"
                            @click.stop="showArtifactPalette = true"
                        >
                            <q-tooltip class="bg-grey-10 text-caption">Browse and focus workspace artifacts</q-tooltip>
                        </q-btn>
                        <q-btn 
                            color="negative" 
                            flat
                            icon="restart_alt" 
                            label="Revert to Disk" 
                            dense 
                            class="q-px-sm font-mono text-caption"
                            @click.stop="revertBufferToDisk"
                        >
                            <q-tooltip class="bg-grey-10 text-caption">Discard buffer draft and reload physical XML file from disk</q-tooltip>
                        </q-btn>
                        <q-btn 
                            color="teal-8" 
                            icon="science" 
                            label="Tests" 
                            dense 
                            class="q-px-sm font-mono"
                            @click.stop="triggerTestRunnerOverlay"
                        >
                            <q-tooltip class="bg-grey-10 text-caption">Run in-app test suites and verify invariants</q-tooltip>
                        </q-btn>
                    </div>
                </div>

                <!-- 2. Loading Spinner Placeholder -->
                <div v-if="!isWorkspaceReady" class="col column justify-center items-center q-gutter-md bg-grey-1 text-center">
                    <q-spinner-gears color="deep-purple-7" size="4em" />
                    <div class="text-subtitle1 text-grey-8 text-weight-medium">Synchronizing Workspace Components for {{ targetComponentName }}...</div>
                </div>

                <!-- 3. Active Workspace Grid -->
                <div v-else class="col column fit no-wrap" style="min-height: 80vh;">
        
                    <div v-if="!localScreenPath || localScreenPath === ''" class="column justify-center items-center col q-gutter-md bg-grey-1 text-center rounded-borders">
                        <q-icon name="folder_open" size="64px" color="primary" />
                        <div class="text-h5 text-grey-8 text-weight-bold">Target App: {{ targetComponentName }}</div>
                        <p class="text-caption text-grey-8 max-w-sm">
                            No artifact screen selected for <strong>{{ targetComponentName }}</strong>.<br/>
                            Select an artifact screen from the Blueprint Manager or command palette to begin editing.
                        </p>
                    </div>

                    <div v-else class="row q-col-gutter-md fit items-stretch align-content-start">
                        
                        <!-- Canvas Renderer Panel -->
                        <div 
                            v-if="isPanelVisible('AgiCanvasEditor')" 
                            :class="[getPanelClass('AgiCanvasEditor')]" 
                            style="min-height: 420px;"
                            @click="focusedPanel = 'AgiCanvasEditor'"
                        >
                            <div class="fit column rounded-borders border-dark overflow-hidden bg-grey-10" style="border: 1px solid #334155;">
                                <div class="bg-black text-white q-pa-xs row items-center justify-between font-mono text-caption">
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
                            <div class="fit column rounded-borders border-dark overflow-hidden bg-grey-10" style="border: 1px solid #334155;">
                                <div class="bg-black text-white q-pa-xs row items-center justify-between font-mono text-caption">
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
                            <div class="fit column rounded-borders border-dark overflow-hidden bg-grey-10" style="border: 1px solid #334155;">
                                <div class="bg-black text-white q-pa-xs row items-center justify-between font-mono text-caption">
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

                        <!-- Declarative Theme / Style Editor Panel -->
                        <div 
                            v-if="isPanelVisible('AgiStyleEditor')" 
                            :class="[getPanelClass('AgiStyleEditor')]" 
                            style="min-height: 420px;"
                            @click="focusedPanel = 'AgiStyleEditor'"
                        >
                            <div class="fit column rounded-borders border-dark overflow-hidden bg-grey-10" style="border: 1px solid #334155;">
                                <div class="bg-black text-white q-pa-xs row items-center justify-between font-mono text-caption">
                                    <div class="row items-center q-gutter-x-xs">
                                        <q-icon name="palette" color="purple-4" />
                                        <span class="text-weight-bold">Theme / Style Editor</span>
                                    </div>
                                    <div class="row items-center q-gutter-x-xs">
                                        <q-btn flat dense icon="west" size="xs" color="cyan-4" @click.stop="snapPanel('AgiStyleEditor', 'left')"><q-tooltip>Snap Left (Super+Left)</q-tooltip></q-btn>
                                        <q-btn flat dense icon="east" size="xs" color="cyan-4" @click.stop="snapPanel('AgiStyleEditor', 'right')"><q-tooltip>Snap Right (Super+Right)</q-tooltip></q-btn>
                                        <q-btn flat dense :icon="activeLayoutGrid.AgiStyleEditor.state === 'maximized' ? 'fullscreen_exit' : 'fullscreen'" size="xs" color="primary" @click.stop="toggleMaximize('AgiStyleEditor')"><q-tooltip>Maximize (Super+Up)</q-tooltip></q-btn>
                                    </div>
                                </div>
                                <div class="col overflow-auto">
                                    <component 
                                        v-if="editorConstructors.AgiStyleEditor"
                                        :is="editorConstructors.AgiStyleEditor" 
                                        :theme-uri="themeArtifactPath"
                                        @trigger-save="handleThemeSave"
                                    ></component>
                                </div>
                            </div>
                        </div>

                        <!-- Service Definition Editor Panel -->
                        <div 
                            v-if="isPanelVisible('AgiServiceEditor')" 
                            :class="[getPanelClass('AgiServiceEditor')]" 
                            style="min-height: 420px;"
                            @click="focusedPanel = 'AgiServiceEditor'"
                        >
                            <div class="fit column rounded-borders border-dark overflow-hidden bg-grey-10" style="border: 1px solid #334155;">
                                <div class="bg-black text-white q-pa-xs row items-center justify-between font-mono text-caption">
                                    <div class="row items-center q-gutter-x-xs">
                                        <q-icon name="miscellaneous_services" color="amber-4" />
                                        <span class="text-weight-bold">Service Architecture Editor</span>
                                    </div>
                                    <div class="row items-center q-gutter-x-xs">
                                        <q-btn flat dense icon="west" size="xs" color="cyan-4" @click.stop="snapPanel('AgiServiceEditor', 'left')" />
                                        <q-btn flat dense icon="east" size="xs" color="cyan-4" @click.stop="snapPanel('AgiServiceEditor', 'right')" />
                                        <q-btn flat dense :icon="activeLayoutGrid.AgiServiceEditor?.state === 'maximized' ? 'fullscreen_exit' : 'fullscreen'" size="xs" color="primary" @click.stop="toggleMaximize('AgiServiceEditor')" />
                                    </div>
                                </div>
                                <div class="col overflow-auto">
                                    <component 
                                        v-if="editorConstructors.AgiServiceEditor"
                                        :is="editorConstructors.AgiServiceEditor" 
                                        :service-uri="activeServiceUri" 
                                        :layout-tree="activeWorkspaceBuffer.metaJsonBuffer" 
                                        @trigger-save="handleChildEditorSave"
                                    ></component>
                                </div>
                            </div>
                        </div>
                        <!-- Entity Model Editor Panel -->
                        <div 
                            v-if="isPanelVisible('AgiEntityEditor')" 
                            :class="[getPanelClass('AgiEntityEditor')]" 
                            style="min-height: 420px;"
                            @click="focusedPanel = 'AgiEntityEditor'"
                        >
                            <div class="fit column rounded-borders border-dark overflow-hidden bg-grey-10" style="border: 1px solid #334155;">
                                <div class="bg-black text-white q-pa-xs row items-center justify-between font-mono text-caption">
                                    <div class="row items-center q-gutter-x-xs">
                                        <q-icon name="storage" color="secondary" />
                                        <span class="text-weight-bold">Entity Schema Editor</span>
                                    </div>
                                    <div class="row items-center q-gutter-x-xs">
                                        <q-btn flat dense icon="west" size="xs" color="cyan-4" @click.stop="snapPanel('AgiEntityEditor', 'left')" />
                                        <q-btn flat dense icon="east" size="xs" color="cyan-4" @click.stop="snapPanel('AgiEntityEditor', 'right')" />
                                        <q-btn flat dense :icon="activeLayoutGrid.AgiEntityEditor?.state === 'maximized' ? 'fullscreen_exit' : 'fullscreen'" size="xs" color="primary" @click.stop="toggleMaximize('AgiEntityEditor')" />
                                    </div>
                                </div>
                                <div class="col overflow-auto">
                                    <component 
                                        v-if="editorConstructors.AgiEntityEditor"
                                        :is="editorConstructors.AgiEntityEditor" 
                                        :entity-uri="localScreenPath" 
                                        :layout-tree="activeWorkspaceBuffer.metaJsonBuffer" 
                                        @trigger-save="handleChildEditorSave"
                                    ></component>
                                </div>
                            </div>
                        </div>
                    </div>
            
                </div>
                
                <component :is="editorConstructors.AgiPromptEditor" v-if="loadedComponents.AgiPromptEditor"></component>
                <component :is="editorConstructors.AgiTestRunner" v-if="loadedComponents.AgiTestRunner"></component>
                <component :is="editorConstructors.AgiNewComponentWizard" v-if="loadedComponents.AgiNewComponentWizard"></component>

                <!-- ARTIFACT PALETTE MODAL -->
                <q-dialog v-model="showArtifactPalette" position="top">
                    <q-card style="width: 600px; max-width: 90vw;" class="bg-grey-10 text-white shadow-24">
                        <q-card-section class="row items-center justify-between bg-black q-pa-sm border-bottom-dark">
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

                <!-- UNSAVED NAVIGATION CONFIRMATION MODAL -->
                <q-dialog v-model="showUnsavedSwitchDialog" persistent>
                    <q-card class="bg-slate-900 text-white shadow-24" style="min-width: 420px; border: 1px solid #334155;">
                        <q-card-section class="row items-center q-gutter-x-sm bg-slate-950 q-pa-sm">
                            <q-icon name="warning" color="amber" size="sm" />
                            <div class="text-subtitle2 text-weight-bold font-mono">Unsaved Changes in Draft Buffer</div>
                        </q-card-section>

                        <q-card-section class="q-pa-md text-caption font-mono text-slate-200">
                            You have modified <strong>{{ localScreenPath }}</strong> in the workspace buffer without saving to disk.
                            <br/><br/>
                            Do you want to save your changes to disk before switching artifacts?
                        </q-card-section>

                        <q-card-actions align="right" class="bg-slate-950 q-pa-sm">
                            <q-btn flat label="Cancel" color="grey-4" v-close-popup />
                            <q-btn flat label="Discard & Switch" color="negative" @click="confirmDiscardAndSwitch" />
                            <q-btn label="Save & Switch" color="positive" @click="confirmSaveAndSwitch" />
                        </q-card-actions>
                    </q-card>
                </q-dialog>

            </div>
        `,
        methods: {
            getPanelClass(panelName) {
                const panel = this.activeLayoutGrid[panelName];
                if (panel.state === 'maximized') return 'col-12';
                if (panel.state === 'left' || panel.state === 'right') return 'col-12 col-md-6';

                const hasMaximized = Object.keys(this.activeLayoutGrid).some(
                    name => this.activeLayoutGrid[name].state === 'maximized' && this.activeScreens.includes(name)
                );
                if (hasMaximized) {
                    return panel.state === 'maximized' ? 'col-12' : 'hidden';
                }
                return 'col-12 col-md-6';
            },

            isPanelVisible(panelName) {
                if (!this.loadedComponents[panelName]) return false;
                if (!this.activeScreens.includes(panelName)) return false;
                return this.activeLayoutGrid[panelName].state !== 'minimized';
            },

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
                        this.themeArtifactPath = `component://${candidateComp}/theme/default.theme.json`;
                    }
                }
            },

            async loadRequiredComponents() {
                const vm = this;
                const markRaw = (window.Vue && window.Vue.markRaw) ? window.Vue.markRaw : (obj) => obj;

                const assets = [
                    { name: 'AgiStyleEditor', url: '/agi-ide-assets/AgiStyleEditor.qvt.js', fallbackUrl: '/apps/agi-ide/assets/AgiStyleEditor.qvt.js', globalVar: 'AgiStyleEditor' },
                    { name: 'AgiCanvasEditor', url: '/agi-ide-assets/AgiCanvasEditor.qvt.js', globalVar: 'AgiCanvasEditor' },
                    { name: 'AgiScreenEditor', url: '/agi-ide-assets/AgiScreenEditor.qvt.js', globalVar: 'AgiScreenEditor' },
                    { name: 'AgiServiceEditor', url: '/agi-ide-assets/AgiServiceEditor.qvt.js', globalVar: 'AgiServiceEditor' },
                    { name: 'AgiEntityEditor', url: '/agi-ide-assets/AgiEntityEditor.qvt.js', globalVar: 'AgiEntityEditor' },
                    { name: 'AgiComponentEditor', url: '/agi-ide-assets/AgiComponentEditor.qvt.js', globalVar: 'AgiComponentEditor' },
                    { name: 'AgiArtifactPalette', url: '/agi-ide-assets/AgiArtifactPalette.qvt.js', globalVar: 'AgiArtifactPalette' },
                    { name: 'MoquiXmlHost', url: '/agi-ai-assets/moqui-xml-host.qvt.js', globalVar: 'MoquiXmlHost' },
                    { name: 'AgiWorkEffortDetail', url: '/agi-ai-assets/AgiWorkEffortDetail.qvt.js', globalVar: 'AgiWorkEffortDetail' },
                    { name: 'DiscussionDetail', url: '/agi-ai-assets/DiscussionDetail.qvt.js', globalVar: 'DiscussionDetail' },
                    { name: 'DiscussionTree', url: '/agi-ai-assets/DiscussionTree.qvt.js', globalVar: 'DiscussionTree' },
                    { name: 'AgiNewComponentWizard', url: '/agi-ide-assets/AgiNewComponentWizard.qvt.js', globalVar: 'AgiNewComponentWizard' },
                    { name: 'AgiIntentDetail', url: '/agi-ide-assets/AgiIntentDetail.qvt.js', globalVar: 'AgiIntentDetail' },
                    { name: 'AgiPromptEditor', url: '/agi-ide-assets/AgiPromptEditor.qvt.js', globalVar: 'AgiPromptEditor' },
                    { name: 'AgiInstructions', url: '/agi-ide-assets/AgiInstructions.qvt.js', globalVar: 'AgiInstructions' },
                    { name: 'AgiTestRunner', url: '/agi-ide-assets/util/AgiTestRunner.qvt.js', globalVar: 'AgiTestRunner' },
                ];

                assets.forEach(asset => {
                    const compDef = window[asset.globalVar]
                        || window.AgiComponents?.[asset.name]
                        || window.AgiComponents?.[asset.name.toLowerCase()]
                        || (window.moqui?.webrootVueApp?._context?.components?.[asset.name.toLowerCase()]);

                    if (compDef) {
                        vm.editorConstructors[asset.name] = markRaw(compDef);
                        vm.loadedComponents[asset.name] = true;
                        return;
                    }

                    const script = document.createElement('script');
                    script.type = 'text/javascript';
                    script.src = asset.url;
                    script.async = true;

                    script.onload = () => {
                        const checkRegistration = (attempts = 0) => {
                            const loadedDef = window[asset.globalVar]
                                || window.AgiComponents?.[asset.name]
                                || window.AgiComponents?.[asset.name.toLowerCase()];

                            if (loadedDef) {
                                vm.editorConstructors[asset.name] = markRaw(loadedDef);
                                vm.loadedComponents[asset.name] = true;
                            } else if (attempts < 20) {
                                setTimeout(() => checkRegistration(attempts + 1), 25);
                            }
                        };
                        checkRegistration();
                    };

                    script.onerror = () => {
                        if (asset.fallbackUrl) {
                            const fallbackScript = document.createElement('script');
                            fallbackScript.type = 'text/javascript';
                            fallbackScript.src = asset.fallbackUrl;
                            fallbackScript.onload = script.onload;
                            document.head.appendChild(fallbackScript);
                        }
                    };

                    document.head.appendChild(script);
                });
            },

            handleDisplayModeChange(val) {
                if (val === 'Focus Canvas') {
                    this.activeScreens = ['AgiCanvasEditor'];
                } else if (val === 'Focus Source') {
                    this.activeScreens = ['AgiScreenEditor'];
                } else if (val === 'Focus Theme') {
                    this.activeScreens = ['AgiStyleEditor'];
                } else {
                    this.activeScreens = ['AgiCanvasEditor', 'AgiScreenEditor', 'AgiComponentEditor', 'AgiStyleEditor'];
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
                        } catch (e) { }
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
                        targetComponent: this.targetComponentName,
                        focusCoordinate: this.activeFocusedCoordinate || ''
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

            async revertBufferToDisk() {
                if (!this.localScreenPath) return;
                if (!confirm(`Discard all unsaved draft changes and reload "${this.localScreenPath}" from disk?`)) return;

                const headers = { 'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || '' };
                try {
                    await axios.post('/rest/s1/agi-ide/clearWorkspaceBuffer', {
                        artifactUri: this.localScreenPath
                    }, { headers });

                    this.isDirty = false;
                    if (this.$q) {
                        this.$q.notify({
                            type: 'info',
                            message: 'Buffer discarded. Reloaded from disk.'
                        });
                    }

                    await this.hydrateWorkspaceBuffer();
                } catch (err) {
                    console.error("Failed to clear workspace buffer:", err);
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
                        this.isDirty = false;
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

            async handleThemeSave(payload) {
                const headers = { 'X-CSRF-Token': window.AGI_SERVER_CSRF_TOKEN };
                try {
                    const resp = await axios.post('/rest/s1/agi-ide/saveThemeJson', {
                        artifactUri: payload.themeUri || this.themeArtifactPath,
                        themeData: payload
                    }, { headers });

                    if (resp.data?.status === 'SUCCESS') {
                        this.$q?.notify({
                            type: 'positive',
                            message: 'Theme artifact successfully saved to disk!'
                        });
                    }
                } catch (err) {
                    this.$q?.notify({
                        type: 'negative',
                        message: 'Failed to save theme artifact.'
                    });
                }
            },

            onArtifactSelectedFromWorkspace(item) {
                if (this.isDirty) {
                    this.pendingSwitchItem = item;
                    this.showUnsavedSwitchDialog = true;
                    return;
                }
                this.executeArtifactSwitch(item);
            },

            async confirmSaveAndSwitch() {
                await this.handleChildEditorSave();
                this.showUnsavedSwitchDialog = false;
                if (this.pendingSwitchItem) {
                    this.executeArtifactSwitch(this.pendingSwitchItem);
                    this.pendingSwitchItem = null;
                }
            },

            confirmDiscardAndSwitch() {
                this.isDirty = false;
                this.showUnsavedSwitchDialog = false;
                if (this.pendingSwitchItem) {
                    this.executeArtifactSwitch(this.pendingSwitchItem);
                    this.pendingSwitchItem = null;
                }
            },

            executeArtifactSwitch(item) {
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

                this.activeScreens = ['AgiCanvasEditor', 'AgiScreenEditor', 'AgiComponentEditor', 'AgiStyleEditor'];
                this.hydrateWorkspaceBuffer();

                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'open-screen-artifact',
                        artifactLocation: this.localScreenPath,
                        companionQvtLocation: this.companionQvtPath,
                        targetComponent: this.targetComponentName
                    });
                }
            },
            triggerTestRunnerOverlay() {
                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'open-test-runner'
                    });
                }
            },
        },
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