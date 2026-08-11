(function () {
    const AgiComponentEditor = {
        name: 'AgiComponentEditor',
        template: `
            <div class="component-editor-container fit column no-wrap q-pa-sm" style="height: 100%;">
                
                <!-- Toolbar Header -->
                <div class="q-mb-sm row items-center justify-between">
                    <div class="row items-center q-gutter-x-sm">
                        <q-icon name="javascript" color="warning" size="xs" />
                        <span class="text-subtitle2 text-grey-8">Companion QVT JavaScript Editor</span>
                        
                        <q-btn 
                            v-if="qvtAssetExists"
                            icon="save" 
                            label="Save Script" 
                            dense 
                            flat 
                            color="primary"
                            @click="saveQvtScript" 
                        />
                        <q-btn 
                            v-else
                            icon="add_code" 
                            label="Scaffold .qvt.js Companion" 
                            dense 
                            flat 
                            color="warning"
                            @click="scaffoldQvtAsset" 
                        />
                    </div>

                    <span class="text-caption font-mono text-grey-6">{{ targetQvtUri }}</span>
                </div>

                <!-- Text Area JavaScript Code Editor Window -->
                <div class="col col-stretch relative-position">
                    <textarea 
                        v-if="qvtAssetExists"
                        ref="codeTextArea"
                        class="xml-textarea fit font-mono text-caption"
                        style="background-color: #020617; color: #f8fafc; border: 1px solid #334155; padding: 8px;"
                        v-model="rawJsSource"
                        placeholder="// Write Vue/QVT Component JavaScript here..."
                    ></textarea>
                    
                    <div v-else class="fit column justify-center items-center bg-slate-950 text-grey-5 rounded-borders text-center q-pa-md">
                        <q-icon name="code_off" size="48px" color="warning" class="q-mb-sm" />
                        <div class="text-subtitle1 text-weight-bold">No Companion QVT Script Attached</div>
                        <p class="text-caption text-grey-4 max-w-sm q-mt-xs">
                            This screen does not have a companion <code>{{ getQvtFileName() }}</code> asset yet.<br/>
                            Click "Scaffold .qvt.js Companion" above or run <code>/attach-qvt-asset</code> in the AI Prompt Editor.
                        </p>
                    </div>
                </div>

            </div>
        `,
        props: {
            screenPath: {
                type: String,
                required: true
            }
        },
        data() {
            return {
                rawJsSource: '',
                qvtAssetExists: false,
                targetQvtUri: '',
                contextBus: null
            };
        },
        watch: {
            screenPath: {
                handler(newPath) {
                    if (newPath) this.resolveAndFetchQvtScript(newPath);
                },
                immediate: true
            }
        },
        mounted() {
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = (msg) => {
                if (msg.data && msg.data.event === 'reload-qvt-script') {
                    this.resolveAndFetchQvtScript(this.screenPath);
                }
            };
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },
        methods: {
            getQvtFileName() {
                if (!this.screenPath) return '';
                const lastSlash = this.screenPath.lastIndexOf('/');
                const name = this.screenPath.substring(lastSlash + 1).replace('.xml', '').replace('.qvt.js', '');
                return `${name}.qvt.js`;
            },

            resolveAndFetchQvtScript(path) {
                var vm = this;
                let qvtUri = path;

                // If path is ManagePatients.xml -> derive component://.../assets/ManagePatients.qvt.js
                if (path.endsWith('.xml')) {
                    const lastSlash = path.lastIndexOf('/');
                    const dir = path.substring(0, lastSlash);
                    const name = path.substring(lastSlash + 1).replace('.xml', '');
                    qvtUri = `${dir}/assets/${name}.qvt.js`;
                }

                vm.targetQvtUri = qvtUri;
                const headers = { 'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "" };

                // Fetch raw script text from server
                axios.get('/rest/s1/agi-ide/getRawXml', {
                    params: { artifactUri: qvtUri },
                    headers: headers
                }).then(response => {
                    // Extract raw text from the REST out-parameter payload
                    const content = response.data?.rawXmlContent || response.data || '';
                    if (content && typeof content === 'string' && !content.includes('404')) {
                        vm.rawJsSource = content;
                        vm.qvtAssetExists = true;
                    } else {
                        vm.qvtAssetExists = false;
                        vm.rawJsSource = '';
                    }
                }).catch(() => {
                    vm.qvtAssetExists = false;
                    vm.rawJsSource = '';
                });
            },

            async scaffoldQvtAsset() {
                var vm = this;
                const headers = {
                    'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "",
                    'Content-Type': 'application/json'
                };

                try {
                    await axios.post('/rest/s1/agi-ai/mcp/run', {
                        serviceName: 'org.moqui.ai.mcp.MCPScreenServices.attach#QvtAsset',
                        parameters: { screenPath: vm.screenPath, targetComponent: 'nursinghome' }
                    }, { headers });

                    if (vm.$q) vm.$q.notify({ type: 'positive', message: 'Scaffolded companion QVT asset!' });
                    vm.resolveAndFetchQvtScript(vm.screenPath);
                } catch (err) {
                    if (vm.$q) vm.$q.notify({ type: 'negative', message: 'Failed to scaffold QVT asset.' });
                }
            },

            async saveQvtScript() {
                var vm = this;
                const headers = {
                    'moquiSessionToken': window.AGI_SERVER_CSRF_TOKEN || "",
                    'Content-Type': 'application/json'
                };

                try {
                    await axios.post('/rest/s1/agi-ai/saveScreenXml', {
                        artifactUri: vm.targetQvtUri,
                        rawXmlText: vm.rawJsSource
                    }, { headers });

                    if (vm.$q) vm.$q.notify({ type: 'positive', message: 'Saved QVT JavaScript source to disk!' });
                } catch (err) {
                    if (vm.$q) vm.$q.notify({ type: 'negative', message: 'Failed to save QVT script.' });
                }
            }
        }
    };

    window.AgiComponentEditor = AgiComponentEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-component-editor'] = AgiComponentEditor;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('agi-component-editor', AgiComponentEditor);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();