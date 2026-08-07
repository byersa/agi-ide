(function () {
    const AgiBlueprintEditor = {
        name: 'AgiBlueprintEditor',
        template: `
            <q-dialog v-model="isOpen" position="right" full-height max-width="95vw">
                <div class="agi-blueprint-editor-root bg-white bordered rounded-borders column no-wrap" style="width: 950px; max-width: 95vw; height: 100vh;">
                    
                    <!-- Top Navigation & Header -->
                    <div class="q-pa-sm bg-slate-900 text-white row items-center justify-between col-auto">
                        <div class="row items-center">
                            <q-icon name="account_tree" color="primary" size="sm" class="q-mr-xs" />
                            <div>
                                <div class="text-subtitle2 text-weight-bold">Blueprint Master & Discovery</div>
                                <div class="text-caption text-grey-5 font-mono">
                                    {{ selectedArtifact ? selectedArtifact.artifactPath : 'Select or query an artifact below' }}
                                </div>
                            </div>
                        </div>
                        <div class="row items-center q-gutter-xs">
                            <q-btn size="sm" color="primary" icon="add" label="New Intent Node" no-caps :disable="!selectedArtifact" @click="onAddNewRootIntent" />
                            <q-btn size="sm" flat round icon="close" text-color="white" v-close-popup />
                        </div>
                    </div>

                    <!-- Split Master-Detail Horizontal Layout -->
                    <div class="col row no-wrap overflow-hidden full-width">
                        
                        <!-- LEFT PANE: Faceted Search & Discovery Sidebar -->
                        <div class="col-5 column no-wrap q-pa-sm border-right bg-grey-1 full-height">
                            <div class="text-caption text-weight-bold text-grey-8 q-mb-xs col-auto">
                                <q-icon name="filter_alt" size="16px" class="q-mr-xs" />
                                ARTIFACT DISCOVERY
                            </div>
                            
                            <!-- Search & Filter Controls -->
                            <div class="q-gutter-y-xs q-mb-sm col-auto">
                                <q-input 
                                    v-model="query.queryString" 
                                    dense 
                                    outlined 
                                    bg-color="white"
                                    placeholder="Filter by path..." 
                                    @update:model-value="debounceQuery"
                                >
                                    <template v-slot:append>
                                        <q-icon name="search" size="18px" />
                                    </template>
                                </q-input>

                                <!-- Facet Filtering Sub-Inputs -->
                                <div class="row q-col-gutter-xs">
                                    <div class="col-6">
                                        <q-input
                                            v-model="query.facetKey" 
                                            dense 
                                            outlined 
                                            bg-color="white"
                                            placeholder="Facet Key (e.g. HIPAA)" 
                                            class="text-caption"
                                            @update:model-value="debounceQuery"
                                        />
                                    </div>
                                    <div class="col-6">
                                        <q-input 
                                            v-model="query.facetValue" 
                                            dense 
                                            outlined 
                                            bg-color="white"
                                            placeholder="Facet Value" 
                                            class="text-caption"
                                            @update:model-value="debounceQuery"
                                        />
                                    </div>
                                </div>
                            </div>

                            <q-separator class="q-mb-xs col-auto" />

                            <!-- Loading State -->
                            <div v-if="loadingList" class="col column justify-center items-center">
                                <q-spinner color="primary" size="2em" />
                            </div>

                            <!-- Empty List State -->
                            <div v-else-if="!artifactList || artifactList.length === 0" class="col column justify-center items-center text-grey-6 text-caption text-italic q-pa-md text-center">
                                No artifacts matched the selected query or facet rules.
                            </div>

                            <!-- Artifact Result List -->
                            <div v-else class="col scroll">
                                <q-list bordered separator class="rounded-borders bg-white">
                                    <q-item 
                                        v-for="art in artifactList" 
                                        :key="art.agiArtifactId" 
                                        clickable 
                                        v-ripple
                                        :active="selectedArtifact && selectedArtifact.agiArtifactId === art.agiArtifactId"
                                        active-class="bg-blue-1 text-primary text-weight-bold"
                                        @click="selectArtifact(art)"
                                    >
                                        <q-item-section>
                                            <q-item-label class="font-mono text-caption text-weight-medium ellipsis">
                                                {{ art.artifactPath }}
                                            </q-item-label>
                                            <q-item-label caption class="row items-center justify-between q-mt-xs">
                                                <span>{{ art.completedIntentCount || 0 }}/{{ art.totalIntentCount || 0 }} Intents</span>
                                                <span class="text-weight-bold text-primary">{{ art.completionPercentage || 0 }}%</span>
                                            </q-item-label>
                                            <q-linear-progress 
                                                :value="(art.completionPercentage || 0) / 100" 
                                                color="positive" 
                                                track-color="grey-3" 
                                                size="4px" 
                                                class="q-mt-xs rounded-borders" 
                                            />
                                        </q-item-section>
                                    </q-item>
                                </q-list>
                            </div>
                        </div>

                        <!-- RIGHT PANE: Focused Discussion Tree & Telemetry -->
                        <div class="col-7 column no-wrap bg-white full-height">
                            
                            <!-- Unselected State -->
                            <div v-if="!selectedArtifact" class="col column justify-center items-center text-grey-6 text-italic text-center q-pa-md">
                                <q-icon name="touch_app" size="48px" class="q-mb-sm text-grey-4" />
                                <div>Select an artifact from the discovery panel on the left to view and manage its blueprint intent hierarchy.</div>
                            </div>

                            <!-- Selected Active Detail State -->
                            <div v-else class="col column no-wrap fit">
                                
                                <!-- Telemetry Status Header -->
                                <div class="q-pa-sm bg-slate-950 text-white border-bottom col-auto">
                                    <div class="row items-center justify-between text-caption q-mb-xs">
                                        <span class="text-grey-4 text-weight-bold">ARTIFACT PROGRESS:</span>
                                        <span class="text-primary font-mono font-weight-bold">
                                            {{ telemetry.completedIntentCount }} / {{ telemetry.totalIntentCount }} Intents ({{ telemetry.completionPercentage }}%)
                                        </span>
                                    </div>
                                    <q-linear-progress 
                                        :value="telemetry.completionPercentage / 100" 
                                        color="positive" 
                                        track-color="slate-800" 
                                        size="6px" 
                                        class="rounded-borders" 
                                    />
                                </div>

                                <q-separator class="col-auto" />

                                <!-- Active Discussion Tree Container -->
                                <div class="col scroll q-pa-xs">
                                    <!-- Active Discussion Tree Container -->
                                    <div class="col scroll q-pa-xs">
                                    <discussion-tree 
                                         ref="discussionTree"
                                         :agi-artifact-id="selectedArtifact.agiArtifactId"
                                         :source-reference-id="selectedArtifact.artifactPath">
                                         
                                         <template v-slot:node-detail="{ node }">
                                             <discussion-detail :node="node">
                                                 <!-- 🎯 Replaced inline form with AgiIntentDetail asset -->
                                                 <agi-intent-detail 
                                                     :node="node" 
                                                     :selected-artifact="selectedArtifact"
                                                     @intent-saved="onIntentSaved"
                                                     @cancel-draft="onCancelDraft"
                                                 />
                                             </discussion-detail>
                                         </template>
                                     </discussion-tree>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>

                </div>
            </q-dialog>
        `,
        props: {
            agiArtifactId: { type: String, required: false },
            artifactPath: { type: String, required: false }
        },
        data() {
            return {
                isOpen: false,
                loadingList: false,
                artifactList: [],
                selectedArtifact: null,
                queryTimer: null,
                query: {
                    queryString: '',
                    facetKey: '',
                    facetValue: ''
                },
                telemetry: {
                    totalIntentCount: 0,
                    completedIntentCount: 0,
                    completionPercentage: 0.0,
                    status: 'AasDraft'
                },
                contextBus: null
            };
        },
        mounted() {
            var vm = this;
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');

            this.contextBus.onmessage = function (event) {
                if (event.data && event.data.event === 'open-blueprint-editor') {
                    if (event.data.artifactLocation) {
                        vm.query.queryString = event.data.artifactLocation;
                    }
                    vm.isOpen = true;
                    vm.queryArtifacts();
                }
            };

            if (this.artifactPath) {
                this.query.queryString = this.artifactPath;
            }
            this.queryArtifacts();
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },
        methods: {
            debounceQuery() {
                if (this.queryTimer) clearTimeout(this.queryTimer);
                this.queryTimer = setTimeout(() => {
                    this.queryArtifacts();
                }, 300);
            },

            queryArtifacts() {
                var vm = this;
                this.loadingList = true;

                $.ajax({
                    type: 'GET',
                    url: '/rest/s1/agi-ide/blueprint/query-artifacts',
                    data: {
                        queryString: vm.query.queryString,
                        facetKey: vm.query.facetKey,
                        facetValue: vm.query.facetValue
                    },
                    dataType: 'json',
                    headers: { 'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "" },
                    success: function (data) {
                        vm.loadingList = false;
                        vm.artifactList = data?.artifactList || [];

                        if (vm.artifactList.length > 0 && !vm.selectedArtifact) {
                            vm.selectArtifact(vm.artifactList[0]);
                        }
                    },
                    error: function () {
                        vm.loadingList = false;
                        vm.artifactList = [];
                    }
                });
            },

            selectArtifact(art) {
                this.selectedArtifact = art;
                this.fetchTelemetry();

                this.$nextTick(() => {
                    const treeRef = this.$refs.discussionTree;
                    // 🎯 Safely verify treeRef is mounted and has fetchTree
                    if (treeRef && typeof treeRef.fetchTree === 'function') {
                        treeRef.fetchTree();
                    } else {
                        // Fallback retry if Vue component registration was slightly delayed
                        setTimeout(() => {
                            if (this.$refs.discussionTree && typeof this.$refs.discussionTree.fetchTree === 'function') {
                                this.$refs.discussionTree.fetchTree();
                            }
                        }, 50);
                    }
                });
            },

            fetchTelemetry() {
                if (!this.selectedArtifact) return;
                var vm = this;

                $.ajax({
                    type: 'GET',
                    url: '/rest/s1/agi-ide/telemetry/summary',
                    data: {
                        agiArtifactId: vm.selectedArtifact.agiArtifactId,
                        artifactPath: vm.selectedArtifact.artifactPath
                    },
                    dataType: 'json',
                    headers: { 'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "" },
                    success: function (data) {
                        if (data?.telemetry) {
                            vm.telemetry = data.telemetry;
                        }
                    }
                });
            },

            onVersionSelected(payload) {
                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'blueprint-version-selected',
                        workEffortId: payload.workEffortId,
                        agiArtifactId: payload.agiArtifactId,
                        versionTag: payload.versionTag,
                        metaJsonBuffer: payload.metaJsonBuffer,
                        artifactPath: this.selectedArtifact ? this.selectedArtifact.artifactPath : ''
                    });
                }
            },

            // 🎯 Requirement 3: Add an empty WorkEffort draft directly into active tree view
            onAddNewRootIntent() {
                if (!this.selectedArtifact) return;

                const draftNode = {
                    workEffortId: 'DRAFT_NEW',
                    workEffortName: '',
                    description: '',
                    targetMariaId: '',
                    workEffortTypeEnumId: 'WetIntent',
                    isDraft: true
                };

                // Inject draft into tree via ref or set as selected node
                if (this.$refs.discussionTree) {
                    if (typeof this.$refs.discussionTree.injectDraftNode === 'function') {
                        this.$refs.discussionTree.injectDraftNode(draftNode);
                    } else {
                        // Fallback: reload tree and attach draft
                        this.activeDraftNode = draftNode;
                    }
                }
            },

            onIntentSaved(savedData) {
                this.activeDraftNode = null;
                if (this.$refs.discussionTree && typeof this.$refs.discussionTree.fetchTree === 'function') {
                    this.$refs.discussionTree.fetchTree();
                }
                this.fetchTelemetry();
                this.queryArtifacts();
            },

            onCancelDraft() {
                this.activeDraftNode = null;
                if (this.$refs.discussionTree && typeof this.$refs.discussionTree.fetchTree === 'function') {
                    this.$refs.discussionTree.fetchTree();
                }
            },

            saveCustomDetail(node) {
                if (!node || !node.workEffortId) {
                    if (this.$q) this.$q.notify({ type: 'warning', message: 'No valid WorkEffort node selected to save.' });
                    return;
                }
                var vm = this;

                $.ajax({
                    type: 'POST',
                    url: '/rest/s1/agi-ide/blueprint/create-node',
                    data: {
                        workEffortId: node.workEffortId,
                        workEffortName: node.workEffortName || '',
                        description: node.description || '',
                        targetMariaId: node.targetMariaId || '',
                        agiArtifactId: vm.selectedArtifact ? vm.selectedArtifact.agiArtifactId : '',
                        sourceReferenceId: vm.selectedArtifact ? vm.selectedArtifact.artifactPath : ''
                    },
                    dataType: 'json',
                    headers: { 'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "" },
                    success: function (data) {
                        if (vm.$q) {
                            vm.$q.notify({
                                type: 'positive',
                                message: 'Specification detail updated successfully.'
                            });
                        }
                        // Refresh telemetry metrics and tree state
                        vm.fetchTelemetry();
                    },
                    error: function (err) {
                        console.error("Failed to save custom specification detail:", err);
                        if (vm.$q) {
                            vm.$q.notify({
                                type: 'negative',
                                message: 'Failed to save specification detail.'
                            });
                        }
                    }
                });
            },
        },
    };

    window.AgiBlueprintEditor = AgiBlueprintEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-blueprint-editor'] = AgiBlueprintEditor;

    const registerAgiBlueprintEditor = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            if (!window.moqui.webrootVueApp.component('agi-blueprint-editor')) {
                window.moqui.webrootVueApp.component('agi-blueprint-editor', AgiBlueprintEditor);
                console.info("🚀 [AGI] Registered 'agi-blueprint-editor' successfully.");
            }
        } else {
            setTimeout(registerAgiBlueprintEditor, 50);
        }
    };
    registerAgiBlueprintEditor();
})();