(function () {
    const AgiArtifactPalette = {
        name: 'AgiArtifactPalette',
        emits: ['artifact-selected', 'seed-pipeline-step'],
        props: {
            targetComponent: { type: String, default: 'nursinghome' },
            activeArtifactUri: { type: String, default: '' }
        },
        data() {
            return {
                viewMode: 'matrix', // 'matrix' | 'list'
                loading: false,
                searchFilter: '',
                artifacts: [],
                hierarchyRoot: null,
                summaryStats: { total: 0, built: 0, placeholder: 0, empty: 0, tested: 0 }
            };
        },
        computed: {
            filteredListArtifacts() {
                let list = this.artifacts || [];
                const q = (this.searchFilter || '').toLowerCase().trim();
                if (q) {
                    list = list.filter(a => {
                        const path = (a.artifactPath || a.value || '').toLowerCase();
                        const label = (a.label || a.screenName || '').toLowerCase();
                        return path.includes(q) || label.includes(q);
                    });
                }
                return list;
            }
        },
        watch: {
            targetComponent() { this.loadData(); }
        },
        mounted() {
            this.loadData();
        },
        methods: {
            resolveCsrf() {
                return window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || "";
            },

            async loadData() {
                this.loading = true;
                try {
                    await Promise.all([
                        this.fetchHierarchy(),
                        this.fetchArtifactList()
                    ]);
                } finally {
                    this.loading = false;
                }
            },

            async fetchHierarchy() {
                try {
                    const resp = await axios.get('/rest/s1/agi-ai/component-hierarchy', {
                        params: { targetComponent: this.targetComponent },
                        headers: { 'moquiSessionToken': this.resolveCsrf() }
                    });
                    this.hierarchyRoot = resp.data?.rootNode || null;
                    if (resp.data?.summaryStats) {
                        this.summaryStats = resp.data.summaryStats;
                    }
                } catch (e) {
                    console.error("Failed to load component screen hierarchy:", e);
                }
            },

            async fetchArtifactList() {
                try {
                    const resp = await axios.get('/rest/s1/agi-ide/known-artifacts', {
                        params: { targetComponent: this.targetComponent },
                        headers: { 'moquiSessionToken': this.resolveCsrf() }
                    });
                    this.artifacts = resp.data?.artifacts || [];
                } catch (e) {
                    console.error("Failed to load flat artifact list:", e);
                }
            },

            selectArtifact(uri) {
                if (!uri) return;
                this.$emit('artifact-selected', uri);
            },

            seedPipelineForScreen(node) {
                this.$emit('seed-pipeline-step', node);
            }
        },
        template: `
            <div class="column fit no-wrap bg-slate-950 text-white font-mono overflow-hidden" style="width: 100%; height: 100%;">
                
                <!-- HEADER (FIXED 34px) -->
                <div class="row items-center justify-between q-px-sm bg-slate-900 text-white no-wrap" style="height: 34px; min-height: 34px; flex: 0 0 34px; border-bottom: 1px solid #334155;">
                    <div class="row items-center q-gutter-x-xs no-wrap">
                        <q-icon name="dashboard_customize" color="teal-3" size="xs" />
                        <span class="text-caption text-weight-bolder text-teal-2">APP BLUEPRINT</span>
                    </div>

                    <!-- Explicit Native Toggle -->
                    <div class="row items-center q-gutter-x-xs no-wrap">
                        <q-btn-toggle
                            v-model="viewMode"
                            dark
                            dense
                            no-caps
                            unelevated
                            toggle-color="teal-8"
                            toggle-text-color="white"
                            color="grey-10"
                            text-color="grey-4"
                            size="xs"
                            style="border: 1px solid #475569;"
                            :options="[
                                { label: 'Matrix', value: 'matrix', icon: 'account_tree' },
                                { label: 'List', value: 'list', icon: 'view_list' }
                            ]"
                        />
                        <q-btn flat round dense icon="refresh" size="xs" color="teal-3" @click="loadData" />
                    </div>
                </div>

                <!-- PROGRESS SUMMARY METRICS (FIXED 26px) -->
                <div v-if="viewMode === 'matrix' && summaryStats.total > 0" class="row items-center justify-between q-px-sm bg-slate-900 text-caption no-wrap" style="height: 26px; min-height: 26px; flex: 0 0 26px; border-bottom: 1px solid #1e293b; font-size: 10px;">
                    <div class="row items-center q-gutter-x-xs no-wrap">
                        <span class="text-slate-400">STATUS:</span>
                        <q-badge color="cyan-9" text-color="white" class="q-px-xs">Built: {{ summaryStats.built }}</q-badge>
                        <q-badge color="amber-9" text-color="white" class="q-px-xs">Stubs: {{ summaryStats.placeholder }}</q-badge>
                        <q-badge color="rose-9" text-color="white" class="q-px-xs">Empty: {{ summaryStats.empty }}</q-badge>
                        <q-badge v-if="summaryStats.tested" color="positive" text-color="black" class="q-px-xs">Tested: {{ summaryStats.tested }}</q-badge>
                    </div>
                    <span class="text-slate-400 text-weight-bold">{{ summaryStats.total }} Screens</span>
                </div>

                <!-- SEARCH FILTER BAR (LIST MODE) -->
                <div v-if="viewMode === 'list'" class="q-pa-xs bg-slate-950" style="border-bottom: 1px solid #1e293b; flex: 0 0 auto;">
                    <q-input 
                        v-model="searchFilter" 
                        placeholder="Filter artifacts..." 
                        dense dark outlined 
                        color="teal-3"
                        class="text-caption font-mono"
                        input-class="text-caption font-mono text-slate-200"
                        style="background-color: #020617; border-radius: 4px;"
                        clearable
                    >
                        <template v-slot:prepend>
                            <q-icon name="search" size="14px" color="teal-4" />
                        </template>
                    </q-input>
                </div>

                <!-- CONTENT VIEWPORT (FLEX 1 1 0%, OVERFLOW AUTO) -->
                <div class="col full-width overflow-auto q-pa-sm" style="flex: 1 1 0%; min-height: 0; background-color: #020617;">
                    <div v-if="loading" class="fit row flex-center q-pa-md">
                        <q-spinner color="teal-4" size="1.8em" />
                    </div>

                    <!-- 1. HIERARCHICAL MATRIX VIEW -->
                    <div v-else-if="viewMode === 'matrix'" class="full-width">
                        <div v-if="!hierarchyRoot" class="text-slate-500 italic text-caption text-center q-pa-md">
                            No screens found for {{ targetComponent }}.
                        </div>

                        <div v-else class="column full-width q-gutter-y-xs">
                            <hierarchy-node 
                                :node="hierarchyRoot" 
                                :active-artifact-uri="activeArtifactUri"
                                @select-artifact="selectArtifact"
                                @seed-pipeline="seedPipelineForScreen"
                            />
                        </div>
                    </div>

                    <!-- 2. FLAT LIST VIEW -->
                    <div v-else-if="viewMode === 'list'" class="full-width">
                        <div v-if="filteredListArtifacts.length === 0" class="text-slate-500 italic text-caption text-center q-pa-md">
                            No artifacts matching filter.
                        </div>

                        <q-list dense separator class="rounded-borders full-width" style="border: 1px solid #1e293b;">
                            <q-item
                                v-for="art in filteredListArtifacts"
                                :key="art.artifactPath || art.value"
                                clickable
                                v-ripple
                                class="q-py-xs"
                                :class="{ 'bg-slate-900 border-l-4': (activeArtifactUri === (art.artifactPath || art.value)) }"
                                :style="(activeArtifactUri === (art.artifactPath || art.value)) ? 'border-left: 4px solid #0d9488;' : ''"
                                @click="selectArtifact(art.artifactPath || art.value)"
                            >
                                <q-item-section avatar style="min-width: 26px;">
                                    <q-icon name="description" color="teal-4" size="xs" />
                                </q-item-section>
                                <q-item-section>
                                    <div class="text-caption font-mono text-slate-100 text-weight-bold ellipsis">{{ art.screenName || art.label }}</div>
                                    <div class="text-slate-400 font-mono ellipsis" style="font-size: 9px;">{{ art.artifactPath || art.value }}</div>
                                </q-item-section>
                                <q-item-section side>
                                    <q-badge color="slate-800" text-color="teal-3" class="font-mono text-caption" style="font-size: 8px;">
                                        {{ art.type || 'XML' }}
                                    </q-badge>
                                </q-item-section>
                            </q-item>
                        </q-list>
                    </div>
                </div>

            </div>
        `
    };

    const HierarchyNode = {
        name: 'HierarchyNode',
        props: {
            node: { type: Object, required: true },
            activeArtifactUri: { type: String, default: '' },
            depth: { type: Number, default: 0 }
        },
        emits: ['select-artifact', 'seed-pipeline'],
        data() {
            return {
                expanded: true
            };
        },
        computed: {
            isActive() {
                return this.activeArtifactUri === this.node.artifactUri;
            },
            statusBadgeColor() {
                switch (this.node.status) {
                    case 'tested': return 'positive';
                    case 'built': return 'cyan-8';
                    case 'placeholder': return 'amber-9';
                    case 'empty': default: return 'rose-9';
                }
            },
            borderColor() {
                switch (this.node.status) {
                    case 'tested': return '#10b981';
                    case 'built': return '#0891b2';
                    case 'placeholder': return '#f59e0b';
                    case 'empty': default: return '#f43f5e';
                }
            },
            textColor() {
                switch (this.node.status) {
                    case 'tested': return '#6ee7b7';
                    case 'built': return '#a5f3fc';
                    case 'placeholder': return '#fde68a';
                    case 'empty': default: return '#fecdd3';
                }
            }
        },
        template: `
            <div class="column full-width font-mono" :style="{ paddingLeft: depth > 0 ? '16px' : '0px' }">
                <!-- Card Container -->
                <div 
                    class="rounded-borders q-pa-xs q-mb-xs cursor-pointer transition-all full-width"
                    :style="{
                        border: '1px solid ' + borderColor,
                        borderStyle: (node.status === 'built' || node.status === 'tested') ? 'solid' : 'dashed',
                        backgroundColor: '#090d16',
                        minHeight: '44px'
                    }"
                    @click="$emit('select-artifact', node.artifactUri)"
                >
                    <!-- Top Line: Icon, Title, Status, Action Wand -->
                    <div class="row items-center justify-between no-wrap full-width">
                        
                        <!-- Left Group -->
                        <div class="row items-center q-gutter-x-xs no-wrap ellipsis col" style="min-width: 0;">
                            <q-icon 
                                v-if="node.children && node.children.length > 0" 
                                :name="expanded ? 'expand_more' : 'chevron_right'" 
                                size="14px" 
                                class="cursor-pointer text-slate-400"
                                @click.stop="expanded = !expanded"
                            />
                            <q-icon 
                                name="web" 
                                size="14px" 
                                :style="{ color: borderColor }" 
                            />
                            
                            <!-- Guaranteed Readable Title -->
                            <span 
                                class="text-caption text-weight-bold ellipsis font-mono"
                                :style="{ color: textColor }"
                                :title="node.artifactUri"
                            >
                                {{ node.displayTitle || node.screenName }}
                            </span>
                        </div>

                        <!-- Right Group: Status Badge & Wand Action -->
                        <div class="row items-center q-gutter-x-xs no-wrap" style="flex: 0 0 auto;">
                            <q-badge :color="statusBadgeColor" text-color="white" class="font-mono text-caption" style="font-size: 8px;">
                                {{ node.status.toUpperCase() }}
                            </q-badge>

                            <q-btn 
                                flat round dense 
                                icon="auto_fix_high" 
                                size="xs" 
                                color="amber-3"
                                class="bg-slate-900"
                                style="border: 1px solid #475569;"
                                @click.stop="$emit('seed-pipeline', node)"
                            >
                                <q-tooltip class="bg-slate-900 text-amber-2 font-mono">Plan/Build step for this screen</q-tooltip>
                            </q-btn>
                        </div>
                    </div>

                    <!-- Bottom Line: Subscreen Filename & Micro Metrics -->
                    <div class="row items-center justify-between q-mt-xs text-slate-400 full-width no-wrap" style="font-size: 9px; line-height: 12px;">
                        <span class="ellipsis text-slate-500 col" style="min-width: 0;">{{ node.screenName }}.xml</span>
                        <div class="row items-center q-gutter-x-xs text-slate-300" style="flex: 0 0 auto;">
                            <span v-if="node.transCount" title="Transitions">⚡ {{ node.transCount }}</span>
                            <span v-if="node.formCount" title="Forms">📋 {{ node.formCount }}</span>
                            <span v-if="node.subscreenCount" title="Subscreens">🔗 {{ node.subscreenCount }}</span>
                        </div>
                    </div>
                </div>

                <!-- Recursive Subscreens Branch -->
                <div v-if="expanded && node.children && node.children.length > 0" class="column full-width" style="border-left: 1px solid #1e293b; margin-left: 6px;">
                    <hierarchy-node 
                        v-for="child in node.children" 
                        :key="child.artifactUri" 
                        :node="child"
                        :depth="depth + 1"
                        :active-artifact-uri="activeArtifactUri"
                        @select-artifact="(uri) => $emit('select-artifact', uri)"
                        @seed-pipeline="(n) => $emit('seed-pipeline', n)"
                    />
                </div>
            </div>
        `
    };

    window.AgiArtifactPalette = AgiArtifactPalette;
    window.HierarchyNode = HierarchyNode;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('hierarchy-node', HierarchyNode);
            window.moqui.webrootVueApp.component('agi-artifact-palette', AgiArtifactPalette);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();