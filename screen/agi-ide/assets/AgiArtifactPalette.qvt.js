(function () {
    const AgiArtifactPalette = {
        name: 'AgiArtifactPalette',
        template: `
            <div class="q-pa-sm bg-slate-900 text-white rounded-borders">
                <q-input 
                    v-model="filterTerm" 
                    dense 
                    outlined 
                    dark 
                    placeholder="Search artifact or screenPath (e.g. ManagePatients)..."
                    @update:model-value="fetchPalette"
                >
                    <template v-slot:prepend>
                        <q-icon name="search" color="primary" />
                    </template>
                </q-input>

                <q-scroll-area style="height: 280px;" class="q-mt-sm">
                    <q-list dark separator dense>
                        <q-item 
                            v-for="item in artifacts" 
                            :key="item.value" 
                            clickable 
                            v-ripple
                            @click="selectArtifact(item)"
                        >
                            <q-item-section avatar>
                                <q-icon :name="item.isComponent ? 'javascript' : 'code'" :color="item.isComponent ? 'warning' : 'info'" />
                            </q-item-section>
                            <q-item-section>
                                <q-item-label class="text-weight-bold">{{ item.label }}</q-item-label>
                                <q-item-label caption class="text-grey-5">{{ item.value }}</q-item-label>
                            </q-item-section>
                            <q-item-section side>
                                <q-badge outline color="primary" :label="item.status" />
                            </q-item-section>
                        </q-item>
                    </q-list>
                </q-scroll-area>
            </div>
        `,
        data() {
            return {
                filterTerm: '',
                artifacts: []
            };
        },
        mounted() {
            this.fetchPalette();
        },
        methods: {
            async fetchPalette() {
                var vm = this;
                const headers = { 'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "" };
                try {
                    const response = await axios.get('/rest/s1/agi-ai/mcp/palette', {
                        params: { searchTerm: vm.filterTerm, targetComponent: 'nursinghome' },
                        headers: headers
                    });
                    vm.artifacts = response.data?.flatList || [];
                } catch (err) {
                    console.warn("⚠️ Error fetching artifact palette:", err);
                }
            },
            selectArtifact(item) {
                this.$emit('artifact-selected', item);
            }
        }
    };

    window.AgiArtifactPalette = AgiArtifactPalette;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['AgiArtifactPalette'] = AgiArtifactPalette;
})();