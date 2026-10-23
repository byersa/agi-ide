(function () {
    const AgiPipelineIndex = {
        name: 'AgiPipelineIndex',
        emits: ['pipeline-selected', 'new-pipeline-created', 'pipeline-deleted', 'pipeline-renamed'],
        props: {
            activeDiscussionId: { type: String, default: '' },
            targetComponent: { type: String, default: 'nursinghome' }
        },
        data() {
            return {
                initiatives: [],
                loading: false,
                searchFilter: '',
                statusFilter: 'all', // 'all' | 'active' | 'promoted' | 'archived'
                isExpanded: true,
                deletingId: null,
                renamingId: null
            };
        },
        computed: {
            filteredInitiatives() {
                let list = this.initiatives || [];
                const q = (this.searchFilter || '').toLowerCase().trim();

                if (q) {
                    list = list.filter(item => {
                        const name = (item.name || '').toLowerCase();
                        const id = String(item.discussionId);
                        const art = (item.targetArtifactUri || '').toLowerCase();
                        return name.includes(q) || id.includes(q) || art.includes(q);
                    });
                }

                if (this.statusFilter === 'active') {
                    list = list.filter(i => !i.isArchived);
                } else if (this.statusFilter === 'promoted') {
                    list = list.filter(i => !!i.promotedWorkEffortId);
                } else if (this.statusFilter === 'archived') {
                    list = list.filter(i => i.isArchived);
                }

                return list;
            },
            selectedInitiative() {
                return (this.initiatives || []).find(i => String(i.discussionId) === String(this.activeDiscussionId));
            }
        },
        watch: {
            targetComponent() { this.fetchInitiatives(); }
        },
        mounted() {
            this.fetchInitiatives();
        },
        methods: {
            resolveCsrf() {
                return window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || "";
            },

            async fetchInitiatives() {
                this.loading = true;
                try {
                    const resp = await axios.get('/rest/s1/agi-ai/discussions/pipeline-graph', {
                        params: {
                            targetComponent: this.targetComponent,
                            includeArchived: this.statusFilter === 'archived' ? 'Y' : 'N'
                        },
                        headers: { 'moquiSessionToken': this.resolveCsrf() }
                    });
                    this.initiatives = resp.data?.initiatives || [];

                    // Auto-select first initiative if none selected
                    if (!this.activeDiscussionId && this.initiatives.length > 0) {
                        this.selectPipeline(this.initiatives[0]);
                    }
                } catch (e) {
                    console.error("Failed to load pipeline index:", e);
                } finally {
                    this.loading = false;
                }
            },

            selectPipeline(item) {
                this.$emit('pipeline-selected', item);
            },

            async savePipelineTitle(item, newTitle) {
                const discId = String(item.discussionId);
                const cleanTitle = (newTitle || '').trim();
                if (!cleanTitle || cleanTitle === item.name) return;

                this.renamingId = discId;
                try {
                    const resp = await axios.post('/rest/s1/agi-ai/discussions/title', {
                        discussionId: discId,
                        name: cleanTitle
                    }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                    const updatedName = resp.data?.name || cleanTitle;
                    item.name = updatedName;
                    if (resp.data?.shortName) item.shortName = resp.data.shortName;

                    this.$q.notify({
                        type: 'positive',
                        message: `Renamed pipeline #${discId} to "${updatedName}"`,
                        icon: 'check',
                        timeout: 1500
                    });

                    this.$emit('pipeline-renamed', {
                        discussionId: discId,
                        name: updatedName
                    });
                } catch (err) {
                    this.$q.notify({
                        type: 'negative',
                        message: 'Failed to update title: ' + (err.response?.data?.errors || err.message)
                    });
                } finally {
                    this.renamingId = null;
                }
            },

            promptCreatePipeline() {
                this.$q.dialog({
                    title: 'New Pipeline Initiative',
                    message: 'Enter initiative title (e.g., Bed Management Workflow, Clinical Ingestion):',
                    prompt: { model: '', type: 'text' },
                    cancel: true,
                    persistent: true
                }).onOk(async (name) => {
                    if (!name.trim()) return;
                    try {
                        const resp = await axios.post('/rest/s1/agi-ai/discussions', {
                            name: name.trim(),
                            targetComponent: this.targetComponent
                        }, { headers: { 'moquiSessionToken': this.resolveCsrf() } });

                        const newId = resp.data?.discussionId;
                        await this.fetchInitiatives();

                        const created = this.initiatives.find(i => String(i.discussionId) === String(newId));
                        if (created) {
                            this.selectPipeline(created);
                            this.$emit('new-pipeline-created', created);
                        }
                    } catch (err) {
                        this.$q.notify({ type: 'negative', message: 'Failed to create pipeline: ' + err.message });
                    }
                });
            },

            promptDeletePipeline(item) {
                const discId = String(item.discussionId);
                const title = item.name || `Pipeline #${discId}`;

                this.$q.dialog({
                    title: 'Delete Pipeline',
                    message: `Are you sure you want to permanently delete "${title}" (#${discId}) and all of its stages?`,
                    cancel: true,
                    persistent: true,
                    ok: {
                        label: 'Delete',
                        color: 'negative',
                        flat: false
                    }
                }).onOk(async () => {
                    this.deletingId = discId;
                    try {
                        await axios.delete(`/rest/s1/agi-ai/discussions/${discId}`, {
                            headers: { 'moquiSessionToken': this.resolveCsrf() }
                        });

                        this.$q.notify({
                            type: 'positive',
                            message: `Pipeline #${discId} deleted.`,
                            icon: 'delete'
                        });

                        const wasActive = String(this.activeDiscussionId) === discId;
                        await this.fetchInitiatives();

                        if (wasActive) {
                            if (this.initiatives.length > 0) {
                                this.selectPipeline(this.initiatives[0]);
                            } else {
                                this.$emit('pipeline-selected', null);
                            }
                        }

                        this.$emit('pipeline-deleted', { discussionId: discId });
                    } catch (err) {
                        this.$q.notify({
                            type: 'negative',
                            message: 'Failed to delete pipeline: ' + (err.response?.data?.errors || err.message)
                        });
                    } finally {
                        this.deletingId = null;
                    }
                });
            },

            getStageBadgeColor(stage) {
                if (stage === 'build') return 'amber-9';
                if (stage === 'plan') return 'deep-purple-7';
                return 'primary';
            }
        },
        template: `
            <div class="agi-pipeline-index bg-slate-950 text-white font-mono border-bottom-dark" style="border-bottom: 1px solid #334155;">
                
                <!-- COMPACT TITLE BAR & SUMMARY WHEN COLLAPSED -->
                <div class="row items-center justify-between q-px-sm q-py-xs bg-slate-900">
                    <div class="row items-center q-gutter-x-sm cursor-pointer" @click="isExpanded = !isExpanded">
                        <q-icon :name="isExpanded ? 'expand_less' : 'expand_more'" size="sm" color="cyan-4" />
                        <q-icon name="view_timeline" color="cyan-3" size="xs" />
                        <span class="text-caption text-weight-bolder text-cyan-2">PIPELINE INITIATIVES</span>
                        
                        <q-badge v-if="selectedInitiative" color="slate-800" text-color="amber-3" class="text-caption font-mono row items-center" style="border: 1px solid #0284c7;" @click.stop>
                            <span>ACTIVE: #{{ selectedInitiative.discussionId }} {{ selectedInitiative.name }}</span>
                            <q-icon name="edit" size="10px" class="q-ml-xs text-cyan-3 cursor-pointer" />
                            <q-tooltip class="bg-slate-900 text-cyan-2 font-mono">Click to rename active pipeline</q-tooltip>
                            
                            <q-popup-edit 
                                :model-value="selectedInitiative.name" 
                                v-slot="scope" 
                                buttons 
                                label-set="Save" 
                                label-cancel="Cancel"
                                color="cyan-4"
                                dark
                                @save="(val) => savePipelineTitle(selectedInitiative, val)"
                            >
                                <q-input 
                                    v-model="scope.value" 
                                    dense 
                                    autofocus 
                                    dark 
                                    outlined 
                                    class="font-mono text-caption"
                                    label="Pipeline Name"
                                    @keyup.enter="scope.set"
                                />
                            </q-popup-edit>
                        </q-badge>
                    </div>

                    <div class="row items-center q-gutter-x-xs">
                        <q-btn flat dense icon="add" size="xs" color="amber-4" label="New Pipeline" no-caps class="text-weight-bold" @click="promptCreatePipeline" />
                        <q-btn flat round dense icon="refresh" size="xs" color="cyan-4" @click="fetchInitiatives" />
                    </div>
                </div>

                <!-- EXPANDED MASTER LIST -->
                <q-slide-transition>
                    <div v-if="isExpanded" class="q-pa-xs bg-slate-950" style="border-top: 1px solid #1e293b;">
                        <!-- Filter & Quick Action Bar -->
                        <div class="row items-center justify-between q-mb-xs q-px-xs">
                            <q-input 
                                v-model="searchFilter" 
                                placeholder="Filter pipelines by name, #ID, or artifact..." 
                                dense dark outlined 
                                color="cyan-3"
                                class="col-6 text-caption font-mono"
                                input-class="text-caption font-mono text-slate-200"
                                style="background-color: #020617; border-radius: 4px;"
                                clearable
                            >
                                <template v-slot:prepend>
                                    <q-icon name="search" size="14px" color="cyan-4" />
                                </template>
                            </q-input>

                            <div class="row items-center q-gutter-x-xs text-caption" style="font-size: 10px;">
                                <span class="text-slate-500">FILTER:</span>
                                <span 
                                    class="cursor-pointer q-px-xs rounded-borders"
                                    :class="statusFilter === 'all' ? 'bg-cyan-9 text-white text-weight-bold' : 'text-slate-400'"
                                    @click="statusFilter = 'all'"
                                >All ({{ initiatives.length }})</span>
                                <span 
                                    class="cursor-pointer q-px-xs rounded-borders"
                                    :class="statusFilter === 'active' ? 'bg-blue-9 text-white text-weight-bold' : 'text-slate-400'"
                                    @click="statusFilter = 'active'"
                                >Active</span>
                                <span 
                                    class="cursor-pointer q-px-xs rounded-borders"
                                    :class="statusFilter === 'promoted' ? 'bg-positive text-black text-weight-bold' : 'text-slate-400'"
                                    @click="statusFilter = 'promoted'"
                                >With WorkEffort</span>
                                <span 
                                    class="cursor-pointer q-px-xs rounded-borders"
                                    :class="statusFilter === 'archived' ? 'bg-rose-9 text-white text-weight-bold' : 'text-slate-400'"
                                    @click="statusFilter = 'archived'"
                                >Archived</span>
                            </div>
                        </div>

                        <!-- Q-List Container -->
                        <q-list dense separator class="rounded-borders scroll" style="max-height: 180px; border: 1px solid #1e293b; background-color: #020617;">
                            <div v-if="loading" class="row justify-center q-pa-sm">
                                <q-spinner color="cyan-4" size="1.5em" />
                            </div>

                            <div v-else-if="filteredInitiatives.length === 0" class="text-center text-slate-500 q-pa-sm italic text-caption">
                                No pipeline initiatives found matching filter.
                            </div>

                            <q-item
                                v-for="item in filteredInitiatives"
                                :key="item.discussionId"
                                clickable
                                v-ripple
                                class="q-py-xs"
                                :class="{ 'bg-slate-900 border-l-4': String(activeDiscussionId) === String(item.discussionId) }"
                                :style="String(activeDiscussionId) === String(item.discussionId) ? 'border-left: 4px solid #0284c7;' : ''"
                                @click="selectPipeline(item)"
                            >
                                <q-item-section avatar style="min-width: 32px;">
                                    <q-icon 
                                        :name="item.isArchived ? 'archive' : (item.promotedWorkEffortId ? 'assignment_turned_in' : 'alt_route')" 
                                        :color="String(activeDiscussionId) === String(item.discussionId) ? 'cyan-3' : 'slate-500'" 
                                        size="xs" 
                                    />
                                </q-item-section>

                                <q-item-section>
                                    <div class="row items-center q-gutter-x-xs">
                                        <!-- In-place title edit container -->
                                        <div class="row items-center cursor-pointer text-caption font-mono text-weight-bold" :class="String(activeDiscussionId) === String(item.discussionId) ? 'text-cyan-2' : 'text-slate-300'" @click.stop>
                                            <span>#{{ item.discussionId }} {{ item.name }}</span>
                                            <q-icon name="edit" size="10px" class="q-ml-xs text-slate-500 hover:text-cyan-3" />
                                            <q-tooltip class="bg-slate-900 text-cyan-2 font-mono">Click to rename pipeline #{{ item.discussionId }}</q-tooltip>
                                            
                                            <q-popup-edit 
                                                :model-value="item.name" 
                                                v-slot="scope" 
                                                buttons 
                                                label-set="Save" 
                                                label-cancel="Cancel"
                                                color="cyan-4"
                                                dark
                                                @save="(val) => savePipelineTitle(item, val)"
                                            >
                                                <q-input 
                                                    v-model="scope.value" 
                                                    dense 
                                                    autofocus 
                                                    dark 
                                                    outlined 
                                                    class="font-mono text-caption"
                                                    label="Pipeline Name"
                                                    @keyup.enter="scope.set"
                                                />
                                            </q-popup-edit>
                                        </div>

                                        <!-- NULL-SAFE BADGE RENDER -->
                                        <q-badge :color="getStageBadgeColor(item.terminalStage || 'discuss')" text-color="white" class="font-mono text-caption" style="font-size: 8px;">
                                            {{ (item.terminalStage || 'discuss').toUpperCase() }}
                                        </q-badge>
                                        <q-badge v-if="item.promotedWorkEffortId" color="positive" text-color="black" class="font-mono text-caption" style="font-size: 8px;">
                                            WE #{{ item.promotedWorkEffortId }}
                                        </q-badge>
                                    </div>
                                    <div v-if="item.targetArtifactUri" class="text-grey-5 font-mono ellipsis" style="font-size: 9px;">
                                        {{ item.targetArtifactUri }}
                                    </div>
                                </q-item-section>

                                <!-- Right Side: Metrics & Delete Action -->
                                <q-item-section side class="font-mono" style="font-size: 9px;">
                                    <div class="row items-center q-gutter-x-sm">
                                        <div class="text-right" style="color: #64748b;">
                                            <div>{{ item.messageCount || 0 }} stages</div>
                                            <div v-if="item.lastActivityDate">{{ item.lastActivityDate.substring(0, 10) }}</div>
                                        </div>
                                        <q-btn
                                            flat round dense
                                            icon="delete_outline"
                                            size="xs"
                                            color="rose-4"
                                            :loading="deletingId === String(item.discussionId)"
                                            @click.stop="promptDeletePipeline(item)"
                                        >
                                            <q-tooltip>Delete pipeline #{{ item.discussionId }}</q-tooltip>
                                        </q-btn>
                                    </div>
                                </q-item-section>
                            </q-item>
                        </q-list>
                    </div>
                </q-slide-transition>

            </div>
        `
    };

    window.AgiPipelineIndex = AgiPipelineIndex;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-pipeline-index'] = AgiPipelineIndex;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('agi-pipeline-index', AgiPipelineIndex);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();