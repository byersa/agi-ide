(function () {
    const AgiArtifactPalette = {
        name: 'AgiArtifactPalette',
        template: `
            <div class="q-pa-sm bg-slate-900 text-white rounded-borders">
                <q-list class="rounded-borders border-dark" style="border: 1px solid #334155;">

                    <!-- SECTION 1: SEARCH & AI DISCOVERY MODE -->
                    <q-expansion-item
                        v-model="accordionState.search"
                        icon="search"
                        label="Artifact Search & AI Query"
                        header-class="bg-slate-950 text-cyan-4 text-weight-bold font-mono"
                        expand-icon-class="text-cyan-4"
                        default-opened
                    >
                        <div class="q-pa-sm bg-slate-900">
                            <q-input 
                                v-model="filterTerm" 
                                dense 
                                outlined 
                                bg-color="white"
                                input-class="text-black font-mono"
                                placeholder="Type search term (e.g. ManagePatients) or prompt..."
                                @keydown.enter="fetchPalette"
                            >
                                <template v-slot:append>
                                    <!-- Direct Query Action -->
                                    <q-btn flat round icon="search" color="primary" @click="fetchPalette" :loading="isDirectSearching">
                                        <q-tooltip class="bg-slate-950 text-caption">Direct Query Search (Enter)</q-tooltip>
                                    </q-btn>
                                    <!-- AI Assist Mode Action -->
                                    <q-btn flat round icon="auto_awesome" color="deep-purple-4" @click="triggerAiSearch" :loading="isAiSearching">
                                        <q-tooltip class="bg-slate-950 text-caption">AI-Assisted Context Search</q-tooltip>
                                    </q-btn>
                                </template>
                            </q-input>

                            <q-scroll-area style="height: 220px;" class="q-mt-sm">
                                <q-list separator dense>
                                    <q-item 
                                        v-for="item in artifacts" 
                                        :key="item.value" 
                                        clickable 
                                        v-ripple
                                        @click="selectArtifact(item)"
                                        class="rounded-borders q-my-xs bg-slate-950 text-white"
                                    >
                                        <q-item-section avatar min-width="24px">
                                            <q-icon :name="item.isComponent ? 'javascript' : 'code'" :color="item.isComponent ? 'warning' : 'info'" size="xs" />
                                        </q-item-section>
                                        <q-item-section>
                                            <q-item-label class="text-weight-bold font-mono text-caption text-cyan-4">{{ item.label }}</q-item-label>
                                            <q-item-label caption class="text-grey-4 text-caption ellipsis font-mono">{{ item.value }}</q-item-label>
                                        </q-item-section>
                                        <q-item-section side v-if="item.status">
                                            <q-badge outline color="primary" :label="item.status" />
                                        </q-item-section>
                                    </q-item>
                                    <q-item v-if="artifacts.length === 0" class="text-grey-5 text-italic text-caption">
                                        No matching artifacts found. Click search icon or AI assistant button.
                                    </q-item>
                                </q-list>
                            </q-scroll-area>
                        </div>
                    </q-expansion-item>

                    <q-separator dark />

                    <!-- SECTION 2: HIERARCHICAL ARTIFACT TREE MODE -->
                    <q-expansion-item
                        v-model="accordionState.tree"
                        icon="account_tree"
                        label="Component Artifact Hierarchy"
                        header-class="bg-slate-950 text-cyan-4 text-weight-bold font-mono"
                        expand-icon-class="text-cyan-4"
                    >
                        <div class="q-pa-sm bg-slate-900">
                            <q-scroll-area style="height: 240px;">
                                <q-tree
                                    v-if="categoryTree.length > 0"
                                    :nodes="categoryTree"
                                    node-key="id"
                                    selected-color="primary"
                                    v-model:selected="selectedTreeNode"
                                    @update:selected="onTreeNodeSelected"
                                    class="text-white font-mono text-caption"
                                >
                                    <template v-slot:default-header="prop">
                                        <div class="row items-center q-gutter-x-xs cursor-pointer">
                                            <q-icon :name="prop.node.icon || 'folder'" :color="prop.node.iconColor || 'cyan-4'" size="xs" />
                                            <span class="text-weight-bold" :class="prop.node.isLeaf ? 'text-cyan-3' : 'text-grey-3'">
                                                {{ prop.node.label }}
                                            </span>
                                            <q-badge v-if="prop.node.count !== undefined" color="slate-800" text-color="cyan-4" class="q-ml-xs text-caption">
                                                {{ prop.node.count }}
                                            </q-badge>
                                        </div>
                                    </template>
                                </q-tree>
                                <div v-else class="text-center text-grey-5 q-pa-md text-italic text-caption">
                                    Loading component hierarchy tree...
                                </div>
                            </q-scroll-area>
                        </div>
                    </q-expansion-item>

                    <q-separator dark />

                    <!-- SECTION 3: RECENT ARTIFACT HISTORY MODE -->
                    <q-expansion-item
                        v-model="accordionState.history"
                        icon="history"
                        label="Recent Focus History (Last 10)"
                        header-class="bg-slate-950 text-cyan-4 text-weight-bold font-mono"
                        expand-icon-class="text-cyan-4"
                    >
                        <div class="q-pa-sm bg-slate-900">
                            <div class="row items-center justify-between q-mb-xs" v-if="recentHistory.length > 0">
                                <span class="text-caption text-grey-4">Recently Focused Artifacts</span>
                                <q-btn flat dense icon="delete_sweep" size="xs" color="negative" @click="clearHistory">
                                    <q-tooltip class="bg-slate-950 text-caption">Clear Artifact History</q-tooltip>
                                </q-btn>
                            </div>
                            <q-scroll-area style="height: 180px;">
                                <q-list separator dense v-if="recentHistory.length > 0">
                                    <q-item 
                                        v-for="(hist, idx) in recentHistory" 
                                        :key="idx" 
                                        clickable 
                                        v-ripple 
                                        @click="selectArtifact(hist)"
                                        class="rounded-borders q-my-xs bg-slate-950 text-white"
                                    >
                                        <q-item-section avatar min-width="24px">
                                            <q-icon name="schedule" color="cyan-4" size="xs" />
                                        </q-item-section>
                                        <q-item-section>
                                            <q-item-label class="text-weight-bold font-mono text-caption text-primary">{{ hist.label }}</q-item-label>
                                            <q-item-label caption class="text-grey-4 font-mono text-caption ellipsis">{{ hist.value }}</q-item-label>
                                        </q-item-section>
                                        <q-item-section side>
                                            <span class="text-caption font-mono text-grey-5">{{ hist.timestamp }}</span>
                                        </q-item-section>
                                    </q-item>
                                </q-list>
                                <div v-else class="text-center text-grey-5 q-pa-md text-italic text-caption">
                                    No artifact history recorded in this session.
                                </div>
                            </q-scroll-area>
                        </div>
                    </q-expansion-item>

                </q-list>
            </div>
        `,
        data() {
            return {
                filterTerm: '',
                targetComponent: 'nursinghome',
                artifacts: [],
                recentHistory: [],
                categoryTree: [],
                selectedTreeNode: null,
                isDirectSearching: false,
                isAiSearching: false,
                accordionState: {
                    search: true,
                    tree: false,
                    history: false
                }
            };
        },
        mounted() {
            this.loadHistoryFromStorage();
            this.fetchPalette();
        },
        methods: {
            // 🎯 MODE 1A: Direct Query Search
            async fetchPalette() {
                var vm = this;
                vm.isDirectSearching = true;
                const headers = { 'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "" };
                try {
                    const response = await axios.get('/rest/s1/agi-ide/palette', {
                        params: { searchTerm: vm.filterTerm, targetComponent: vm.targetComponent },
                        headers: headers
                    });
                    const flatList = response.data?.flatList || response.data?.artifactTree || [];
                    vm.artifacts = flatList;

                    // Automatically build category tree if not yet built or when loading full list
                    if (!vm.filterTerm || vm.categoryTree.length === 0) {
                        vm.categoryTree = vm.buildTreeFromFlatList(flatList);
                    }
                } catch (err) {
                    console.warn("⚠️ Error fetching artifact palette:", err);
                } finally {
                    vm.isDirectSearching = false;
                }
            },

            // 🎯 MODE 1B: AI-Assisted Context Query Search
            async triggerAiSearch() {
                if (!this.filterTerm.trim()) return;

                this.isAiSearching = true;
                var vm = this;
                const headers = {
                    'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "",
                    'Content-Type': 'application/json'
                };

                try {
                    const prompt = `Identify relevant Moqui component artifact files for query '${vm.filterTerm}' in component '${vm.targetComponent}'.`;
                    await axios.post('/rest/s1/agi-ide/geminiProxy', {
                        userPrompt: prompt,
                        targetComponent: vm.targetComponent
                    }, { headers });

                    await vm.fetchPalette();
                } catch (err) {
                    console.warn("⚠️ AI artifact query search encountered an error:", err);
                } finally {
                    vm.isAiSearching = false;
                }
            },

            // 🎯 MODE 2: Category Tree Builder
            buildTreeFromFlatList(flatList) {
                const categories = {
                    screens: { id: 'cat_screens', label: 'Screens (.xml)', icon: 'web', iconColor: 'info', children: [], count: 0 },
                    components: { id: 'cat_components', label: 'Vue Components (.qvt.js)', icon: 'javascript', iconColor: 'warning', children: [], count: 0 },
                    services: { id: 'cat_services', label: 'Services (.xml)', icon: 'settings_suggest', iconColor: 'primary', children: [], count: 0 },
                    entities: { id: 'cat_entities', label: 'Entities (.xml)', icon: 'dns', iconColor: 'positive', children: [], count: 0 },
                    tests: { id: 'cat_tests', label: 'Tests & Workflows', icon: 'fact_check', iconColor: 'purple-4', children: [], count: 0 }
                };

                flatList.forEach(item => {
                    const val = item.value || '';
                    const leafNode = {
                        id: val,
                        label: item.label || val,
                        value: val,
                        screenPath: item.screenPath,
                        isLeaf: true,
                        icon: item.isComponent ? 'javascript' : 'code',
                        iconColor: item.isComponent ? 'warning' : 'cyan-4',
                        rawItem: item
                    };

                    if (val.endsWith('.qvt.js')) {
                        categories.components.children.push(leafNode);
                        categories.components.count++;
                    } else if (val.includes('/screen/')) {
                        categories.screens.children.push(leafNode);
                        categories.screens.count++;
                    } else if (val.includes('/service/')) {
                        categories.services.children.push(leafNode);
                        categories.services.count++;
                    } else if (val.includes('/entity/')) {
                        categories.entities.children.push(leafNode);
                        categories.entities.count++;
                    } else {
                        categories.tests.children.push(leafNode);
                        categories.tests.count++;
                    }
                });

                return Object.values(categories).filter(c => c.count > 0);
            },

            onTreeNodeSelected(nodeKey) {
                if (!nodeKey || nodeKey.startsWith('cat_')) return;

                for (const cat of this.categoryTree) {
                    const match = cat.children.find(c => c.id === nodeKey);
                    if (match) {
                        this.selectArtifact(match.rawItem || match);
                        break;
                    }
                }
            },

            // 🎯 MODE 3: Recent History Cache (Last 10 Artifacts)
            selectArtifact(item) {
                this.pushToHistory(item);
                this.$emit('artifact-selected', item);
            },

            pushToHistory(item) {
                if (!item || !item.value) return;

                const entry = {
                    label: item.label || item.value,
                    value: item.value,
                    screenPath: item.screenPath || item.value,
                    isComponent: item.isComponent || false,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };

                this.recentHistory = this.recentHistory.filter(h => h.value !== entry.value);
                this.recentHistory.unshift(entry);
                if (this.recentHistory.length > 10) {
                    this.recentHistory = this.recentHistory.slice(0, 10);
                }

                try {
                    localStorage.setItem('agi_artifact_history', JSON.stringify(this.recentHistory));
                } catch (e) { }
            },

            loadHistoryFromStorage() {
                try {
                    const saved = localStorage.getItem('agi_artifact_history');
                    if (saved) {
                        this.recentHistory = JSON.parse(saved);
                    }
                } catch (e) {
                    this.recentHistory = [];
                }
            },

            clearHistory() {
                this.recentHistory = [];
                try {
                    localStorage.removeItem('agi_artifact_history');
                } catch (e) { }
            }
        }
    };

    window.AgiArtifactPalette = AgiArtifactPalette;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['AgiArtifactPalette'] = AgiArtifactPalette;
})();