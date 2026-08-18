(function () {
    const AgiIntentDetail = {
        name: 'AgiIntentDetail',
        template: `
            <q-form @submit="saveIntent" class="q-gutter-xs q-pa-xs">
                <q-input 
                    v-model="formData.pagePath" 
                    label="Page Path / Title *" 
                    dense 
                    outlined 
                    :rules="[val => !!val || 'Page Path is required']"
                />
                <q-input 
                    v-model="formData.content" 
                    label="Markdown Content" 
                    type="textarea" 
                    rows="5" 
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
                        :label="node?.isDraft ? 'Create Node' : 'Save Specification'" 
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
                    wikiPageId: '',
                    wikiSpaceId: 'AGI_INTENT',
                    pagePath: '',
                    content: '',
                    parentWikiPageId: ''
                }
            };
        },
        watch: {
            node: {
                immediate: true,
                deep: true,
                handler(newNode) {
                    if (newNode) {
                        this.formData.wikiPageId = newNode.wikiPageId || newNode.id || '';
                        this.formData.wikiSpaceId = newNode.wikiSpaceId || 'AGI_INTENT';
                        this.formData.pagePath = newNode.pagePath || newNode.label || newNode.workEffortName || '';
                        this.formData.content = newNode.content || newNode.description || '';
                        this.formData.parentWikiPageId = newNode.parentWikiPageId || '';
                    }
                }
            }
        },
        methods: {
            saveIntent() {
                if (!this.formData.pagePath.trim()) return;
                this.saving = true;
                const vm = this;

                const params = {
                    wikiPageId: this.formData.wikiPageId || null,
                    wikiSpaceId: this.formData.wikiSpaceId || 'AGI_INTENT',
                    pagePath: this.formData.pagePath,
                    content: this.formData.content,
                    parentWikiPageId: this.formData.parentWikiPageId || null
                };

                $.ajax({
                    type: 'POST',
                    url: '/rest/s1/agi-ide/saveWikiNode',
                    data: params,
                    dataType: 'json',
                    headers: { 'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "" },
                    success: function (data) {
                        vm.saving = false;
                        if (data && data.wikiPageId) {
                            vm.formData.wikiPageId = data.wikiPageId;
                        }
                        if (vm.$q) {
                            vm.$q.notify({ type: 'positive', message: 'Wiki node saved.' });
                        }
                        vm.$emit('intent-saved', data);
                    },
                    error: function (err) {
                        vm.saving = false;
                        console.error("Failed to save wiki node:", err);
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