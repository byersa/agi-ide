(function () {
    const AgiIntentDetail = {
        name: 'AgiIntentDetail',
        template: `
            <q-form @submit="saveIntent" class="q-gutter-xs q-pa-xs">
                <q-input 
                    v-model="formData.workEffortName" 
                    label="Title / Summary *" 
                    dense 
                    outlined 
                    :rules="[val => !!val || 'Title is required']"
                />
                <q-input 
                    v-model="formData.description" 
                    label="Detailed Description / Intent Specs" 
                    type="textarea" 
                    rows="3" 
                    dense 
                    outlined 
                />
                <q-input 
                    v-model="formData.targetMariaId" 
                    label="Canvas Element Target (#mariaId)" 
                    dense 
                    outlined 
                />
                <div class="row justify-end q-mt-xs q-gutter-x-xs">
                    <q-btn 
                        v-if="node?.isDraft"
                        label="Cancel Draft" 
                        color="grey-7" 
                        flat 
                        size="sm" 
                        @click="$emit('cancel-draft')" 
                    />
                    <q-btn 
                        type="submit" 
                        :label="node?.isDraft ? 'Create Intent' : 'Save Specification'" 
                        :icon="node?.isDraft ? 'add_task' : 'save'" 
                        color="secondary" 
                        size="sm" 
                        :loading="saving" 
                    />
                </div>
            </q-form>
        `,
        props: {
            node: { type: Object, required: true },
            selectedArtifact: { type: Object, default: null }
        },
        data() {
            return {
                saving: false,
                formData: {
                    workEffortName: '',
                    description: '',
                    targetMariaId: ''
                }
            };
        },
        watch: {
            node: {
                immediate: true,
                deep: true,
                handler(newNode) {
                    if (newNode) {
                        this.formData.workEffortName = newNode.workEffortName || '';
                        this.formData.description = newNode.description || '';
                        this.formData.targetMariaId = newNode.targetMariaId || '';
                    }
                }
            }
        },
        methods: {
            saveIntent() {
                if (!this.formData.workEffortName.trim()) return;
                this.saving = true;
                const vm = this;

                const isDraft = !!this.node.isDraft;
                const url = isDraft
                    ? '/rest/s1/agi-ide/blueprint/create-node'
                    : '/rest/s1/agi-ide/blueprint/create-node'; // Updates via same endpoint or update-node

                $.ajax({
                    type: 'POST',
                    url: url,
                    data: {
                        workEffortId: isDraft ? null : vm.node.workEffortId,
                        workEffortName: vm.formData.workEffortName,
                        description: vm.formData.description,
                        targetMariaId: vm.formData.targetMariaId,
                        agiArtifactId: vm.selectedArtifact ? vm.selectedArtifact.agiArtifactId : '',
                        sourceReferenceId: vm.selectedArtifact ? vm.selectedArtifact.artifactPath : '',
                        workEffortTypeEnumId: 'WetIntent'
                    },
                    dataType: 'json',
                    headers: { 'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "" },
                    success: function (data) {
                        vm.saving = false;
                        if (vm.$q) {
                            vm.$q.notify({ type: 'positive', message: 'Intent specification saved.' });
                        }
                        vm.$emit('intent-saved', data);
                    },
                    error: function (err) {
                        vm.saving = false;
                        console.error("Failed to save intent detail:", err);
                    }
                });
            }
        }
    };

    window.AgiIntentDetail = AgiIntentDetail;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-intent-detail'] = AgiIntentDetail;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('agi-intent-detail', AgiIntentDetail);
            window.moqui.webrootVueApp.component('AgiIntentDetail', AgiIntentDetail);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();