(function () {
    const AgiEntityEditor = {
        name: 'AgiEntityEditor',
        props: {
            entityUri: { type: String, default: '' },
            layoutTree: { type: [Object, Array, String], default: null }
        },
        template: `
            <div class="fit column no-wrap bg-slate-950 text-white font-mono text-caption select-none">
                
                <!-- TOP TOOLBAR & QUICK ACTIONS -->
                <div class="row items-center justify-between q-pa-xs bg-slate-900 border-bottom-dark" style="border-bottom: 1px solid #334155;">
                    <div class="row items-center q-gutter-x-sm">
                        <q-icon name="storage" color="secondary" size="sm" />
                        <div>
                            <span class="text-weight-bold text-cyan-3 text-subtitle2">{{ resolvedEntityName || 'Entity Definition' }}</span>
                            <q-badge color="deep-purple-9" class="q-ml-xs text-caption" style="font-size: 9px;">MOQUI UDM ENTITY</q-badge>
                        </div>
                    </div>

                    <div class="row items-center q-gutter-x-xs">
                        <q-btn 
                            color="cyan-8" 
                            icon="table_view" 
                            label="View Data" 
                            dense 
                            class="q-px-sm" 
                            :loading="isLoadingData"
                            @click="loadLiveEntityData"
                        >
                            <q-tooltip>Query top 20 records from database</q-tooltip>
                        </q-btn>
                        <q-btn color="secondary" icon="add" label="Add Field" dense class="q-px-xs" @click="addField" />
                        <q-btn color="primary" icon="save" label="Save (Ctrl+S)" dense class="q-px-sm" @click="saveEntity" />
                    </div>
                </div>

                <!-- MAIN WORKSPACE -->
                <div class="col row no-wrap overflow-hidden">
                    
                    <!-- 1. FIELD DEFINITIONS & RELATIONSHIPS TABLE -->
                    <div class="col-8 column no-wrap q-pa-xs border-right-dark" style="border-right: 1px solid #334155; overflow-y: auto;">
                        
                        <!-- Entity Metadata Header -->
                        <div class="row items-center q-col-gutter-xs q-mb-xs bg-slate-900 q-pa-xs rounded-borders" style="border: 1px solid #1e293b;">
                            <div class="col-6">
                                <q-input v-model="entityPackage" label="Package / Group" dense dark outlined class="font-mono text-caption" />
                            </div>
                            <div class="col-6">
                                <q-checkbox v-model="enableAuditLog" label="enable-audit-log (HIPAA)" dense dark color="secondary" />
                            </div>
                        </div>

                        <!-- Fields List -->
                        <div class="bg-slate-900 q-pa-xs rounded-borders q-mb-xs" style="border: 1px solid #334155;">
                            <div class="row items-center justify-between text-caption text-weight-bold text-secondary q-mb-xs">
                                <span>FIELDS ({{ fieldsList.length }})</span>
                                <span class="text-grey-5" style="font-size: 10px;">Primary Keys &amp; Data Types</span>
                            </div>

                            <div v-for="(f, fIdx) in fieldsList" :key="fIdx" class="row items-center justify-between bg-black q-pa-xs rounded-borders q-mb-xs" style="border-left: 3px solid #06b6d4;">
                                <div class="row items-center q-gutter-x-sm col">
                                    <q-badge v-if="f.isPk" color="purple-9" text-color="white" class="font-mono text-weight-bold" style="font-size: 8px;">PK</q-badge>
                                    <span class="text-weight-bold text-white font-mono">{{ f.name }}</span>
                                    <span class="text-grey-5 font-mono">({{ f.type }})</span>
                                    <q-badge v-if="f.encrypt" color="amber-10" text-color="black" class="font-mono text-weight-bold" style="font-size: 8px;">ENCRYPTED (PHI)</q-badge>
                                </div>
                                <div class="row items-center q-gutter-x-xs">
                                    <q-btn flat dense :icon="f.encrypt ? 'lock' : 'lock_open'" size="xs" :color="f.encrypt ? 'amber' : 'grey-6'" @click="f.encrypt = !f.encrypt">
                                        <q-tooltip>{{ f.encrypt ? 'Disable encryption' : 'Enable HIPAA encrypt="true"' }}</q-tooltip>
                                    </q-btn>
                                    <q-btn flat dense icon="delete" size="xs" color="negative" @click="fieldsList.splice(fIdx, 1)" />
                                </div>
                            </div>
                        </div>

                        <!-- Relationships List -->
                        <div class="bg-slate-900 q-pa-xs rounded-borders" style="border: 1px solid #334155;">
                            <div class="row items-center justify-between text-caption text-weight-bold text-cyan-4 q-mb-xs">
                                <span>RELATIONSHIPS ({{ relationshipsList.length }})</span>
                                <q-btn flat dense icon="add" size="xs" color="cyan-4" @click="addRelationship" />
                            </div>

                            <div v-for="(rel, rIdx) in relationshipsList" :key="rIdx" class="row items-center justify-between bg-black q-pa-xs rounded-borders q-mb-xs">
                                <div class="row items-center q-gutter-x-sm">
                                    <q-chip dense size="xs" color="deep-purple-9" text-color="white">{{ rel.type || 'one' }}</q-chip>
                                    <span class="text-white font-mono text-weight-bold">{{ rel.relatedEntity }}</span>
                                    <span v-if="rel.title" class="text-grey-5 font-mono">as ({{ rel.title }})</span>
                                </div>
                                <q-btn flat dense icon="delete" size="xs" color="grey-6" @click="relationshipsList.splice(rIdx, 1)" />
                            </div>
                        </div>

                    </div>

                    <!-- 2. DATA GROUNDING & PREVIEW DRAWER (Right Pane) -->
                    <div class="col-4 column no-wrap bg-slate-900 q-pa-xs" style="overflow-y: auto;">
                        <div class="text-caption text-weight-bold text-grey-4 q-mb-xs">LIVE DATA PREVIEW</div>
                        
                        <div v-if="dataRecords && dataRecords.length > 0" class="column q-gutter-y-xs">
                            <div v-for="(rec, recIdx) in dataRecords" :key="recIdx" class="bg-black q-pa-xs rounded-borders" style="border: 1px solid #1e293b;">
                                <pre class="text-slate-300 font-mono q-ma-none" style="font-size: 9px; max-height: 80px; overflow-y: auto;">{{ JSON.stringify(rec, null, 2) }}</pre>
                            </div>
                        </div>
                        <div v-else class="text-grey-6 italic text-center q-pa-md" style="font-size: 11px;">
                            Click "View Data" to inspect records.
                        </div>
                    </div>

                </div>

            </div>
        `,
        data() {
            return {
                isLoadingData: false,
                resolvedEntityName: 'nursinghome.patient.Patient',
                entityPackage: 'nursinghome.patient',
                enableAuditLog: true,
                fieldsList: [
                    { name: 'patientId', type: 'id', isPk: true, encrypt: false },
                    { name: 'partyId', type: 'id', isPk: false, encrypt: false },
                    { name: 'medicalRecordNum', type: 'text-short', isPk: false, encrypt: true },
                    { name: 'admissionDate', type: 'date-time', isPk: false, encrypt: false }
                ],
                relationshipsList: [
                    { type: 'one', relatedEntity: 'mantle.party.Person', title: 'PersonRecord' }
                ],
                dataRecords: []
            };
        },
        watch: {
            entityUri(newUri) {
                if (newUri) this.loadEntityDefinition(newUri);
            }
        },
        mounted() {
            if (this.entityUri) this.loadEntityDefinition(this.entityUri);
        },
        methods: {
            resolveCsrfToken() {
                return window.AGI_SERVER_CSRF_TOKEN || (window.moqui && window.moqui.moquiSessionToken) || "";
            },

            async loadEntityDefinition(uri) {
                if (!uri) return;
                const vm = this;
                const headers = { 'moquiSessionToken': this.resolveCsrfToken() };

                try {
                    const resp = await axios.get('/rest/s1/agi-ide/getEntityBlueprint', {
                        params: { artifactUri: uri },
                        headers: headers
                    });

                    const ast = resp.data?.entityAst;
                    if (!ast) return;

                    let entityNode = ast;
                    if (ast.name === 'entities') {
                        entityNode = (ast.children || []).find(c => c.name === 'entity') || ast;
                    }

                    vm.resolvedEntityName = entityNode.attributes?.['entity-name'] || '';
                    vm.entityPackage = entityNode.attributes?.['package'] || '';
                    vm.enableAuditLog = entityNode.attributes?.['enable-audit-log'] === 'true';

                    vm.fieldsList = (entityNode.children || [])
                        .filter(c => c.name === 'field')
                        .map(f => ({
                            name: f.attributes?.name || '',
                            type: f.attributes?.type || 'text-medium',
                            isPk: f.attributes?.isPk === 'true',
                            encrypt: f.attributes?.encrypt === 'true'
                        }));

                    vm.relationshipsList = (entityNode.children || [])
                        .filter(c => c.name === 'relationship')
                        .map(r => ({
                            type: r.attributes?.type || 'one',
                            relatedEntity: r.attributes?.related || r.attributes?.['related-entity-name'] || '',
                            title: r.attributes?.title || ''
                        }));

                } catch (err) {
                    console.warn(`Could not load entity blueprint for ${uri}:`, err);
                }
            },

            addField() {
                const name = prompt('Enter field name:');
                if (!name) return;
                this.fieldsList.push({ name: name, type: 'text-medium', isPk: false, encrypt: false });
            },

            addRelationship() {
                const rel = prompt('Enter related entity (e.g. mantle.party.Person):');
                if (!rel) return;
                this.relationshipsList.push({ type: 'one', relatedEntity: rel, title: '' });
            },

            async loadLiveEntityData() {
                this.isLoadingData = true;
                const headers = { 'moquiSessionToken': this.resolveCsrfToken() };
                try {
                    const resp = await axios.get('/rest/s1/agi-ide/queryEntityData', {
                        params: { entityName: this.resolvedEntityName },
                        headers: headers
                    });
                    this.dataRecords = resp.data?.records || [];
                } catch (err) {
                    console.warn("Could not query live entity data:", err);
                    this.dataRecords = [];
                } finally {
                    this.isLoadingData = false;
                }
            },

            saveEntity() {
                this.$emit('trigger-save');
            }
        }
    };

    window.AgiEntityEditor = AgiEntityEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['AgiEntityEditor'] = AgiEntityEditor;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('agi-entity-editor', AgiEntityEditor);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();