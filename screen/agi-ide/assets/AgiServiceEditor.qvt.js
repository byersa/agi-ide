(function () {
    const AgiServiceEditor = {
        name: 'AgiServiceEditor',
        props: {
            serviceUri: { type: String, default: '' },
            layoutTree: { type: [Object, Array, String], default: null }
        },
        template: `
            <div class="fit column no-wrap bg-slate-950 text-white font-mono text-caption select-none">
                
                <!-- TOP TOOLBAR & QUICK TEST CONTROLS -->
                <div class="row items-center justify-between q-pa-xs bg-slate-900 border-bottom-dark" style="border-bottom: 1px solid #334155;">
                    <div class="row items-center q-gutter-x-sm">
                        <q-icon name="miscellaneous_services" color="warning" size="sm" />
                        <div>
                            <span class="text-weight-bold text-amber-4 text-subtitle2">{{ resolvedServiceName }}</span>
                            <q-badge color="deep-purple-9" class="q-ml-xs text-caption" style="font-size: 9px;">SERVICE DEF</q-badge>
                        </div>
                    </div>

                    <div class="row items-center q-gutter-x-xs">
                        <q-btn 
                            color="positive" 
                            icon="play_arrow" 
                            label="Test Service" 
                            dense 
                            class="q-px-sm text-weight-bold" 
                            :loading="isTesting"
                            @click="executeTransientTest"
                        >
                            <q-tooltip>Execute service in a rollback transaction harness</q-tooltip>
                        </q-btn>
                        <q-btn color="cyan-8" icon="category" label="Archetypes &amp; Tags" dense class="q-px-xs" @click="showTagPalette = !showTagPalette" />
                        <q-btn color="primary" icon="save" label="Save (Ctrl+S)" dense class="q-px-sm" @click="saveService" />
                    </div>
                </div>

                <!-- MAIN WORKSPACE: TAG/ARCHETYPE PALETTE + PARAMETERS + ACTION PIPELINE -->
                <div class="col row no-wrap overflow-hidden">
                    
                    <!-- 1. AVAILABLE TAGS & ARCHETYPES PALETTE (Left Sidebar) -->
                    <q-slide-transition horizontal>
                        <div v-if="showTagPalette" class="col-3 bg-black border-right-dark q-pa-xs column no-wrap" style="border-right: 1px solid #334155; overflow-y: auto;">
                            <div class="text-caption text-weight-bold text-cyan-4 q-pa-xs row items-center justify-between">
                                <span>ARCHETYPES &amp; TAGS</span>
                                <q-btn flat dense round icon="close" size="xs" color="grey-5" @click="showTagPalette = false" />
                            </div>

                            <!-- SERVICE ARCHETYPES SECTION -->
                            <div class="q-mb-sm q-pa-xs bg-slate-900 rounded-borders" style="border: 1px solid #1e293b;">
                                <div class="text-secondary text-weight-bold q-px-xs q-mb-xs" style="font-size: 10px;">PRESET ARCHETYPES</div>
                                <div class="column q-gutter-y-xs">
                                    <q-btn 
                                        v-for="(arch, aIdx) in archetypes" 
                                        :key="aIdx"
                                        outline 
                                        color="secondary" 
                                        dense 
                                        no-caps 
                                        align="left"
                                        class="full-width q-px-xs"
                                        @click="applyArchetype(arch)"
                                    >
                                        <div class="column">
                                            <span class="text-weight-bold font-mono" style="font-size: 10px;">{{ arch.title }}</span>
                                            <span class="text-grey-5" style="font-size: 9px;">{{ arch.description }}</span>
                                        </div>
                                    </q-btn>
                                </div>
                            </div>

                            <!-- GRANULAR TAGS SECTION -->
                            <div v-for="(group, gIdx) in tagGroups" :key="gIdx" class="q-mb-xs">
                                <div class="text-grey-5 text-weight-bold q-px-xs q-mb-xs" style="font-size: 10px;">{{ group.category }}</div>
                                <div class="row q-gutter-xs">
                                    <q-chip 
                                        v-for="tag in group.tags" 
                                        :key="tag.name" 
                                        dense clickable 
                                        size="sm" 
                                        color="slate-800" 
                                        text-color="cyan-2"
                                        @click="insertActionNode(tag)"
                                    >
                                        <q-icon :name="tag.icon" size="xs" class="q-mr-xs" />
                                        &lt;{{ tag.name }}&gt;
                                    </q-chip>
                                </div>
                            </div>
                        </div>
                    </q-slide-transition>

                    <!-- 2. PARAMETERS & ACTION PIPELINE STACK -->
                    <div class="col column no-wrap q-pa-xs" style="overflow-y: auto;">
                        
                        <!-- PARAMETER CARDS (IN / OUT) -->
                        <div class="row q-col-gutter-xs q-mb-xs">
                            
                            <!-- In-Parameters -->
                            <div class="col-6">
                                <div class="bg-slate-900 q-pa-xs rounded-borders" style="border: 1px solid #334155;">
                                    <div class="row items-center justify-between text-caption text-weight-bold text-secondary q-mb-xs">
                                        <span>IN-PARAMETERS ({{ inParameters.length }})</span>
                                        <q-btn flat dense icon="add" size="xs" color="secondary" @click="addParameter('in')" />
                                    </div>
                                    <div v-for="(p, pIdx) in inParameters" :key="pIdx" class="row items-center justify-between bg-black q-pa-xs rounded-borders q-mb-xs">
                                        <div class="row items-center q-gutter-x-xs">
                                            <span class="text-white text-weight-bold">{{ p.name }}</span>
                                            <span class="text-grey-5">({{ p.type || 'String' }})</span>
                                            <q-badge v-if="p.required === 'true'" color="negative" class="text-caption" style="font-size: 8px;">Req</q-badge>
                                        </div>
                                        <q-btn flat dense icon="delete" size="xs" color="grey-6" @click="inParameters.splice(pIdx, 1)" />
                                    </div>
                                    <div v-if="inParameters.length === 0" class="text-grey-6 italic text-center q-pa-xs" style="font-size: 10px;">No in-parameters defined</div>
                                </div>
                            </div>

                            <!-- Out-Parameters -->
                            <div class="col-6">
                                <div class="bg-slate-900 q-pa-xs rounded-borders" style="border: 1px solid #334155;">
                                    <div class="row items-center justify-between text-caption text-weight-bold text-cyan-4 q-mb-xs">
                                        <span>OUT-PARAMETERS ({{ outParameters.length }})</span>
                                        <q-btn flat dense icon="add" size="xs" color="cyan-4" @click="addParameter('out')" />
                                    </div>
                                    <div v-for="(p, pIdx) in outParameters" :key="pIdx" class="row items-center justify-between bg-black q-pa-xs rounded-borders q-mb-xs">
                                        <div class="row items-center q-gutter-x-xs">
                                            <span class="text-white text-weight-bold">{{ p.name }}</span>
                                            <span class="text-grey-5">({{ p.type || 'String' }})</span>
                                        </div>
                                        <q-btn flat dense icon="delete" size="xs" color="grey-6" @click="outParameters.splice(pIdx, 1)" />
                                    </div>
                                    <div v-if="outParameters.length === 0" class="text-grey-6 italic text-center q-pa-xs" style="font-size: 10px;">No out-parameters defined</div>
                                </div>
                            </div>
                        </div>

                        <!-- ACTIONS PIPELINE FLOW (SEQUENCE LIST) -->
                        <div class="bg-slate-900 q-pa-xs rounded-borders flex-grow" style="border: 1px solid #334155;">
                            <div class="row items-center justify-between text-caption text-weight-bold text-amber-4 q-mb-xs">
                                <div class="row items-center q-gutter-x-xs">
                                    <q-icon name="alt_route" />
                                    <span>&lt;actions&gt; EXECUTION PIPELINE ({{ actionSteps.length }} Steps)</span>
                                </div>
                                <span class="text-grey-5" style="font-size: 10px;">xml-actions-3.xsd</span>
                            </div>

                            <div v-for="(step, sIdx) in actionSteps" :key="sIdx" class="bg-black q-pa-xs rounded-borders q-mb-xs" style="border-left: 3px solid #f59e0b;">
                                <div class="row items-center justify-between">
                                    <div class="row items-center q-gutter-x-xs">
                                        <span class="text-caption text-grey-5 font-mono">#{{ sIdx + 1 }}</span>
                                        <q-chip dense size="xs" color="amber-10" text-color="black" class="font-mono text-weight-bold">&lt;{{ step.name }}&gt;</q-chip>
                                        <span class="text-slate-300 font-mono ellipsis" style="max-width: 400px;">{{ formatStepSummary(step) }}</span>
                                    </div>
                                    <div class="row items-center q-gutter-x-xs">
                                        <q-btn flat dense icon="arrow_upward" size="xs" color="grey-5" :disable="sIdx === 0" @click="moveStep(sIdx, -1)" />
                                        <q-btn flat dense icon="arrow_downward" size="xs" color="grey-5" :disable="sIdx === actionSteps.length - 1" @click="moveStep(sIdx, 1)" />
                                        <q-btn flat dense icon="delete" size="xs" color="negative" @click="actionSteps.splice(sIdx, 1)" />
                                    </div>
                                </div>

                                <!-- Inline Code Editor if tag is <script> -->
                                <div v-if="step.name === 'script'" class="q-mt-xs">
                                    <textarea 
                                        v-model="step.text" 
                                        class="full-width font-mono text-caption q-pa-xs bg-slate-950 text-secondary rounded-borders"
                                        style="border: 1px solid #334155; min-height: 70px; resize: vertical;"
                                        placeholder="// Enter inline Groovy action script..."
                                    ></textarea>
                                </div>
                            </div>

                            <div v-if="actionSteps.length === 0" class="text-grey-6 italic text-center q-pa-md">
                                &lt;actions&gt; pipeline is empty. Apply an Archetype or select a tag to begin.
                            </div>
                        </div>

                    </div>

                </div>

                <!-- 3. TEST RESULTS & AI ERROR-CORRECTION HARNESS (Bottom Drawer) -->
                <q-slide-transition>
                    <div v-if="testReport" class="bg-slate-900 border-top-dark q-pa-xs" style="border-top: 2px solid #334155; max-height: 220px; overflow-y: auto;">
                        <div class="row items-center justify-between q-mb-xs">
                            <div class="row items-center q-gutter-x-xs">
                                <q-icon :name="testReport.status === 'SUCCESS' ? 'check_circle' : 'error'" :color="testReport.status === 'SUCCESS' ? 'positive' : 'negative'" />
                                <span class="text-weight-bold font-mono">Test Run Status: {{ testReport.status }}</span>
                                <span class="text-grey-5">({{ testReport.executionTimeMs }}ms)</span>
                            </div>
                            <div class="row items-center q-gutter-x-xs">
                                <q-btn v-if="testReport.status !== 'SUCCESS'" color="deep-purple-7" icon="auto_fix_high" label="Ask AI to Fix Error" dense size="xs" @click="sendErrorToApePrompt" />
                                <q-btn flat dense icon="close" size="xs" color="grey-5" @click="testReport = null" />
                            </div>
                        </div>

                        <pre v-if="testReport.status === 'SUCCESS'" class="text-positive q-pa-xs bg-black rounded-borders overflow-auto" style="font-size: 10px;">{{ JSON.stringify(testReport.results, null, 2) }}</pre>
                        <pre v-else class="text-negative q-pa-xs bg-black rounded-borders overflow-auto" style="font-size: 10px;">{{ testReport.errorMessage }}\n\n{{ testReport.errorStackTrace }}</pre>
                    </div>
                </q-slide-transition>

            </div>
        `,
        data() {
            return {
                showTagPalette: true,
                isTesting: false,
                testReport: null,
                resolvedServiceName: '',
                inParameters: [],
                outParameters: [],
                actionSteps: [],

                // PRESET SERVICE ARCHETYPES
                archetypes: [
                    {
                        title: 'Mantle UDM Person Extension',
                        description: 'Creates mantle.party.Person, binds partyId, and creates domain extension entity[cite: 9, 10].',
                        inParams: [
                            { name: 'firstName', type: 'String', required: 'true' },
                            { name: 'lastName', type: 'String', required: 'true' },
                            { name: 'birthDate', type: 'Date', required: 'false' },
                            { name: 'roomNumber', type: 'String', required: 'false' }
                        ],
                        outParams: [
                            { name: 'partyId', type: 'String' },
                            { name: 'patientId', type: 'String' }
                        ],
                        steps: [
                            { name: 'service-call', attributes: { name: 'mantle.party.PartyServices.create#Person', 'in-map': 'context', 'out-map': 'partyResult' } },
                            { name: 'set', attributes: { field: 'partyId', from: 'partyResult.partyId' } },
                            { name: 'entity-make-value', attributes: { 'entity-name': 'nursinghome.patient.Patient', 'value-field': 'patientValue' } },
                            { name: 'entity-set', attributes: { 'value-field': 'patientValue', map: 'context' } },
                            { name: 'entity-sequenced-id-primary', attributes: { 'value-field': 'patientValue' } },
                            { name: 'entity-create', attributes: { 'value-field': 'patientValue' } },
                            { name: 'set', attributes: { field: 'patientId', from: 'patientValue.patientId' } }
                        ]
                    },
                    {
                        title: 'Entity-Auto REST Wrapper',
                        description: 'Direct CRUD wrapper service with auto-parameters and audit checking[cite: 7, 8].',
                        inParams: [
                            { name: 'patientId', type: 'String', required: 'false' },
                            { name: 'statusId', type: 'String', required: 'true' }
                        ],
                        outParams: [
                            { name: 'patientId', type: 'String' }
                        ],
                        steps: [
                            { name: 'entity-find-one', attributes: { 'entity-name': 'nursinghome.patient.Patient', 'value-field': 'patientValue', 'for-update': 'true' } },
                            { name: 'entity-set', attributes: { 'value-field': 'patientValue', map: 'context' } },
                            { name: 'entity-update', attributes: { 'value-field': 'patientValue' } }
                        ]
                    }
                ],

                tagGroups: [
                    {
                        category: 'SERVICE & FLOW',
                        tags: [
                            { name: 'service-call', icon: 'bolt', defaultAttrs: { name: '', 'in-map': 'context' } },
                            { name: 'if', icon: 'call_split', defaultAttrs: { condition: '' } },
                            { name: 'set', icon: 'edit', defaultAttrs: { field: '', from: '' } },
                            { name: 'return', icon: 'keyboard_return', defaultAttrs: { message: '' } }
                        ]
                    },
                    {
                        category: 'ENTITY CRUD',
                        tags: [
                            { name: 'entity-find-one', icon: 'search', defaultAttrs: { 'entity-name': '', 'value-field': '' } },
                            { name: 'entity-find', icon: 'manage_search', defaultAttrs: { 'entity-name': '', list: '' } },
                            { name: 'entity-make-value', icon: 'note_add', defaultAttrs: { 'entity-name': '', 'value-field': '' } },
                            { name: 'entity-create', icon: 'save', defaultAttrs: { 'value-field': '' } },
                            { name: 'entity-update', icon: 'update', defaultAttrs: { 'value-field': '' } },
                            { name: 'entity-delete', icon: 'delete', defaultAttrs: { 'value-field': '' } }
                        ]
                    },
                    {
                        category: 'SCRIPT & MSG',
                        tags: [
                            { name: 'script', icon: 'code', defaultAttrs: {}, defaultText: '// Custom Groovy Script Block\n' },
                            { name: 'message', icon: 'chat', defaultAttrs: { type: 'info' } },
                            { name: 'log', icon: 'history', defaultAttrs: { level: 'info', message: '' } }
                        ]
                    }
                ]
            };
        },
        watch: {
            serviceUri(newUri) {
                if (newUri) this.loadServiceDefinition(newUri);
            }
        },
        mounted() {
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            if (this.serviceUri) this.loadServiceDefinition(this.serviceUri);
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },
        methods: {

            async loadServiceDefinition(uri, nameOverride) {
                if (!uri) return;
                const vm = this;
                const targetName = nameOverride || this.serviceName || this.resolvedServiceName || '';
                const headers = { 'moquiSessionToken': this.resolveCsrfToken() };

                try {
                    const response = await axios.get('/rest/s1/agi-ide/getServiceBlueprint', {
                        params: {
                            artifactUri: uri,
                            serviceName: targetName
                        },
                        headers: headers
                    });

                    const data = response.data || {};
                    const serviceNode = data.serviceAst || null;
                    if (!serviceNode) return;

                    const attrs = serviceNode.attributes || {};
                    const verb = attrs.verb || 'run';
                    const noun = attrs.noun ? `#${attrs.noun}` : '';

                    let pkgPath = '';
                    if (uri.startsWith('component://')) {
                        const clean = uri.replace(/^component:\/\//, '').replace(/\.xml$/, '').replace(/\.service\.xml$/, '');
                        const parts = clean.split('/service/');
                        if (parts.length > 1) {
                            pkgPath = parts[1].replace(/\//g, '.') + '.';
                        }
                    }

                    vm.resolvedServiceName = `${pkgPath}${verb}${noun}`;

                    const inParamsNode = (serviceNode.children || []).find(c => c.name === 'in-parameters');
                    vm.inParameters = inParamsNode ? (inParamsNode.children || [])
                        .filter(c => c.name === 'parameter')
                        .map(p => ({
                            name: p.attributes?.name || '',
                            type: p.attributes?.type || 'String',
                            required: p.attributes?.required || 'false'
                        })) : [];

                    const outParamsNode = (serviceNode.children || []).find(c => c.name === 'out-parameters');
                    vm.outParameters = outParamsNode ? (outParamsNode.children || [])
                        .filter(c => c.name === 'parameter')
                        .map(p => ({
                            name: p.attributes?.name || '',
                            type: p.attributes?.type || 'String'
                        })) : [];

                    const actionsNode = (serviceNode.children || []).find(c => c.name === 'actions');
                    vm.actionSteps = actionsNode ? (actionsNode.children || []).map(step => ({
                        name: step.name,
                        attributes: { ...(step.attributes || {}) },
                        children: step.children || [],
                        text: step.text || ''
                    })) : [];

                } catch (err) {
                    console.warn(`Could not load service blueprint for ${uri}:`, err);
                }
            },

            resolveCsrfToken() {
                return window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || "";
            },

            formatStepSummary(step) {
                if (!step.attributes) return '';
                const attrs = step.attributes;
                if (step.name === 'service-call') return `call: ${attrs.name || 'unspecified'}`;
                if (step.name === 'set') return `${attrs.field} = ${attrs.from || attrs.value}`;
                if (step.name.startsWith('entity-')) return `entity: ${attrs['entity-name'] || attrs['value-field'] || ''}`;
                if (step.name === 'if') return `condition: ${attrs.condition}`;
                if (step.name === 'script') return `Groovy Script Block (${(step.text || '').length} chars)`;
                return JSON.stringify(attrs);
            },

            applyArchetype(arch) {
                if (confirm(`Apply "${arch.title}" archetype? This will populate standard in/out parameters and action steps.`)) {
                    this.inParameters = JSON.parse(JSON.stringify(arch.inParams));
                    this.outParameters = JSON.parse(JSON.stringify(arch.outParams));
                    this.actionSteps = JSON.parse(JSON.stringify(arch.steps));
                }
            },

            insertActionNode(tag) {
                this.actionSteps.push({
                    name: tag.name,
                    attributes: { ...tag.defaultAttrs },
                    children: [],
                    text: tag.defaultText || ''
                });
            },

            moveStep(idx, direction) {
                const targetIdx = idx + direction;
                if (targetIdx < 0 || targetIdx >= this.actionSteps.length) return;
                const temp = this.actionSteps[idx];
                this.actionSteps[idx] = this.actionSteps[targetIdx];
                this.actionSteps[targetIdx] = temp;
            },

            addParameter(type) {
                const name = prompt(`Enter ${type}-parameter name:`);
                if (!name) return;
                const list = type === 'in' ? this.inParameters : this.outParameters;
                list.push({ name: name, type: 'String', required: 'false' });
            },



            async executeTransientTest() {
                this.isTesting = true;
                this.testReport = null;
                const headers = { 'moquiSessionToken': this.resolveCsrfToken() };

                const sampleIn = {};
                this.inParameters.forEach(p => {
                    sampleIn[p.name] = p.type === 'Date' ? '2026-08-26' : `Test_${p.name}`;
                });

                try {
                    const resp = await axios.post('/rest/s1/agi-ide/testServiceExecution', {
                        serviceName: this.resolvedServiceName,
                        testParameters: sampleIn,
                        rollbackTransaction: true
                    }, { headers });
                    this.testReport = resp.data || {};
                } catch (err) {
                    this.testReport = {
                        status: 'ERROR',
                        errorMessage: err.message,
                        executionTimeMs: 0
                    };
                } finally {
                    this.isTesting = false;
                }
            },

            sendErrorToApePrompt() {
                if (!this.testReport) return;
                const fixPrompt = `Service execution test failed on ${this.resolvedServiceName} with error:\n"${this.testReport.errorMessage}".\nPlease update the service actions pipeline to resolve this error.`;
                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'open-prompt-editor',
                        focusCoordinate: this.resolvedServiceName,
                        prefilledPrompt: fixPrompt
                    });
                }
            },

            async saveService() {
                this.$emit('trigger-save');
            }
        }
    };

    window.AgiServiceEditor = AgiServiceEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['AgiServiceEditor'] = AgiServiceEditor;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('agi-service-editor', AgiServiceEditor);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();