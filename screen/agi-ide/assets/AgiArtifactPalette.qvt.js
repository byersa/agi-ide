(function () {
    const AgiArtifactPalette = {
        name: 'AgiArtifactPalette',
        template: `
            <div class="agi-artifact-palette bg-slate-900 text-white rounded-borders q-pa-xs">
                <!-- Section Selector Tabs -->
                <q-tabs
                    v-model="activeTab"
                    dense
                    no-caps
                    align="justify"
                    class="bg-slate-950 text-grey-4 q-mb-xs rounded-borders"
                    active-color="cyan-4"
                    indicator-color="cyan-4"
                >
                    <q-tab name="search" icon="search" label="Search" />
                    <q-tab name="grouped" icon="category" label="By Type" />
                    <q-tab name="history" icon="history" label="Recent" />
                </q-tabs>

                <!-- Search Input (Visible across all tabs) -->
                <q-input 
                    v-model="searchQuery" 
                    placeholder="Filter artifacts (e.g. screen, service, entity)..." 
                    dense 
                    outlined 
                    class="q-mb-xs font-mono text-caption"
                    bg-color="slate-950"
                >
                    <template v-slot:append>
                        <q-icon name="filter_list" color="grey-5" size="xs" />
                    </template>
                </q-input>

                <!-- ========================================================= -->
                <!-- TAB 1: ALL / QUERY SEARCH LIST                            -->
                <!-- ========================================================= -->
                <div v-if="activeTab === 'search'">
                    <q-list separator dense class="max-h-80 overflow-y-auto">
                        <template v-if="filteredArtifacts.length > 0">
                            <q-expansion-item
                                v-for="item in filteredArtifacts" 
                                :key="item.value"
                                group="artifact-palette"
                                header-class="q-pa-xs bg-slate-950 hover-bg-slate-800 rounded-borders"
                                @show="onArtifactExpanded(item.value)"
                            >
                                <template v-slot:header>
                                    <q-item-section avatar min-width="24px">
                                        <q-icon :name="getArtifactIcon(item.type)" :color="getArtifactColor(item.type)" size="xs" />
                                    </q-item-section>
                                    
                                    <q-item-section @click.stop="selectArtifact(item)" class="cursor-pointer">
                                        <q-item-label class="font-mono text-caption text-weight-bold" :class="'text-' + getArtifactColor(item.type)">
                                            {{ item.label }}
                                        </q-item-label>
                                        <q-item-label caption class="text-grey-5 font-mono text-caption ellipsis" style="max-width: 280px;">
                                            {{ item.value }}
                                        </q-item-label>

                                        <!-- Full Path Tooltip -->
                                        <q-tooltip anchor="top middle" self="bottom middle" class="bg-slate-950 text-cyan-4 font-mono text-caption shadow-4 border-dark" style="border: 1px solid #334155; max-width: 500px; word-break: break-all;">
                                            <div class="text-weight-bold text-white q-mb-xs">{{ item.label }} ({{ item.type }})</div>
                                            <div>{{ item.value }}</div>
                                        </q-tooltip>
                                    </q-item-section>

                                    <q-item-section side>
                                        <q-badge :color="getBadgeColor(item.type)" text-color="white" class="font-mono" style="font-size: 9px;">
                                            {{ item.type }}
                                        </q-badge>
                                    </q-item-section>
                                </template>

                                <!-- Expanded WorkspaceBuffer AST Drawer -->
                                <q-card class="bg-slate-950 text-grey-8 q-pa-xs border-top-dark">
                                    <div class="row items-center justify-between q-mb-xs q-px-xs">
                                        <div class="text-caption text-weight-bold text-amber-5 font-mono row items-center">
                                            <q-icon name="memory" size="xs" class="q-mr-xs" />
                                            WORKSPACE BUFFER AST
                                        </div>
                                        <div class="row q-gutter-x-xs">
                                            <q-btn flat dense icon="refresh" color="cyan-4" size="xs" @click.stop="fetchBufferForUri(item.value)">
                                                <q-tooltip class="bg-slate-900 text-caption">Reload Buffer from Server</q-tooltip>
                                            </q-btn>
                                            <q-btn flat dense icon="content_copy" color="grey-4" size="xs" @click.stop="copyBufferJson(item.value)">
                                                <q-tooltip class="bg-slate-900 text-caption">Copy JSON AST</q-tooltip>
                                            </q-btn>
                                        </div>
                                    </div>
                                    <div class="bg-slate-900 q-pa-xs rounded-borders border-dark overflow-auto max-h-48 font-mono" style="font-size: 10px; border: 1px solid #1e293b;">
                                        <div v-if="loadingBuffers[item.value]" class="text-center text-grey-8 q-pa-sm text-italic">
                                            <q-spinner-dots color="amber-5" size="xs" /> Loading WorkspaceBuffer...
                                        </div>
                                        <pre v-else-if="bufferCache[item.value]" class="q-ma-none text-grey-3" style="white-space: pre-wrap; word-break: break-all;">{{ bufferCache[item.value] }}</pre>
                                        <div v-else class="text-center text-grey-5 q-pa-sm text-italic">
                                            No buffer initialized for this artifact. Click select or refresh.
                                        </div>
                                    </div>
                                </q-card>
                            </q-expansion-item>
                        </template>
                        <div v-else class="text-center text-grey-6 q-pa-md text-caption font-mono">
                            No artifacts matching query "{{ searchQuery }}".
                        </div>
                    </q-list>
                </div>

                <!-- ========================================================= -->
                <!-- TAB 2: GROUPED BY ARTIFACT TYPE                           -->
                <!-- ========================================================= -->
                <div v-else-if="activeTab === 'grouped'" class="max-h-80 overflow-y-auto">
                    <q-list separator dense>
                        <q-expansion-item
                            v-for="(groupList, groupKey) in groupedArtifacts"
                            :key="groupKey"
                            default-opened
                            header-class="bg-slate-950 font-mono text-caption text-weight-bold text-grey-3 q-py-xs"
                        >
                            <template v-slot:header>
                                <q-item-section avatar min-width="24px">
                                    <q-icon :name="getGroupIcon(groupKey)" :color="getGroupColor(groupKey)" size="xs" />
                                </q-item-section>
                                <q-item-section>
                                    {{ groupKey }} ({{ groupList.length }})
                                </q-item-section>
                            </template>

                            <q-item
                                v-for="item in groupList"
                                :key="item.value"
                                clickable
                                v-ripple
                                class="q-pl-lg q-py-xs bg-slate-900 hover-bg-slate-800"
                                @click="selectArtifact(item)"
                            >
                                <q-item-section avatar min-width="20px">
                                    <q-icon :name="getArtifactIcon(item.type)" :color="getArtifactColor(item.type)" size="xs" />
                                </q-item-section>
                                <q-item-section>
                                    <q-item-label class="font-mono text-caption" :class="'text-' + getArtifactColor(item.type)">
                                        {{ item.label }}
                                    </q-item-label>
                                    <q-item-label caption class="text-grey-5 font-mono ellipsis" style="font-size: 10px; max-width: 240px;">
                                        {{ item.value }}
                                    </q-item-label>

                                    <!-- Full Path Tooltip -->
                                    <q-tooltip anchor="top middle" self="bottom middle" class="bg-slate-950 text-cyan-4 font-mono text-caption shadow-4 border-dark" style="border: 1px solid #334155; max-width: 500px; word-break: break-all;">
                                        <div class="text-weight-bold text-white q-mb-xs">{{ item.label }} ({{ item.type }})</div>
                                        <div>{{ item.value }}</div>
                                    </q-tooltip>
                                </q-item-section>
                                <q-item-section side>
                                    <q-badge :color="getBadgeColor(item.type)" text-color="white" class="font-mono" style="font-size: 8px;">
                                        {{ item.type }}
                                    </q-badge>
                                </q-item-section>
                            </q-item>
                        </q-expansion-item>
                    </q-list>
                </div>

                <!-- ========================================================= -->
                <!-- TAB 3: RECENTLY SELECTED HISTORY                          -->
                <!-- ========================================================= -->
                <div v-else-if="activeTab === 'history'" class="max-h-80 overflow-y-auto">
                    <div class="row justify-between items-center q-pa-xs">
                        <span class="text-caption text-grey-5 font-mono">Recent History</span>
                        <q-btn flat dense size="xs" color="grey-5" icon="delete_sweep" label="Clear" @click="clearHistory" />
                    </div>
                    <q-list separator dense>
                        <template v-if="recentHistory.length > 0">
                            <q-item
                                v-for="item in recentHistory"
                                :key="item.value"
                                clickable
                                v-ripple
                                class="q-pa-xs bg-slate-950 hover-bg-slate-800 rounded-borders q-mb-xs"
                                @click="selectArtifact(item)"
                            >
                                <q-item-section avatar min-width="24px">
                                    <q-icon :name="getArtifactIcon(item.type)" :color="getArtifactColor(item.type)" size="xs" />
                                </q-item-section>
                                <q-item-section>
                                    <q-item-label class="font-mono text-caption text-weight-bold" :class="'text-' + getArtifactColor(item.type)">
                                        {{ item.label }}
                                    </q-item-label>
                                    <q-item-label caption class="text-grey-5 font-mono text-caption ellipsis" style="max-width: 280px;">
                                        {{ item.value }}
                                    </q-item-label>

                                    <!-- Full Path Tooltip -->
                                    <q-tooltip anchor="top middle" self="bottom middle" class="bg-slate-950 text-cyan-4 font-mono text-caption shadow-4 border-dark" style="border: 1px solid #334155; max-width: 500px; word-break: break-all;">
                                        <div class="text-weight-bold text-white q-mb-xs">{{ item.label }} ({{ item.type }})</div>
                                        <div>{{ item.value }}</div>
                                    </q-tooltip>
                                </q-item-section>
                                <q-item-section side>
                                    <span class="text-grey-5 font-mono" style="font-size: 9px;">{{ item.openedAt || 'Recent' }}</span>
                                </q-item-section>
                            </q-item>
                        </template>
                        <div v-else class="text-center text-grey-6 q-pa-md text-caption font-mono">
                            No recent artifact history yet.
                        </div>
                    </q-list>
                </div>
            </div>
        `,
        data() {
            return {
                activeTab: 'search',
                searchQuery: '',
                artifacts: [],
                recentHistory: [],
                bufferCache: {},
                loadingBuffers: {}
            };
        },
        computed: {
            filteredArtifacts() {
                if (!this.searchQuery.trim()) return this.artifacts;
                const q = this.searchQuery.toLowerCase();
                return this.artifacts.filter(a =>
                    a.label.toLowerCase().includes(q) ||
                    a.value.toLowerCase().includes(q) ||
                    a.type.toLowerCase().includes(q)
                );
            },
            groupedArtifacts() {
                const list = this.filteredArtifacts;
                const groups = {
                    'XML Screens': [],
                    'QVT Components': [],
                    'Services & Logic': [],
                    'Entity Definitions': [],
                    'Automated Tests': [],
                    'Reports & Templates': []
                };

                list.forEach(item => {
                    if (item.type === 'XML') groups['XML Screens'].push(item);
                    else if (item.type === 'QVT') groups['QVT Components'].push(item);
                    else if (item.type === 'SRV') groups['Services & Logic'].push(item);
                    else if (item.type === 'ENT') groups['Entity Definitions'].push(item);
                    else if (item.type === 'TST') groups['Automated Tests'].push(item);
                    else groups['Reports & Templates'].push(item);
                });

                Object.keys(groups).forEach(k => {
                    if (groups[k].length === 0) delete groups[k];
                });
                return groups;
            }
        },
        mounted() {
            var vm = this;
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = function (event) {
                if (event.data && event.data.event === 'artifact-state-mutated') {
                    if (event.data.artifactUri) {
                        vm.fetchBufferForUri(event.data.artifactUri);
                    }
                }
            };

            this.loadHistoryFromStorage();
            this.loadKnownArtifacts();
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },
        methods: {
            getArtifactIcon(type) {
                switch (type) {
                    case 'QVT': return 'javascript';
                    case 'SRV': return 'settings_suggest';
                    case 'ENT': return 'storage';
                    case 'TST': return 'flaky';
                    case 'RPT': return 'summarize';
                    case 'FTL': return 'code';
                    default: return 'description';
                }
            },
            getArtifactColor(type) {
                switch (type) {
                    case 'QVT': return 'amber-5';
                    case 'SRV': return 'deep-orange-4';
                    case 'ENT': return 'teal-4';
                    case 'TST': return 'purple-4';
                    case 'RPT': return 'light-green-4';
                    default: return 'cyan-4';
                }
            },
            getBadgeColor(type) {
                switch (type) {
                    case 'QVT': return 'amber-9';
                    case 'SRV': return 'deep-orange-9';
                    case 'ENT': return 'teal-9';
                    case 'TST': return 'purple-9';
                    case 'RPT': return 'light-green-9';
                    default: return 'deep-purple-9';
                }
            },
            getGroupIcon(group) {
                if (group.includes('QVT')) return 'javascript';
                if (group.includes('Services')) return 'settings_suggest';
                if (group.includes('Entity')) return 'storage';
                if (group.includes('Tests')) return 'flaky';
                if (group.includes('Reports')) return 'summarize';
                return 'layers';
            },
            getGroupColor(group) {
                if (group.includes('QVT')) return 'amber-4';
                if (group.includes('Services')) return 'deep-orange-4';
                if (group.includes('Entity')) return 'teal-4';
                if (group.includes('Tests')) return 'purple-4';
                if (group.includes('Reports')) return 'light-green-4';
                return 'cyan-4';
            },

            selectArtifact(item) {
                this.recordHistory(item);
                this.$emit('artifact-selected', item);
                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'open-screen-artifact',
                        artifactLocation: item.value,
                        artifactType: item.type,
                        targetComponent: item.componentName || 'nursinghome'
                    });
                }
            },

            recordHistory(item) {
                const now = new Date();
                const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const entry = { ...item, openedAt: timeStr };

                this.recentHistory = [entry, ...this.recentHistory.filter(h => h.value !== item.value)].slice(0, 15);
                try {
                    localStorage.setItem('agi_recent_artifact_history', JSON.stringify(this.recentHistory));
                } catch (e) { }
            },

            loadHistoryFromStorage() {
                try {
                    const raw = localStorage.getItem('agi_recent_artifact_history');
                    if (raw) this.recentHistory = JSON.parse(raw);
                } catch (e) {
                    this.recentHistory = [];
                }
            },

            clearHistory() {
                this.recentHistory = [];
                try {
                    localStorage.removeItem('agi_recent_artifact_history');
                } catch (e) { }
            },

            onArtifactExpanded(artifactUri) {
                if (!this.bufferCache[artifactUri]) {
                    this.fetchBufferForUri(artifactUri);
                }
            },

            async fetchBufferForUri(artifactUri) {
                if (!artifactUri) return;
                var vm = this;
                vm.loadingBuffers[artifactUri] = true;
                const headers = { 'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "" };

                try {
                    const response = await axios.get('/rest/s1/agi-ide/getWorkspaceBuffer', {
                        params: { artifactUri: artifactUri },
                        headers: headers
                    });

                    vm.loadingBuffers[artifactUri] = false;
                    const resData = response.data || {};
                    const rawBuffer = resData.metaJsonBuffer || resData.layoutTree || resData;

                    if (rawBuffer) {
                        const jsonObj = typeof rawBuffer === 'string' ? JSON.parse(rawBuffer) : rawBuffer;
                        vm.bufferCache[artifactUri] = JSON.stringify(jsonObj, null, 2);
                    } else {
                        vm.bufferCache[artifactUri] = 'Empty buffer response.';
                    }
                } catch (err) {
                    vm.loadingBuffers[artifactUri] = false;
                    vm.bufferCache[artifactUri] = JSON.stringify({
                        status: 'error',
                        message: 'Could not fetch WorkspaceBuffer for artifact.',
                        error: err.message
                    }, null, 2);
                }
            },

            copyBufferJson(artifactUri) {
                const jsonText = this.bufferCache[artifactUri];
                if (jsonText && navigator.clipboard) {
                    navigator.clipboard.writeText(jsonText);
                    if (this.$q) {
                        this.$q.notify({
                            type: 'positive',
                            message: 'WorkspaceBuffer JSON copied to clipboard!'
                        });
                    }
                }
            },

            async loadKnownArtifacts() {
                var vm = this;
                const headers = { 'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "" };

                try {
                    const response = await axios.get('/rest/s1/agi-ide/getKnownArtifacts', { headers });
                    const list = response.data?.artifacts || response.data || [];
                    const items = [];

                    list.forEach(a => {
                        const path = a.artifactPath || a;
                        if (!path) return;

                        const baseName = a.screenName || path.substring(path.lastIndexOf('/') + 1) || 'Artifact';

                        let type = 'XML';
                        if (path.endsWith('.qvt.js')) {
                            type = 'QVT';
                        } else if (path.includes('/service/') || path.includes('Services.xml') || path.endsWith('.groovy')) {
                            type = 'SRV';
                        } else if (path.includes('/entity/') || path.includes('Entities.xml')) {
                            type = 'ENT';
                        } else if (path.includes('/test/') || path.includes('Test.xml')) {
                            type = 'TST';
                        } else if (path.includes('/report/') || path.endsWith('.ftl') || path.endsWith('.xsl-fo')) {
                            type = 'RPT';
                        }

                        items.push({
                            label: baseName,
                            value: path,
                            type: type,
                            componentName: a.componentName || ''
                        });

                        // 🎯 ACCURATE COMPANION QVT PATH RESOLUTION (preserves subdirectories)
                        if (type === 'XML' && path.includes('/screen/')) {
                            const screenIdx = path.indexOf('/screen/');
                            const qvtPath = path.substring(0, screenIdx) + '/assets/' + path.substring(screenIdx + 8).replace(/\.xml$/, '.qvt.js');
                            const qvtName = baseName.replace(/\.xml$/, '.qvt.js');

                            items.push({
                                label: qvtName,
                                value: qvtPath,
                                type: 'QVT',
                                componentName: a.componentName || ''
                            });
                        }
                    });

                    vm.artifacts = items;
                } catch (err) {
                    // Fallback list preserving nested subscreen directory structures
                    vm.artifacts = [
                        // Screens & Subscreens
                        { label: 'nursinghome.xml', value: 'component://nursinghome/screen/nursinghome.xml', type: 'XML' },
                        { label: 'nursinghome.qvt.js', value: 'component://nursinghome/assets/nursinghome.qvt.js', type: 'QVT' },
                        { label: 'PatientManagement.xml', value: 'component://nursinghome/screen/nursinghome/PatientManagement.xml', type: 'XML' },
                        { label: 'PatientManagement.qvt.js', value: 'component://nursinghome/assets/nursinghome/PatientManagement.qvt.js', type: 'QVT' },
                        { label: 'PatientList.xml', value: 'component://nursinghome/screen/nursinghome/PatientManagement/PatientList.xml', type: 'XML' },
                        { label: 'PatientList.qvt.js', value: 'component://nursinghome/assets/nursinghome/PatientManagement/PatientList.qvt.js', type: 'QVT' },
                        { label: 'PatientIntake.xml', value: 'component://nursinghome/screen/nursinghome/PatientManagement/PatientIntake.xml', type: 'XML' },
                        { label: 'PatientIntake.qvt.js', value: 'component://nursinghome/assets/nursinghome/PatientManagement/PatientIntake.qvt.js', type: 'QVT' },

                        // Services
                        { label: 'NursingHomeServices.xml', value: 'component://nursinghome/service/nursinghome/NursingHomeServices.xml', type: 'SRV' },
                        { label: 'PatientIntakeServices.xml', value: 'component://nursinghome/service/nursinghome/PatientIntakeServices.xml', type: 'SRV' },

                        // Entities
                        { label: 'NursingHomeEntities.xml', value: 'component://nursinghome/entity/NursingHomeEntities.xml', type: 'ENT' },

                        // Tests & Reports
                        { label: 'PatientIntakeTest.xml', value: 'component://nursinghome/test/PatientIntakeTest.xml', type: 'TST' },
                        { label: 'PatientCensusReport.csv.ftl', value: 'component://nursinghome/template/PatientCensusReport.csv.ftl', type: 'RPT' }
                    ];
                }
            }
        }
    };

    window.AgiArtifactPalette = AgiArtifactPalette;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-artifact-palette'] = AgiArtifactPalette;
})();