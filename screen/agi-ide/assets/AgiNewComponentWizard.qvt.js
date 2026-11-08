(function () {
    const AgiNewComponentWizard = {
        name: 'AgiNewComponentWizard',
        emits: ['close', 'component-created'],
        props: {
            open: { type: Boolean, default: false },
            initialComponentName: { type: String, default: '' }
        },
        template: `
            <q-dialog v-model="isOpen" persistent transition-show="scale" transition-hide="scale">
                <q-card style="width: 580px; max-width: 95vw;" class="bg-white rounded-borders">
                    <q-card-section class="bg-slate-900 text-white row items-center justify-between q-py-sm">
                        <div class="row items-center">
                            <q-icon name="auto_awesome" color="primary" size="sm" class="q-mr-xs" />
                            <div class="text-subtitle1 text-weight-bold">Create Component & Elicit Architecture</div>
                        </div>
                        <q-btn flat round dense icon="close" text-color="white" v-close-popup />
                    </q-card-section>

                    <q-form @submit="onCreateComponent" class="q-pa-md q-gutter-y-sm">
                        
                        <!-- Component Name & Preset -->
                        <div class="row q-col-gutter-sm">
                            <div class="col-12 col-md-6">
                                <q-input 
                                    v-model="form.componentName" 
                                    label="Component Name *" 
                                    hint="e.g. nursinghome (lowercase, hyphens)" 
                                    dense 
                                    outlined 
                                    autofocus
                                    :rules="[
                                        val => !!val || 'Component name is required',
                                        val => /^[a-z0-9-]+$/.test(val) || 'Use lowercase letters, numbers, and hyphens only'
                                    ]"
                                />
                            </div>
                            <div class="col-12 col-md-6">
                                <q-select
                                    v-model="form.preset"
                                    :options="presetOptions"
                                    emit-value
                                    map-options
                                    label="Base Preset"
                                    dense
                                    outlined
                                />
                            </div>
                        </div>

                        <!-- Narrative & Live Heuristic Elicitation -->
                        <div class="q-mt-sm">
                            <div class="row items-center justify-between q-mb-xs">
                                <span class="text-caption text-weight-bold text-grey-8">
                                    APPLICATION NARRATIVE & OPERATIONAL INTENT
                                </span>
                                <div class="row items-center text-caption" v-if="isAnalyzing">
                                    <q-spinner-dots size="16px" color="primary" class="q-mr-xs" />
                                    <span class="text-primary text-xs font-mono">Classifying archetype...</span>
                                </div>
                            </div>
                            <q-input 
                                v-model="form.narrative" 
                                label="What is this application supposed to do?" 
                                placeholder="Describe the operational job (e.g. Charge nurses run a daily morning standup huddle, log census adjustments, track vitals, and assign CNA shifts)..."
                                type="textarea" 
                                rows="3" 
                                dense 
                                outlined
                                @update:model-value="onNarrativeInput"
                            />
                        </div>

                        <!-- Detected App Archetypes (Clickable Badges) -->
                        <div class="q-mt-xs">
                            <div class="text-caption text-weight-bold text-grey-7 q-mb-xs">
                                DETECTED APP ARCHETYPE
                            </div>
                            <div class="row q-gutter-xs">
                                <q-btn 
                                    v-for="arch in archetypes" 
                                    :key="arch.id"
                                    flat 
                                    dense 
                                    no-caps 
                                    size="sm"
                                    :label="arch.name"
                                    :icon="arch.icon"
                                    :class="form.selectedArchetype === arch.id ? 'bg-primary text-white text-weight-bold' : 'bg-grey-2 text-grey-8'"
                                    class="q-px-sm rounded-borders text-xs"
                                    @click="selectArchetypeManually(arch.id)"
                                />
                            </div>
                        </div>

                        <!-- Archetype Invariants Card -->
                        <div v-if="activeArchetypeInfo" class="q-pa-sm rounded-borders bg-grey-1 border-light q-mt-xs text-caption">
                            <div class="row items-center q-mb-xs">
                                <q-icon :name="activeArchetypeInfo.icon" color="primary" size="14px" class="q-mr-xs" />
                                <span class="text-weight-bold text-grey-9">{{ activeArchetypeInfo.name }} Invariants</span>
                            </div>
                            <div class="text-xs text-grey-8 q-gutter-y-xs">
                                <div>• <strong>Mantle Entities:</strong> <code>{{ activeArchetypeInfo.entities.join(', ') }}</code></div>
                                <div>• <strong>Suggested Screens:</strong> <code>{{ activeArchetypeInfo.screens.join(', ') }}</code></div>
                                <div>• <strong>Compliance:</strong> {{ activeArchetypeInfo.compliance }}</div>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <q-card-actions align="right" class="q-px-none q-pt-md">
                            <q-btn flat label="Cancel" color="grey-7" v-close-popup />
                            <q-btn 
                                type="submit" 
                                label="Create Component" 
                                color="primary" 
                                icon="add_box" 
                                :loading="submitting" 
                                class="text-weight-bold"
                            />
                        </q-card-actions>
                    </q-form>
                </q-card>
            </q-dialog>
        `,
        data() {
            return {
                isOpen: false,
                submitting: false,
                isAnalyzing: false,
                debounceTimer: null,
                abortController: null,
                form: {
                    componentName: this.initialComponentName || '',
                    preset: 'mantle-domain',
                    narrative: '',
                    selectedArchetype: 'huddle-ops'
                },
                presetOptions: [
                    { label: 'Mantle Domain Extension (USL Domain)', value: 'mantle-domain' },
                    { label: 'Standalone Web App (REST & Webroot)', value: 'web-app' },
                    { label: 'Barebones Skeleton (component.xml only)', value: 'barebones' }
                ],
                archetypes: [
                    {
                        id: 'huddle-ops',
                        name: 'Shift / Huddle Operations',
                        icon: 'groups',
                        keywords: ['huddle', 'shift', 'standup', 'census', 'acuity', 'turnover', 'nurse', 'vitals', 'resident'],
                        entities: ['mantle.facility.Facility', 'mantle.party.Party', 'mantle.work.effort.WorkEffort'],
                        screens: ['DailyStandupHuddle', 'ResidentCensus', 'ShiftAssignment'],
                        compliance: 'HIPAA encrypt="true" on clinical vitals; audit logging enabled on shift turnover.'
                    },
                    {
                        id: 'clinical-registry',
                        name: 'Care Management & Registry',
                        icon: 'medical_services',
                        keywords: ['patient', 'care plan', 'clinical', 'diagnosis', 'treatment', 'medication', 'mar', 'chart'],
                        entities: ['mantle.party.Person', 'mantle.party.relationship.*', 'mantle.work.effort.WorkEffort'],
                        screens: ['ResidentRegistry', 'CarePlanDetail', 'MedicationLog'],
                        compliance: 'Strict HIPAA PHI encryption on all personal identifiers; full audit trail.'
                    },
                    {
                        id: 'facility-asset',
                        name: 'Asset & Facility Management',
                        icon: 'apartment',
                        keywords: ['facility', 'room', 'bed', 'equipment', 'maintenance', 'repair', 'asset', 'work order'],
                        entities: ['mantle.facility.Facility', 'mantle.product.asset.Asset', 'mantle.work.effort.WorkEffort'],
                        screens: ['FacilityFloorplan', 'RoomTurnover', 'MaintenanceWorkOrders'],
                        compliance: 'Standard asset lifecycle audit logging; role-based work order approval.'
                    },
                    {
                        id: 'service-case',
                        name: 'Service & Case Intake',
                        icon: 'assignment',
                        keywords: ['intake', 'case', 'ticket', 'request', 'complaint', 'incident', 'billing', 'workflow'],
                        entities: ['mantle.request.Request', 'mantle.party.Party', 'mantle.work.effort.WorkEffort'],
                        screens: ['IncidentIntakeWizard', 'ActiveCaseQueue', 'ResolutionReport'],
                        compliance: 'Confidentiality flags on incident notes; timestamp verification on closures.'
                    },
                    {
                        id: 'custom',
                        name: 'Custom Domain',
                        icon: 'tune',
                        keywords: [],
                        entities: ['mantle.party.Party'],
                        screens: ['MainOverview'],
                        compliance: 'Standard Mantle UDM data governance.'
                    }
                ],
                contextBus: null
            };
        },
        computed: {
            activeArchetypeInfo() {
                return this.archetypes.find(a => a.id === this.form.selectedArchetype) || this.archetypes[0];
            }
        },
        watch: {
            open: {
                immediate: true,
                handler(val) {
                    this.isOpen = !!val;
                    if (val && this.initialComponentName && !this.form.componentName) {
                        this.form.componentName = this.initialComponentName.trim().toLowerCase();
                    }
                }
            },
            initialComponentName: {
                immediate: true,
                handler(val) {
                    if (val && !this.form.componentName) {
                        this.form.componentName = val.trim().toLowerCase();
                    }
                }
            },
            isOpen(val) {
                if (!val) this.$emit('close');
            }
        },
        mounted() {
            const vm = this;
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = function (event) {
                if (event.data && event.data.event === 'open-new-component-wizard') {
                    vm.isOpen = true;
                    if (event.data.defaultName) {
                        vm.form.componentName = event.data.defaultName.toLowerCase();
                    }
                }
            };
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            if (this.abortController) this.abortController.abort();
        },
        methods: {
            resolveCsrfToken() {
                return window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || "";
            },

            // --- TIER 1: CLIENT-SIDE KEYWORD MATCHING (0ms) ---
            onNarrativeInput(val) {
                const text = (val || '').toLowerCase().trim();
                if (text.length < 8) return;

                let bestArchetype = null;
                let highestScore = 0;

                for (const arch of this.archetypes) {
                    if (arch.id === 'custom') continue;
                    let score = 0;
                    for (const kw of arch.keywords) {
                        if (text.includes(kw)) score += 1;
                    }
                    if (score > highestScore) {
                        highestScore = score;
                        bestArchetype = arch.id;
                    }
                }

                if (bestArchetype && highestScore >= 1 && this.form.selectedArchetype !== bestArchetype) {
                    this.form.selectedArchetype = bestArchetype;
                }

                // --- TIER 2: 600ms DEBOUNCED FETCH MICRO-CLASSIFICATION ---
                clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => {
                    this.fetchServerClassification(text);
                }, 600);
            },

            async fetchServerClassification(text) {
                if (text.length < 20) return;

                if (this.abortController) {
                    this.abortController.abort();
                }
                this.abortController = new AbortController();
                this.isAnalyzing = true;

                try {
                    const response = await fetch('/rest/s1/agi-ide/component/classify-intent', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'moquiSessionToken': this.resolveCsrfToken()
                        },
                        body: JSON.stringify({ narrative: text }),
                        signal: this.abortController.signal
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data && data.suggestedArchetype) {
                            this.form.selectedArchetype = data.suggestedArchetype;
                        }
                    }
                } catch (e) {
                    // Canceled/aborted fetches are expected when typing continues
                    if (e.name !== 'AbortError') {
                        console.warn('Archetype classification error:', e);
                    }
                } finally {
                    this.isAnalyzing = false;
                }
            },

            selectArchetypeManually(archId) {
                this.form.selectedArchetype = archId;
            },

            async onCreateComponent() {
                this.submitting = true;
                const createdCompName = (this.form.componentName || '').trim().toLowerCase();
                const arch = this.activeArchetypeInfo;

                const payload = {
                    componentName: createdCompName,
                    preset: this.form.preset,
                    description: this.form.narrative,
                    archetypeId: arch.id,
                    mantleEntities: arch.entities,
                    initialScreens: arch.screens,
                    complianceRules: arch.compliance
                };

                try {
                    const response = await fetch('/rest/s1/agi-ide/component/create', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'moquiSessionToken': this.resolveCsrfToken()
                        },
                        body: JSON.stringify(payload)
                    });

                    const data = await response.json();

                    if (!response.ok) {
                        const errorMsg = data?.errors || data?.message || `Failed to create component (${response.status})`;
                        throw new Error(errorMsg);
                    }

                    this.submitting = false;
                    this.isOpen = false;

                    if (this.$q) {
                        this.$q.notify({
                            type: 'positive',
                            message: `Component "${createdCompName}" initialized with ${arch.name} archetype!`,
                            actions: [
                                {
                                    label: 'Open Blueprint',
                                    color: 'white',
                                    handler: () => {
                                        if (this.contextBus) {
                                            this.contextBus.postMessage({
                                                event: 'open-blueprint-editor',
                                                artifactLocation: `component://${createdCompName}/screen/${createdCompName}.xml`
                                            });
                                        }
                                    }
                                }
                            ]
                        });
                    }

                    this.$emit('component-created', {
                        componentName: createdCompName,
                        preset: this.form.preset,
                        archetype: arch,
                        narrative: this.form.narrative,
                        data: data
                    });

                    if (this.contextBus) {
                        this.contextBus.postMessage({ event: 'refresh-artifact-discovery' });
                    }
                    this.resetForm();

                } catch (err) {
                    this.submitting = false;
                    if (this.$q) {
                        this.$q.notify({
                            type: 'negative',
                            message: err.message || 'Network error creating component.'
                        });
                    }
                }
            },

            resetForm() {
                this.form.componentName = '';
                this.form.preset = 'mantle-domain';
                this.form.narrative = '';
                this.form.selectedArchetype = 'huddle-ops';
            }
        }
    };

    window.AgiNewComponentWizard = AgiNewComponentWizard;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-new-component-wizard'] = AgiNewComponentWizard;

    const registerWizard = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('agi-new-component-wizard', AgiNewComponentWizard);
        } else {
            setTimeout(registerWizard, 50);
        }
    };
    registerWizard();
})();