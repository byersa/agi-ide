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

                // 5-Point Flex Split Ratio for Left Pane (Studio): 0, 35, 50, 65, 100 (%)
                studioWidthPercent: 50,

                // Full-Width Top Sliding Drawer States
                showDiscussionDrawer: false,
                showDagDrawer: false,

                // Active Discussion / DAG Context
                activeDiscussionId: '',
                activeDiscussionTitle: '',
                selectedStage: null,
                selectedParentStage: null,

                // Multi-Editor Visibility State (Right Pane)
                activeEditors: ['AgiScreenEditor'],
                availableEditors: [
                    { id: 'AgiCanvasEditor', label: 'Canvas Viewport', icon: 'preview', color: 'cyan-4' },
                    { id: 'AgiScreenEditor', label: 'Screen XML', icon: 'code', color: 'amber-4' },
                    { id: 'AgiComponentEditor', label: 'Component Source', icon: 'extension', color: 'teal-4' },
                    { id: 'AgiTestRunner', label: 'Test Runner', icon: 'science', color: 'purple-3' },
                    { id: 'AgiReportEditor', label: 'Report / Print', icon: 'description', color: 'blue-4' }
                ],

                activeFocusedCoordinate: '',
                activeServiceUri: '',
                isDirty: false,
                showUnsavedSwitchDialog: false,
                pendingSwitchItem: null,

                activeWorkspaceBuffer: {
                    workspaceBufferId: '',
                    metaJsonBuffer: null
                },
                loadedComponents: {
                    AgiPipelineIndex: false,
                    AgiPipelineCanvas: false,
                    AgiStageInspector: false,
                    AgiCanvasEditor: false,
                    AgiScreenEditor: false,
                    AgiServiceEditor: false,
                    AgiEntityEditor: false,
                    AgiComponentEditor: false,
                    AgiStyleEditor: false,
                    AgiStudio: false,
                    AgiEditors: false,
                    MoquiXmlHost: true,
                    AgiArtifactPalette: false,
                    AgiWorkEffortDetail: false,
                    AgiNewComponentWizard: false,
                    AgiIntentDetail: false,
                    AgiTestRunner: false,
                    AgiReportEditor: false
                },
                editorConstructors: {
                    AgiPipelineIndex: null,
                    AgiPipelineCanvas: null,
                    AgiStageInspector: null,
                    AgiCanvasEditor: null,
                    AgiScreenEditor: null,
                    AgiServiceEditor: null,
                    AgiEntityEditor: null,
                    AgiComponentEditor: null,
                    AgiStyleEditor: null,
                    AgiStudio: null,
                    AgiEditors: null,
                    AgiArtifactPalette: null,
                    MoquiXmlHost: null,
                    AgiWorkEffortDetail: null,
                    AgiNewComponentWizard: null,
                    AgiIntentDetail: null,
                    AgiTestRunner: null,
                    AgiReportEditor: null
                }
            };
        },
        computed: {
            isWorkspaceReady() {
                return !!(
                    this.loadedComponents.AgiStudio &&
                    this.loadedComponents.AgiEditors &&
                    this.loadedComponents.AgiPipelineIndex &&
                    this.loadedComponents.AgiPipelineCanvas
                );
            },
            currentArtifactLabel() {
                if (!this.localScreenPath) return 'No Artifact Loaded';
                const parts = this.localScreenPath.split('/');
                return parts[parts.length - 1];
            },
            editorWidthPercent() {
                return 100 - this.studioWidthPercent;
            },
            leftPaneStyle() {
                if (this.studioWidthPercent <= 0) return { display: 'none' };
                if (this.studioWidthPercent >= 100) return { flex: '0 0 100%', width: '100%' };
                return {
                    flex: `0 0 ${this.studioWidthPercent}%`,
                    width: `${this.studioWidthPercent}%`,
                    maxWidth: `${this.studioWidthPercent}%`
                };
            },
            rightPaneStyle() {
                const rightPercent = this.editorWidthPercent;
                if (rightPercent <= 0) return { display: 'none' };
                if (rightPercent >= 100) return { flex: '0 0 100%', width: '100%' };
                return {
                    flex: `0 0 ${rightPercent}%`,
                    width: `${rightPercent}%`,
                    maxWidth: `${rightPercent}%`
                };
            },
            activeEditorCount() {
                return this.activeEditors.length;
            }
        },
        mounted() {
            if (this.$q && this.$q.dark) {
                this.$q.dark.set(true);
            }

            window.openProductionPreview = () => this.openProductionView();
            const vm = this;
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');

            this.contextBus.onmessage = function (event) {
                if (!event.data) return;

                if (event.data.event === 'set-studio-width' && event.data.widthPercent !== undefined) {
                    vm.setStudioWidth(event.data.widthPercent);
                    return;
                }

                if (event.data.event === 'artifact-relocated') {
                    const oldUri = event.data.oldUri;
                    const newUri = event.data.newUri;

                    if (vm.localScreenPath === oldUri || !vm.localScreenPath) {
                        vm.executeArtifactSwitch({ value: newUri });
                    }
                    return;
                }

                if (event.data.event === 'open-screen-artifact' && event.data.artifactUri) {
                    const targetUri = vm.normalizeArtifactUri(event.data.artifactUri);
                    vm.localScreenPath = targetUri;
                    vm.isDirty = false;

                    vm.hydrateWorkspaceBuffer();

                    if (!vm.activeEditors.includes('AgiScreenEditor') && !targetUri.endsWith('.md')) {
                        vm.activeEditors.push('AgiScreenEditor');
                    } else if (targetUri.endsWith('.md') && !vm.activeEditors.includes('AgiComponentEditor')) {
                        vm.activeEditors.push('AgiComponentEditor');
                    }
                    return;
                }

                if (event.data.event === 'focus-editor-panel' && event.data.panelName) {
                    const target = event.data.panelName;
                    if (!vm.activeEditors.includes(target)) {
                        vm.activeEditors.push(target);
                    }
                    return;
                }

                if (event.data.event === 'artifact-state-mutated') {
                    vm.isDirty = true;
                    if (event.data.artifactUri && event.data.artifactUri !== vm.localScreenPath) {
                        vm.localScreenPath = event.data.artifactUri;
                    }
                    vm.hydrateWorkspaceBuffer();
                    return;
                }

                if (event.data.event === 'artifact-saved-to-disk') {
                    vm.isDirty = false;
                    vm.hydrateWorkspaceBuffer();
                    return;
                }
            };

            this.loadRequiredComponents();
            this.resolveTargetComponentAndPath();

            this._keyHandler = (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    vm.handleChildEditorSave();
                }
            };
            window.addEventListener('keydown', this._keyHandler);

            this._unloadHandler = (e) => {
                if (vm.isDirty) {
                    e.preventDefault();
                    e.returnValue = 'You have unsaved changes in the workspace buffer. Are you sure you want to leave?';
                    return e.returnValue;
                }
            };
            window.addEventListener('beforeunload', this._unloadHandler);

            this.hydrateMcpOrchestratorFromDatabase();
            this.hydrateWorkspaceBuffer();
        },

        beforeUnmount() {
            if (window.openProductionPreview) delete window.openProductionPreview;
            if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
            if (this._unloadHandler) window.removeEventListener('beforeunload', this._unloadHandler);
            if (this.contextBus) this.contextBus.close();
        },

        template: `
            <div class="column fit no-wrap bg-slate-950 font-mono text-white overflow-hidden" style="height: 100vh; min-height: 0; width: 100%;">
                
                <!-- 1. FULL WIDTH, SINGLE-LINE HEADER (FIXED 36px) -->
                <div 
                    id="agi-workspace-header" 
                    class="row items-center justify-between q-px-sm bg-slate-950 border-bottom-dark text-white" 
                    style="height: 36px; min-height: 36px; max-height: 36px; flex: 0 0 36px; border-bottom: 1px solid #334155; z-index: 40;"
                >
                    <!-- Left: Development Label + Domain Dropdown + Artifacts Button -->
                    <div class="row items-center q-gutter-x-sm no-wrap">
                        <span class="text-caption text-weight-bolder text-cyan-4 letter-spacing-1">
                            DEVELOPMENT
                        </span>

                        <q-separator vertical dark class="q-mx-xs bg-slate-700" />

                        <!-- Domain Dropdown (High Contrast Fix + Instructions Hook) -->
                        <q-btn-dropdown 
                            flat dense no-caps 
                            menu-content-class="bg-slate-900 text-slate-100 shadow-8"
                            class="q-px-sm rounded-borders text-weight-bold bg-slate-900 text-purple-2"
                            style="border: 1px solid #64748b; font-size: 11px;"
                            :label="targetComponentName"
                        >
                            <q-list dense dark class="bg-slate-900 text-slate-100 font-mono q-py-xs" style="min-width: 170px; border: 1px solid #475569;">
                                <q-item clickable v-close-popup class="hover-bg-slate-800 text-slate-200" @click="handleDomainAction('instructions')">
                                    <q-item-section avatar style="min-width: 24px;">
                                        <q-icon name="menu_book" size="xs" color="cyan-3" />
                                    </q-item-section>
                                    <q-item-section class="text-caption text-weight-medium">Instructions</q-item-section>
                                </q-item>
                                <q-separator dark class="bg-slate-700 q-my-xs" />
                                <q-item clickable v-close-popup class="hover-bg-slate-800 text-slate-200" @click="handleDomainAction('new')">
                                    <q-item-section avatar style="min-width: 24px;">
                                        <q-icon name="add" size="xs" color="cyan-4" />
                                    </q-item-section>
                                    <q-item-section class="text-caption text-weight-medium">New Domain</q-item-section>
                                </q-item>
                                <q-item clickable v-close-popup class="hover-bg-slate-800 text-slate-200" @click="handleDomainAction('save')">
                                    <q-item-section avatar style="min-width: 24px;">
                                        <q-icon name="save" size="xs" color="teal-4" />
                                    </q-item-section>
                                    <q-item-section class="text-caption text-weight-medium">Save</q-item-section>
                                </q-item>
                                <q-item clickable v-close-popup class="hover-bg-slate-800 text-slate-200" @click="handleDomainAction('rename')">
                                    <q-item-section avatar style="min-width: 24px;">
                                        <q-icon name="edit" size="xs" color="amber-4" />
                                    </q-item-section>
                                    <q-item-section class="text-caption text-weight-medium">Rename</q-item-section>
                                </q-item>
                                <q-separator dark class="bg-slate-700 q-my-xs" />
                                <q-item clickable v-close-popup class="hover-bg-slate-800 text-rose-3" @click="handleDomainAction('delete')">
                                    <q-item-section avatar style="min-width: 24px;">
                                        <q-icon name="delete" size="xs" color="rose-4" />
                                    </q-item-section>
                                    <q-item-section class="text-caption text-weight-medium text-rose-3">Delete</q-item-section>
                                </q-item>
                            </q-list>
                        </q-btn-dropdown>

                        <!-- Artifacts Palette Button -->
                        <q-btn 
                            flat dense no-caps size="xs"
                            class="q-px-sm rounded-borders bg-slate-900 text-cyan-3"
                            style="border: 1px solid #475569; font-size: 11px;"
                            icon="folder_open" 
                            label="Artifacts" 
                            @click="showArtifactPalette = true"
                        >
                            <q-tooltip>Browse and select component workspace artifacts</q-tooltip>
                        </q-btn>
                        <!-- Production Launch Button -->
                        <q-btn 
                            flat dense no-caps size="xs"
                            class="q-px-sm rounded-borders text-weight-bold bg-slate-900 text-green-3"
                            style="border: 1px solid #15803d; font-size: 11px;"
                            icon="play_arrow" 
                            label="Production" 
                            @click="openProductionView"
                        >
                            <q-tooltip>Launch live application screen in dedicated tab</q-tooltip>
                        </q-btn>
                    </div>

                    <!-- Right: Focused Artifact Label -->
                    <div class="row items-center q-gutter-x-xs text-caption text-slate-300">
                        <q-icon name="code" size="xs" color="cyan-4" />
                        <span class="text-weight-bold text-slate-100">{{ currentArtifactLabel }}</span>
                        <q-badge v-if="isDirty" color="amber-10" text-color="black" class="q-ml-xs text-weight-bolder" style="font-size: 9px;">
                            DRAFT
                        </q-badge>
                    </div>
                </div>

                <!-- 2. FULL-WIDTH SLIDING DRAWERS (SPANNING 100% OF WORKSPACE) -->

                <!-- DRAWER A: AgiPipelineIndex (DISCUSSION INITIATIVES) -->
                <q-slide-transition>
                    <div 
                        v-if="showDiscussionDrawer" 
                        class="full-width column no-wrap bg-slate-900 shadow-10 relative-position overflow-hidden" 
                        style="height: 340px; min-height: 340px; max-height: 340px; border-bottom: 2px solid #0284c7; z-index: 35; flex: 0 0 340px;"
                    >
                        <div class="row items-center justify-between q-px-sm bg-black" style="height: 26px; min-height: 26px; flex: 0 0 26px; border-bottom: 1px solid #1e293b;">
                            <span class="text-caption font-mono text-cyan-3 text-weight-bold" style="font-size: 11px;">
                                <q-icon name="forum" size="14px" class="q-mr-xs" /> PIPELINE INITIATIVES &amp; DISCUSSIONS
                            </span>
                            <q-btn flat round dense icon="close" size="xs" color="slate-400" @click="showDiscussionDrawer = false" />
                        </div>
                        <div class="col full-width overflow-auto relative-position" style="flex: 1 1 0%; min-height: 0;">
                            <component 
                                :is="editorConstructors.AgiPipelineIndex"
                                v-if="editorConstructors.AgiPipelineIndex"
                                :active-discussion-id="activeDiscussionId"
                                :target-component="targetComponentName"
                                @pipeline-selected="onPipelineSelectedFromDrawer"
                                @new-pipeline-created="onPipelineSelectedFromDrawer"
                            />
                        </div>
                    </div>
                </q-slide-transition>

                <!-- DRAWER B: AgiPipelineCanvas (FULL-WIDTH 2D VISUAL DAG) -->
                <q-slide-transition>
                    <div 
                        v-if="showDagDrawer" 
                        class="full-width column no-wrap bg-slate-900 shadow-10 relative-position overflow-hidden" 
                        style="height: 440px; min-height: 440px; max-height: 440px; border-bottom: 2px solid #f59e0b; z-index: 35; flex: 0 0 440px;"
                    >
                        <div class="row items-center justify-between q-px-sm bg-black" style="height: 26px; min-height: 26px; flex: 0 0 26px; border-bottom: 1px solid #1e293b;">
                            <span class="text-caption font-mono text-amber-3 text-weight-bold" style="font-size: 11px;">
                                <q-icon name="account_tree" size="14px" class="q-mr-xs" /> PIPELINE DIRECTED ACYCLIC GRAPH (DAG)
                            </span>
                            <q-btn flat round dense icon="close" size="xs" color="slate-400" @click="showDagDrawer = false" />
                        </div>
                        <div class="col full-width overflow-hidden relative-position" style="flex: 1 1 0%; min-height: 0;">
                            <component 
                                :is="editorConstructors.AgiPipelineCanvas"
                                v-if="editorConstructors.AgiPipelineCanvas"
                                ref="globalCanvasRef"
                                :discussion-id="activeDiscussionId"
                                :target-component="targetComponentName"
                                :selected-stage-id="selectedStage?.pipelineStepId || selectedStage?.stageId || ''"
                                @stage-selected="onStageSelectedFromDrawer"
                                @open-artifact="onArtifactOpened"
                            />
                        </div>
                    </div>
                </q-slide-transition>

                <!-- 3. LOADING STATE -->
                <div v-if="!isWorkspaceReady" class="col column justify-center items-center q-gutter-md bg-slate-950 text-center">
                    <q-spinner-gears color="cyan-4" size="3em" />
                    <div class="text-caption text-slate-400 font-mono">Synchronizing Development Environment for {{ targetComponentName }}...</div>
                </div>

                <!-- 4. SPLIT WORKSPACE: LEFT (AgiStudio) & RIGHT (AgiEditors) -->
                <div 
                    v-else 
                    class="col full-width row no-wrap relative-position overflow-hidden" 
                    style="flex: 1 1 0%; min-height: 0; height: 100%;"
                >
                    <!-- LEFT PANE: AgiStudio -->
                    <div 
                        v-show="studioWidthPercent > 0"
                        class="column no-wrap overflow-hidden relative-position" 
                        :style="[leftPaneStyle, { borderRight: '1px solid #1e293b', minHeight: '0', height: '100%' }]"
                    >
                        <component 
                            :is="editorConstructors.AgiStudio" 
                            v-if="editorConstructors.AgiStudio"
                            :active-artifact="localScreenPath"
                            :target-component-prop="targetComponentName"
                            :width-percent="studioWidthPercent"
                            :show-discussion-drawer="showDiscussionDrawer"
                            :show-dag-drawer="showDagDrawer"
                            :active-discussion-id-prop="activeDiscussionId"
                            :active-discussion-title-prop="activeDiscussionTitle"
                            :selected-stage-prop="selectedStage"
                            @toggle-discussion="toggleDiscussionDrawer"
                            @toggle-dag="toggleDagDrawer"
                            @pipeline-selected="onPipelineSelectedFromDrawer"
                            @stage-selected="onStageSelectedFromDrawer"
                            @stage-dispatched="onStageDispatched"
                            @set-width="setStudioWidth"
                            @open-artifact="onArtifactOpened"
                        ></component>
                    </div>

                    <!-- RIGHT PANE: Multi-Editor Shell -->
                    <div 
                        v-show="studioWidthPercent < 100"
                        class="col column no-wrap overflow-hidden relative-position bg-slate-900" 
                        :style="[rightPaneStyle, { minHeight: '0', height: '100%' }]"
                    >
                        <!-- Right Pane Header: Reciprocal Sizing Presets & Editor Checkboxes -->
                        <div 
                            class="row items-center justify-between q-px-sm bg-slate-950 text-white" 
                            style="height: 32px; min-height: 32px; flex: 0 0 32px; border-bottom: 1px solid #334155;"
                        >
                            <!-- Left: Reciprocal 5-Point Splitter Buttons (High Contrast Enforced) -->
                            <div class="row items-center q-gutter-x-none rounded-borders bg-slate-900" style="border: 1px solid #475569; overflow: hidden;">
                                <button 
                                    v-for="preset in [100, 65, 50, 35, 0]" 
                                    :key="preset"
                                    type="button"
                                    class="q-btn q-btn-item non-selectable no-outline q-btn--flat q-btn--rectangle q-btn--dense"
                                    :style="{
                                        padding: '2px 8px',
                                        fontSize: '11px',
                                        fontFamily: 'monospace',
                                        fontWeight: editorWidthPercent === preset ? '800' : '500',
                                        backgroundColor: editorWidthPercent === preset ? '#f59e0b' : '#0f172a',
                                        color: editorWidthPercent === preset ? '#000000 !important' : '#cbd5e1 !important',
                                        borderRight: '1px solid #334155',
                                        borderTop: 'none',
                                        borderBottom: 'none',
                                        borderLeft: 'none',
                                        cursor: 'pointer',
                                        lineHeight: '18px'
                                    }"
                                    @click="setEditorWidth(preset)"
                                >
                                    <span class="q-btn__content text-center col items-center q-anchor--skip justify-center row" :style="{ color: editorWidthPercent === preset ? '#000000 !important' : '#cbd5e1 !important' }">
                                        {{ preset }}%
                                    </span>
                                    <q-tooltip>Set Right Pane width to {{ preset }}% (Left to {{ 100 - preset }}%)</q-tooltip>
                                </button>
                            </div>

                            <!-- Center: Current Artifact Path -->
                            <div class="text-caption text-slate-200 font-mono ellipsis q-px-sm text-weight-medium" style="max-width: 45%;">
                                {{ localScreenPath || 'No Artifact Focused' }}
                            </div>

                            <!-- Right: Multi-Editor Selection Dropdown Menu (High Contrast Enforced) -->
                            <q-btn-dropdown 
                                flat dense no-caps size="xs" 
                                menu-content-class="bg-slate-900 text-slate-100 shadow-8"
                                class="q-px-sm rounded-borders bg-slate-900 text-cyan-3"
                                style="border: 1px solid #475569; font-size: 11px;"
                                icon="tune" 
                                :label="'Editors (' + activeEditorCount + ')'"
                            >
                                <q-list dense dark class="bg-slate-900 font-mono text-caption q-pa-xs" style="min-width: 220px; border: 1px solid #475569;">
                                    <div class="text-overline text-slate-400 q-px-sm q-pt-xs" style="font-size: 9px; letter-spacing: 0.5px;">ACTIVE EDITORS</div>
                                    <q-separator dark class="bg-slate-700 q-my-xs" />
                                    <q-item 
                                        v-for="ed in availableEditors" 
                                        :key="ed.id"
                                        tag="label" 
                                        dense 
                                        clickable
                                        class="rounded-borders q-my-none text-slate-200 hover:bg-slate-800"
                                    >
                                        <q-item-section side>
                                            <q-checkbox 
                                                v-model="activeEditors" 
                                                :val="ed.id" 
                                                size="xs" 
                                                color="cyan-4" 
                                                dark 
                                            />
                                        </q-item-section>
                                        <q-item-section avatar style="min-width: 20px;">
                                            <q-icon :name="ed.icon" size="14px" :color="ed.color" />
                                        </q-item-section>
                                        <q-item-section>
                                            <span :class="activeEditors.includes(ed.id) ? 'text-white text-weight-bolder' : 'text-slate-300'">
                                                {{ ed.label }}
                                            </span>
                                        </q-item-section>
                                    </q-item>
                                </q-list>
                            </q-btn-dropdown>
                        </div>

                        <!-- Right Pane Body: Mounted AgiEditors Component -->
                        <div class="col full-width overflow-hidden relative-position" style="flex: 1 1 0%; min-height: 0;">
                            <component 
                                :is="editorConstructors.AgiEditors"
                                v-if="editorConstructors.AgiEditors"
                                :active-editors="activeEditors"
                                :available-editors="availableEditors"
                                :local-screen-path="localScreenPath"
                                :companion-qvt-path="companionQvtPath"
                                :target-component-name="targetComponentName"
                                :layout-tree="activeWorkspaceBuffer.metaJsonBuffer"
                                :editor-constructors="editorConstructors"
                                @toggle-editor="toggleEditor"
                                @trigger-save="handleChildEditorSave"
                            />
                            <div v-else class="fit row flex-center text-slate-500 text-caption font-mono">
                                Loading Editors Container...
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ARTIFACT PALETTE MODAL -->
                <q-dialog v-model="showArtifactPalette" position="top">
                    <q-card style="width: 600px; max-width: 90vw;" class="bg-slate-900 text-white shadow-24 border border-slate-700">
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
            resolveCsrfToken() {
                return window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || "";
            },

            toggleDiscussionDrawer() {
                this.showDiscussionDrawer = !this.showDiscussionDrawer;
                if (this.showDiscussionDrawer) {
                    this.showDagDrawer = false;
                }
            },

            toggleDagDrawer() {
                this.showDagDrawer = !this.showDagDrawer;
                if (this.showDagDrawer) {
                    this.showDiscussionDrawer = false;
                    this.$nextTick(() => {
                        setTimeout(() => {
                            if (this.$refs.globalCanvasRef && typeof this.$refs.globalCanvasRef.scheduleRecalcEdges === 'function') {
                                this.$refs.globalCanvasRef.scheduleRecalcEdges();
                            }
                        }, 150);
                    });
                }
            },

            onPipelineSelectedFromDrawer(item) {
                if (!item) return;
                const newId = String(item.discussionId || '');
                const wasAlreadyOpen = this.showDiscussionDrawer;
                const isInitialSelection = !this.activeDiscussionId && newId;

                this.activeDiscussionId = newId;
                this.activeDiscussionTitle = item.title || item.topic || `Pipeline #${newId}`;
                this.selectedStage = null;
                this.selectedParentStage = null;
                if (item.targetArtifactUri) {
                    this.localScreenPath = this.normalizeArtifactUri(item.targetArtifactUri);
                }

                if (!isInitialSelection && wasAlreadyOpen) {
                    this.showDiscussionDrawer = false;
                }
            },

            onStageSelectedFromDrawer(payload) {
                if (payload && payload.stage) {
                    this.selectedStage = payload.stage;
                    this.selectedParentStage = payload.parentStage;
                } else {
                    this.selectedStage = payload;
                    this.selectedParentStage = null;
                }
            },

            async onStageDispatched(eventData) {
                if (this.$refs.globalCanvasRef && typeof this.$refs.globalCanvasRef.fetchPipelineGraph === 'function') {
                    await this.$refs.globalCanvasRef.fetchPipelineGraph();
                    const newStepId = eventData?.pipelineStepId;
                    if (newStepId && this.$refs.globalCanvasRef.dagLayout?.nodeMap) {
                        const targetNode = this.$refs.globalCanvasRef.dagLayout.nodeMap[String(newStepId)];
                        if (targetNode) {
                            this.$refs.globalCanvasRef.selectStage(targetNode, 'OUT');
                        }
                    }
                }
            },

            toggleEditor(edId) {
                const idx = this.activeEditors.indexOf(edId);
                if (idx !== -1) {
                    this.activeEditors.splice(idx, 1);
                } else {
                    this.activeEditors.push(edId);
                }
            },

            setStudioWidth(pct) {
                const numeric = Number(pct);
                if (!isNaN(numeric) && numeric >= 0 && numeric <= 100) {
                    this.studioWidthPercent = numeric;
                }
            },

            setEditorWidth(pct) {
                const numeric = Number(pct);
                if (!isNaN(numeric) && numeric >= 0 && numeric <= 100) {
                    this.studioWidthPercent = 100 - numeric;
                }
            },

            handleDomainAction(action) {
                if (action === 'instructions') {
                    const instructionsPath = `component://${this.targetComponentName}/mcp/instructions/component.md`;
                    this.executeArtifactSwitch({ value: instructionsPath });
                    if (!this.activeEditors.includes('AgiComponentEditor') && !this.activeEditors.includes('AgiScreenEditor')) {
                        this.activeEditors.push('AgiScreenEditor');
                    }
                } else if (action === 'new') {
                    if (this.contextBus) this.contextBus.postMessage({ event: 'open-new-component-wizard' });
                } else if (action === 'save') {
                    this.handleChildEditorSave();
                } else if (action === 'rename') {
                    const newName = prompt(`Rename domain component "${this.targetComponentName}" to:`, this.targetComponentName);
                    if (newName && newName.trim()) {
                        this.targetComponentName = newName.trim();
                        this.$q?.notify({ type: 'info', message: `Target domain updated to: ${this.targetComponentName}` });
                    }
                } else if (action === 'delete') {
                    if (confirm(`Are you sure you want to remove the domain configuration for "${this.targetComponentName}"?`)) {
                        this.$q?.notify({ type: 'warning', message: `Domain deletion queued for ${this.targetComponentName}` });
                    }
                }
            },

            onArtifactOpened(eventData) {
                if (typeof eventData === 'string') {
                    this.executeArtifactSwitch({ value: eventData });
                } else if (eventData?.artifactUri) {
                    this.executeArtifactSwitch({ value: eventData.artifactUri });
                }
                if (!this.activeEditors.includes('AgiScreenEditor')) {
                    this.activeEditors.push('AgiScreenEditor');
                }
            },

            resolveTargetComponentAndPath() {
                let path = window.location.pathname;
                const urlParams = new URLSearchParams(window.location.search);
                let queryPath = urlParams.get('screenPath') || this.screenPath || '';

                if (queryPath) {
                    this.localScreenPath = this.normalizeArtifactUri(queryPath);
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
                    { name: 'AgiPipelineIndex', url: '/agi-ide-assets/AgiPipelineIndex.qvt.js', globalVar: 'AgiPipelineIndex' },
                    { name: 'AgiPipelineCanvas', url: '/agi-ide-assets/AgiPipelineCanvas.qvt.js', globalVar: 'AgiPipelineCanvas' },
                    { name: 'AgiDiscussionViewer', url: '/agi-ide-assets/inspector/AgiDiscussionViewer.qvt.js', globalVar: 'AgiDiscussionViewer' },
                    { name: 'AgiStageHeader', url: '/agi-ide-assets/inspector/AgiStageHeader.qvt.js', globalVar: 'AgiStageHeader' },
                    { name: 'AgiPlanSpecViewer', url: '/agi-ide-assets/inspector/AgiPlanSpecViewer.qvt.js', globalVar: 'AgiPlanSpecViewer' },
                    { name: 'AgiStageIngressViewport', url: '/agi-ide-assets/inspector/AgiStageIngressViewport.qvt.js', globalVar: 'AgiStageIngressViewport' },
                    { name: 'AgiStageInspector', url: '/agi-ide-assets/AgiStageInspector.qvt.js', globalVar: 'AgiStageInspector' },
                    { name: 'AgiStyleEditor', url: '/agi-ide-assets/AgiStyleEditor.qvt.js', fallbackUrl: '/apps/agi-ide/assets/AgiStyleEditor.qvt.js', globalVar: 'AgiStyleEditor' },
                    { name: 'AgiCanvasEditor', url: '/agi-ide-assets/AgiCanvasEditor.qvt.js', globalVar: 'AgiCanvasEditor' },
                    { name: 'AgiScreenEditor', url: '/agi-ide-assets/AgiScreenEditor.qvt.js', globalVar: 'AgiScreenEditor' },
                    { name: 'AgiServiceEditor', url: '/agi-ide-assets/AgiServiceEditor.qvt.js', globalVar: 'AgiServiceEditor' },
                    { name: 'AgiEntityEditor', url: '/agi-ide-assets/AgiEntityEditor.qvt.js', globalVar: 'AgiEntityEditor' },
                    { name: 'AgiComponentEditor', url: '/agi-ide-assets/AgiComponentEditor.qvt.js', globalVar: 'AgiComponentEditor' },
                    { name: 'AgiArtifactPalette', url: '/agi-ide-assets/AgiArtifactPalette.qvt.js', globalVar: 'AgiArtifactPalette' },
                    { name: 'MoquiXmlHost', url: '/agi-ai-assets/moqui-xml-host.qvt.js', globalVar: 'MoquiXmlHost' },
                    { name: 'AgiWorkEffortDetail', url: '/agi-ai-assets/AgiWorkEffortDetail.qvt.js', globalVar: 'AgiWorkEffortDetail' },
                    { name: 'AgiNewComponentWizard', url: '/agi-ide-assets/AgiNewComponentWizard.qvt.js', globalVar: 'AgiNewComponentWizard' },
                    { name: 'AgiIntentDetail', url: '/agi-ide-assets/AgiIntentDetail.qvt.js', globalVar: 'AgiIntentDetail' },
                    { name: 'AgiStudio', url: '/agi-ide-assets/AgiStudio.qvt.js', globalVar: 'AgiStudio' },
                    { name: 'AgiEditors', url: '/agi-ide-assets/AgiEditors.qvt.js', globalVar: 'AgiEditors' },
                    { name: 'AgiInstructions', url: '/agi-ide-assets/AgiInstructions.qvt.js', globalVar: 'AgiInstructions' },
                    { name: 'AgiTestRunner', url: '/agi-ide-assets/util/AgiTestRunner.qvt.js', globalVar: 'AgiTestRunner' },
                ];

                assets.forEach(asset => {
                    const register = (compDef) => {
                        const rawDef = markRaw(compDef);
                        vm.editorConstructors[asset.name] = rawDef;
                        vm.loadedComponents[asset.name] = true;

                        const app = window.moqui?.webrootVueApp;
                        if (app) {
                            if (!app.component(asset.name)) app.component(asset.name, rawDef);
                            const kebab = asset.name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
                            if (!app.component(kebab)) app.component(kebab, rawDef);
                        }
                    };

                    const compDef = window[asset.globalVar]
                        || window.AgiComponents?.[asset.name]
                        || window.AgiComponents?.[asset.name.toLowerCase()]
                        || (window.moqui?.webrootVueApp?._context?.components?.[asset.name.toLowerCase()]);

                    if (compDef) {
                        register(compDef);
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
                                register(loadedDef);
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
                        }
                    })
                    .catch(function () { });
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

            async handleChildEditorSave(savePayload = null) {
                const activeUser = window.AGI_SERVER_USER_ID || 'ANONYMOUS';
                const headers = {
                    'moquiSessionToken': this.resolveCsrfToken(),
                    'Content-Type': 'application/json'
                };

                let targetUri = this.localScreenPath;
                let rawXml = null;
                let activeBlueprint = null;

                if (savePayload && typeof savePayload === 'object') {
                    if (savePayload.artifactUri) targetUri = this.normalizeArtifactUri(savePayload.artifactUri);
                    if (savePayload.xmlContent) rawXml = savePayload.xmlContent;
                    if (savePayload.layoutTree) activeBlueprint = savePayload.layoutTree;
                }

                if (!activeBlueprint && !rawXml) {
                    const ideStore = window.useAgiIdeStore ? window.useAgiIdeStore() : null;
                    activeBlueprint = ideStore ? ideStore.getActiveBlueprint : this.activeWorkspaceBuffer.metaJsonBuffer;
                }

                if (rawXml && rawXml.trim() && !targetUri.endsWith('.md')) {
                    try {
                        const parseResp = await axios.post('/rest/s1/agi-ide/parseXmlToTree', {
                            artifactUri: targetUri,
                            xmlContent: rawXml
                        }, { headers });
                        if (parseResp.data?.layoutTree) {
                            activeBlueprint = parseResp.data.layoutTree;
                            this.activeWorkspaceBuffer.metaJsonBuffer = activeBlueprint;
                        }
                    } catch (pe) {
                        console.warn("Could not parse raw XML to AST before save:", pe.message);
                    }
                }

                if (!activeBlueprint && !rawXml) return;

                const jsonStringPayload = activeBlueprint ? JSON.stringify(activeBlueprint) : null;

                try {
                    if (jsonStringPayload) {
                        await axios.post('/rest/s1/agi-ide/storeWorkspaceBuffer', {
                            workspaceBufferId: this.activeWorkspaceBuffer.workspaceBufferId,
                            artifactUri: targetUri,
                            userId: activeUser,
                            metaJsonBuffer: jsonStringPayload
                        }, { headers });
                    }

                    const fileSaveResponse = await axios.post('/rest/s1/agi-ide/saveScreenXml', {
                        artifactUri: targetUri,
                        xmlText: rawXml || null,
                        metaJsonBuffer: jsonStringPayload,
                        verifyEntities: !targetUri.endsWith('.md')
                    }, { headers });

                    if (fileSaveResponse.data?.status === 'ENTITY_NOT_FOUND') {
                        const errors = fileSaveResponse.data.errorList || ['Unknown entity validation failure'];
                        this.$q?.notify({
                            type: 'negative',
                            icon: 'error_outline',
                            message: `Entity Verification Failed: ${errors.join(', ')}`,
                            caption: 'Save aborted to prevent runtime 500 errors',
                            timeout: 7000,
                            actions: [{ label: 'Dismiss', color: 'white' }]
                        });
                        return;
                    }

                    if (fileSaveResponse.data?.status === 'SUCCESS' || fileSaveResponse.status === 200) {
                        this.isDirty = false;
                        this.$q?.notify({
                            type: 'positive',
                            message: `Successfully saved ${targetUri.split('/').pop()} to disk!`,
                            icon: 'save'
                        });

                        if (this.contextBus) {
                            this.contextBus.postMessage({
                                event: 'artifact-saved-to-disk',
                                artifactUri: targetUri
                            });
                        }
                    }
                } catch (err) {
                    let displayMsg = 'Failed to write workspace modifications to disk.';
                    if (err.response?.data?.errors) {
                        displayMsg = err.response.data.errors;
                    } else if (err.response?.data?.errorList) {
                        displayMsg = err.response.data.errorList.join(', ');
                    } else if (err.message) {
                        displayMsg = err.message;
                    }

                    this.$q?.notify({
                        type: 'negative',
                        icon: 'report_problem',
                        message: 'Save Aborted: Validation Error',
                        caption: displayMsg,
                        timeout: 8000,
                        actions: [{ label: 'Dismiss', color: 'white' }]
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
                const rawUri = item.value || '';
                const uri = this.normalizeArtifactUri(rawUri);

                if (uri.endsWith('.xml')) {
                    this.localScreenPath = uri;
                    this.companionQvtPath = '';
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
            normalizeArtifactUri(rawUri) {
                if (!rawUri || typeof rawUri !== 'string') return '';
                let uri = rawUri.trim();
                if (uri.startsWith('component://')) return uri;

                const compMarker = 'runtime/component/';
                const markerIdx = uri.indexOf(compMarker);
                if (markerIdx !== -1) {
                    return 'component://' + uri.substring(markerIdx + compMarker.length);
                }

                if (!uri.startsWith('/')) {
                    return `component://${this.targetComponentName}/${uri}`;
                }

                return uri;
            },
            openProductionView() {
                let targetUrl = `/${this.targetComponentName}`;

                if (this.localScreenPath && this.localScreenPath.startsWith(`component://${this.targetComponentName}/screen/`)) {
                    let subPath = this.localScreenPath
                        .replace(`component://${this.targetComponentName}/screen/`, '')
                        .replace(/\.xml$/, '');

                    if (subPath !== this.targetComponentName && !subPath.endsWith('/' + this.targetComponentName)) {
                        targetUrl = `/${this.targetComponentName}/${subPath}`;
                    }
                }

                window.open(targetUrl, 'moqui-production-preview');
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