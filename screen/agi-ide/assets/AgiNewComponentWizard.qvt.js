(function () {
    const AgiNewComponentWizard = {
        name: 'AgiNewComponentWizard',
        template: `
            <q-dialog v-model="isOpen" persistent transition-show="scale" transition-hide="scale">
                <q-card style="width: 520px; max-width: 90vw;" class="bg-white rounded-borders">
                    <q-card-section class="bg-slate-900 text-white row items-center justify-between q-py-sm">
                        <div class="row items-center">
                            <q-icon name="extension" color="primary" size="sm" class="q-mr-xs" />
                            <div class="text-subtitle1 text-weight-bold">Create New Moqui Component</div>
                        </div>
                        <q-btn flat round dense icon="close" text-color="white" v-close-popup />
                    </q-card-section>

                    <q-form @submit="onCreateComponent" class="q-pa-md q-gutter-y-sm">
                        <!-- Component Name Field -->
                        <q-input 
                            v-model="form.componentName" 
                            label="Component Name *" 
                            hint="e.g. nursinghome (lowercase, hyphens allowed)" 
                            dense 
                            outlined 
                            autofocus
                            :rules="[
                                val => !!val || 'Component name is required',
                                val => /^[a-z0-9-]+$/.test(val) || 'Use lowercase letters, numbers, and hyphens only'
                            ]"
                        />

                        <!-- Preset Architecture Selection -->
                        <div class="text-caption text-weight-bold text-grey-8 q-mt-sm">COMPONENT PRESET / ARCHITECTURE</div>
                        <q-option-group
                            v-model="form.preset"
                            :options="presetOptions"
                            color="primary"
                            type="radio"
                            dense
                        />

                        <!-- Optional Description -->
                        <q-input 
                            v-model="form.description" 
                            label="App Description / Intent Summary" 
                            type="textarea" 
                            rows="2" 
                            dense 
                            outlined 
                        />

                        <q-card-actions align="right" class="q-px-none q-pt-md">
                            <q-btn flat label="Cancel" color="grey-7" v-close-popup />
                            <q-btn 
                                type="submit" 
                                label="Create Component" 
                                color="primary" 
                                icon="add_box" 
                                :loading="submitting" 
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
                form: {
                    componentName: '',
                    preset: 'mantle-domain',
                    description: ''
                },
                presetOptions: [
                    { label: 'Mantle Domain Extension (Nursing Home / USL Domain)', value: 'mantle-domain' },
                    { label: 'Standalone Web App (Custom REST & Webroot)', value: 'web-app' },
                    { label: 'Barebones Skeleton (component.xml only)', value: 'barebones' }
                ],
                contextBus: null
            };
        },
        mounted() {
            var vm = this;
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
        },
        methods: {
            onCreateComponent() {
                var vm = this;
                vm.submitting = true;

                $.ajax({
                    type: 'POST',
                    url: '/rest/s1/agi-ide/component/create',
                    data: {
                        componentName: vm.form.componentName,
                        preset: vm.form.preset,
                        description: vm.form.description
                    },
                    dataType: 'json',
                    headers: { 'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "" },
                    success: function (data) {
                        vm.submitting = false;
                        vm.isOpen = false;

                        if (vm.$q) {
                            vm.$q.notify({
                                type: 'positive',
                                message: 'Component "' + vm.form.componentName + '" initialized successfully!',
                                actions: [
                                    {
                                        label: 'Open Blueprint',
                                        color: 'white',
                                        handler: () => {
                                            vm.contextBus.postMessage({
                                                event: 'open-blueprint-editor',
                                                artifactLocation: 'component://' + vm.form.componentName + '/screen/' + vm.form.componentName + '.xml'
                                            });
                                        }
                                    }
                                ]
                            });
                        }

                        // Broadcast workspace refresh so discovery list updates immediately
                        vm.contextBus.postMessage({ event: 'refresh-artifact-discovery' });
                        vm.resetForm();
                    },
                    error: function (err) {
                        vm.submitting = false;
                        if (vm.$q) {
                            vm.$q.notify({ type: 'negative', message: 'Failed to create component.' });
                        }
                    }
                });
            },

            resetForm() {
                this.form.componentName = '';
                this.form.preset = 'mantle-domain';
                this.form.description = '';
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