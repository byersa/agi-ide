(function () {
    const AgiArtifactPalette = {
        name: 'AgiArtifactPalette',
        template: `
            <div class="agi-artifact-palette bg-slate-900 text-white rounded-borders q-pa-xs">
                <!-- Search Filter Input -->
                <q-input 
                    v-model="searchQuery" 
                    placeholder="Filter artifacts..." 
                    dense 
                    outlined 
                    class="q-mb-xs font-mono text-caption"
                    bg-color="slate-950"
                >
                    <template v-slot:append>
                        <q-icon name="search" color="grey-5" size="xs" />
                    </template>
                </q-input>

                <!-- Artifact List with WorkspaceBuffer Accordion Drawer -->
                <q-list separator dense class="max-h-80 overflow-y-auto">
                    <q-expansion-item
                        v-for="item in filteredArtifacts" 
                        :key="item.value"
                        group="artifact-palette"
                        header-class="q-pa-xs bg-slate-950 hover-bg-slate-800 rounded-borders"
                        @show="onArtifactExpanded(item.value)"
                    >
                        <!-- Item Header -->
                        <template v-slot:header>
                            <q-item-section avatar min-width="24px">
                                <q-icon name="description" color="cyan-4" size="xs" />
                            </q-item-section>
                            <q-item-section @click.stop="selectArtifact(item)">
                                <q-item-label class="font-mono text-caption text-weight-bold text-cyan-4">
                                    {{ item.label }}
                                </q-item-label>
                                <q-item-label caption class="text-grey-8 font-mono text-caption ellipsis" style="max-width: 280px;">
                                    {{ item.value }}
                                </q-item-label>
                            </q-item-section>
                            <q-item-section side>
                                <q-badge color="deep-purple-9" text-color="white" class="font-mono" style="font-size: 9px;">
                                    {{ item.type || 'XML' }}
                                </q-badge>
                            </q-item-section>
                        </template>

                        <!-- Expanded WorkspaceBuffer JSON View -->
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

                            <!-- Formatted JSON Payload Container -->
                            <div class="bg-slate-900 q-pa-xs rounded-borders border-dark overflow-auto max-h-48 font-mono" style="font-size: 10px; border: 1px solid #1e293b;">
                                <div v-if="loadingBuffers[item.value]" class="text-center text-grey-8 q-pa-sm text-italic">
                                    <q-spinner-dots color="amber-5" size="xs" /> Loading WorkspaceBuffer...
                                </div>
                                <pre v-else-if="bufferCache[item.value]" class="q-ma-none text-grey-8" style="white-space: pre-wrap; word-break: break-all;">
{{ bufferCache[item.value] }}
                                </pre>
                                <div v-else class="text-center text-grey-8 q-pa-sm text-italic">
                                    No buffer initialized for this artifact. Click select or refresh.
                                </div>
                            </div>
                        </q-card>
                    </q-expansion-item>
                </q-list>
            </div>
        `,
        data() {
            return {
                searchQuery: '',
                artifacts: [],
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
                    a.value.toLowerCase().includes(q)
                );
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

            this.loadKnownArtifacts();
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },
        methods: {
            selectArtifact(item) {
                this.$emit('artifact-selected', item);
                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'open-screen-artifact',
                        artifactUri: item.value
                    });
                }
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
                    vm.artifacts = list.map(a => ({
                        label: a.screenName || a.artifactPath?.substring(a.artifactPath.lastIndexOf('/') + 1) || 'Screen',
                        value: a.artifactPath || a,
                        type: 'XML'
                    }));
                } catch (err) {
                    // Fallback stub list for target component
                    vm.artifacts = [
                        { label: 'nursinghome.xml', value: 'component://nursinghome/screen/nursinghome.xml', type: 'XML' },
                        { label: 'PatientIntake.xml', value: 'component://nursinghome/screen/nursinghome/PatientIntake.xml', type: 'XML' },
                        { label: 'agi-ide.xml', value: 'component://agi-ide/screen/agi-ide.xml', type: 'XML' }
                    ];
                }
            }
        }
    };

    window.AgiArtifactPalette = AgiArtifactPalette;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-artifact-palette'] = AgiArtifactPalette;
})();