// runtime/component/agi-ide/screen/agi-ide/assets/IdeWorkspaceComponent.qvt.js
(function () {
    const componentDef = {
        name: 'IdeWorkspaceComponent',

        data() {
            return {
                showCommandPalette: false,
                fields: {
                    targetComponent: 'aitree',
                    selectedArtifact: ''
                },
                backpackArtifacts: {
                    entities: [],
                    services: [],
                    screens: []
                },
                aiTreeStore: {
                    chatInput: '',
                    activeBlueprintJson: null,
                    isArchitectMode: false
                }
            }
        },

        mounted() {
            console.info("🎨 [AGI-IDE] Base Workspace Component mounted into view context.");
            this.fetchAvailableApps();
            this.attachWebSocketListeners();
        },

        methods: {
            async fetchAvailableApps() {
                try {
                    const token = this.moquiSessionToken || document.getElementById("confMoquiSessionToken")?.value;
                    const response = await fetch('/rest/s1/moquiai/AvailableApps', {
                        method: 'GET',
                        headers: { 'Accept': 'application/json', 'X-CSRF-Token': token }
                    });
                    const data = await response.json();
                    this.aiTreeStore.availableApps = data.apps || [];
                } catch (e) {
                    console.warn("⚠️ [AGI-IDE] Failed to fetch available apps list:", e);
                }
            },

            sendWorkspaceMessage() {
                const text = this.aiTreeStore.chatInput;
                if (!text || !text.trim()) return;

                const streamContainer = document.getElementById('ide-chat-stream');
                if (streamContainer) {
                    streamContainer.innerHTML += `<div class="q-mb-sm text-right"><span class="bg-indigo-1 q-pa-sm rounded-borders inline-block text-body2 text-indigo-10">${text}</span></div>`;
                }

                if (window.webmcp && window.webmcp.readyState === WebSocket.OPEN) {
                    window.webmcp.send(JSON.stringify({
                        type: 'userMessage',
                        componentId: 'agi-ide',
                        channel: window.location.pathname,
                        text: text,
                        targetComponent: this.fields.targetComponent,
                        artifactPath: this.fields.selectedArtifact
                    }));
                }
                this.aiTreeStore.chatInput = '';
            },

            selectBackpackArtifact(val) {
                this.fields.selectedArtifact = val;
                this.handleArtifactSelection(this.fields.targetComponent, val);
            },

            handleArtifactSelection(comp, artPath) {
                if (!artPath) return;
                $.ajax({
                    url: '/apps/agiide/IdeWorkspace/loadArtifactJson',
                    data: { targetComponent: comp, artifactPath: artPath },
                    type: 'GET',
                    success: (data) => { if (data) this.aiTreeStore.activeBlueprintJson = data; }
                });
            },

            attachWebSocketListeners() {
                const vm = this;
                function bindSocket(socket) {
                    if (!socket || socket._agiAttached) return;
                    socket._agiAttached = true;
                    socket.addEventListener('message', function (event) {
                        try {
                            var data = JSON.parse(event.data);
                            if (data && data.type === 'visualFrame') {
                                var payload = data.payload || data.result || data.data;
                                if (payload) vm.aiTreeStore.activeBlueprintJson = payload;
                            }
                        } catch (e) { }
                    });
                }
                if (window.webmcp && window.webmcp.status === 'connected' && window.webmcp.socket) {
                    bindSocket(window.webmcp.socket);
                }
                window.addEventListener('webmcp-status', function (e) {
                    if (e.detail && e.detail.status === 'connected' && window.webmcp?.socket) {
                        bindSocket(window.webmcp.socket);
                    }
                });
            }
        },

        template: `
            <div id="agi-ide-workspace-root" class="q-pa-sm">
                <div class="row q-col-gutter-md">
                    <div class="col-12 col-md-3">
                        <q-card flat bordered style="height: calc(100vh - 200px);" class="column justify-between bg-grey-1 q-pa-sm">
                            <div class="column full-height">
                                <div class="q-mb-md">
                                    <m-drop-down name="targetComponent" label="Active Component Scope" 
                                                 options-url="/apps/agiide/IdeWorkspace/getAvailableComponents" 
                                                 :allow-empty="false" :options-load-init="true"
                                                 v-model="fields.targetComponent"></m-drop-down>
                                </div>
                                <div class="col-grow overflow-auto">
                                    <div class="text-caption text-weight-bold text-grey-7 q-mb-xs">WORKSPACE BACKPACK</div>
                                    <q-list dense class="bg-white rounded-borders border-grey-4 q-pa-xs">
                                        <q-item-label header class="text-weight-medium text-grey-8 text-overline q-pt-sm q-pb-none" style="font-size: 0.7rem;">Entities</q-item-label>
                                        <q-item clickable v-for="item in (backpackArtifacts.entities || [])" :key="item.value" @click="selectBackpackArtifact(item.value)">
                                            <q-item-section avatar><q-icon name="dns" size="xs" color="blue-8"/></q-item-section>
                                            <q-item-section class="text-caption text-grey-9 ellipsis">{{ item.label }}</q-item-section>
                                        </q-item>
                                    </q-list>
                                </div>
                            </div>
                        </q-card>
                    </div>

                    <div class="col-12 col-md-9">
                        <div class="row q-col-gutter-md">
                            <div class="col-12 col-md-4">
                                <q-card flat bordered style="height: calc(100vh - 200px);" class="column justify-between bg-white">
                                    <q-card-section class="bg-indigo-9 text-white text-subtitle2 q-py-xs">
                                        <div><q-icon name="psychology" class="q-mr-xs"/> AGI Kernel Control Plane</div>
                                    </q-card-section>
                                    <q-card-section class="col-grow overflow-auto" id="ide-chat-stream">
                                        <div class="text-caption text-grey-6 text-italic text-center q-mt-md">Select a component to begin visualizing.</div>
                                    </q-card-section>
                                    <q-separator/>
                                    <q-card-section class="q-pa-sm">
                                        <q-input dense outlined v-model="aiTreeStore.chatInput" placeholder="Command AGI Kernel..." @keydown.enter.prevent="sendWorkspaceMessage">
                                            <template v-slot:append><q-btn round flat icon="send" color="indigo" @click="sendWorkspaceMessage" /></template>
                                        </q-input>
                                    </q-card-section>
                                </q-card>
                            </div>
                            <div class="col-12 col-md-8">
                                <m-architect-view-port :screen-data="aiTreeStore.activeBlueprintJson" :spec-path="fields.selectedArtifact" />
                            </div>
                        </div>
                    </div>
                </div>

                <dialog id="CommandPalette" style="width: 600px; max-width: 90vw; border-radius: 12px; border: none; box-shadow: 0 12px 40px rgba(0,0,0,0.15); padding: 0; background: white;">
                    <div class="bg-indigo-9 text-white q-pa-md flex justify-between items-center">
                        <div class="text-subtitle1 flex items-center"><q-icon name="psychology" class="q-mr-sm" size="sm"/> AGI Command Palette</div>
                        <q-btn flat round dense icon="close" color="white" onclick="document.getElementById('CommandPalette').close()"/>
                    </div>
                    <div class="bg-grey-1 q-pa-md">
                        <div class="q-mb-md">
                            <m-drop-down name="selectedArtifact" label="Search and Select Artifact" 
                                         options-url="/apps/agiide/IdeWorkspace/getArtifactOptions" 
                                         :depends-on="{targetComponent: fields.targetComponent}"
                                         :allow-empty="true" v-model="fields.selectedArtifact" />
                        </div>
                        <div class="q-pa-xs">
                            <q-input dense outlined v-model="aiTreeStore.chatInput" placeholder="Command AGI..." @keydown.enter.prevent="sendWorkspaceMessage" />
                        </div>
                    </div>
                </dialog>
            </div>
        `
    };

    // Formally expose the reference definition to the window layout chain
    window.IdeWorkspaceComponent = componentDef;
})();