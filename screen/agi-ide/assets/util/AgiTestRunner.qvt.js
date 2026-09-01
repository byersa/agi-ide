(function () {
    const AgiTestRunner = {
        name: 'AgiTestRunner',
        template: `
            <q-dialog v-model="isOpen" position="top">
                <q-card class="agi-test-runner-card bg-slate-900 text-white shadow-24 q-mt-md column no-wrap" style="width: 900px; max-width: 95vw; height: 80vh;">
                    
                    <!-- Header -->
                    <q-card-section class="q-pa-sm bg-slate-950 row items-center justify-between" style="border-bottom: 1px solid #334155;">
                        <div class="row items-center q-gutter-x-sm">
                            <q-icon name="science" color="cyan-4" size="sm" />
                            <span class="text-subtitle2 text-weight-bold font-mono">AGI IN-APP TEST RUNNER</span>
                        </div>
                        <div class="row items-center q-gutter-x-xs">
                            <q-btn flat dense size="xs" color="cyan-4" icon="refresh" label="Rescan Suites" @click="fetchSuites" />
                            <q-btn flat round dense icon="close" text-color="white" v-close-popup />
                        </div>
                    </q-card-section>

                    <!-- Main Body: Split View (Suites List vs Step Execution Logs) -->
                    <div class="col row no-wrap overflow-hidden bg-slate-900">
                        
                        <!-- Left Pane: Available Test Suites -->
                        <div class="col-4 column no-wrap bg-slate-950 q-pa-sm" style="border-right: 1px solid #334155; overflow-y: auto;">
                            <div class="text-caption text-weight-bold text-grey-4 font-mono q-mb-xs">DECLARATIVE TEST SUITES</div>
                            <q-list dense separator class="bg-black rounded-borders">
                                <q-item 
                                    v-for="suite in testSuites" 
                                    :key="suite.fileName" 
                                    clickable 
                                    v-ripple
                                    @click="selectSuite(suite)"
                                    :class="{ 'bg-cyan-9 text-white': selectedSuite && selectedSuite.fileName === suite.fileName }"
                                    class="q-pa-xs rounded-borders q-my-xs"
                                >
                                    <q-item-section avatar min-width="24px">
                                        <q-icon name="playlist_play" color="cyan-4" size="xs" />
                                    </q-item-section>
                                    <q-item-section>
                                        <q-item-label class="font-mono text-caption text-weight-bold">{{ suite.suiteName }}</q-item-label>
                                        <q-item-label caption class="text-grey-5" style="font-size: 10px;">{{ suite.stepCount }} Steps | {{ suite.fileName }}</q-item-label>
                                    </q-item-section>
                                </q-item>
                                <q-item v-if="testSuites.length === 0" class="q-pa-xs">
                                    <q-item-section class="text-grey-5 italic text-center font-mono" style="font-size: 10px;">
                                        No test manifests found under test/manifest/
                                    </q-item-section>
                                </q-item>
                            </q-list>

                            <div class="q-mt-md" v-if="selectedSuite">
                                <q-btn 
                                    color="positive" 
                                    icon="play_arrow" 
                                    label="Run Suite" 
                                    no-caps 
                                    class="full-width font-mono text-weight-bold" 
                                    :loading="isRunning"
                                    @click="executeSelectedSuite"
                                />
                            </div>
                        </div>

                        <!-- Right Pane: Execution Logs & Step Results -->
                        <div class="col-8 column no-wrap bg-slate-900 q-pa-sm justify-between">
                            <div class="row items-center justify-between q-mb-xs">
                                <div class="row items-center q-gutter-x-xs text-caption font-mono text-weight-bold text-cyan-4">
                                    <q-icon name="terminal" size="xs" />
                                    <span>TEST EXECUTION OUTPUT &amp; ASSERTIONS</span>
                                </div>
                                <q-badge :color="testStatusColor">{{ testStatusText }}</q-badge>
                            </div>

                            <!-- Terminal Console Log Box -->
                            <div class="col full-width font-mono text-caption q-pa-sm rounded-borders bg-black overflow-y-auto" style="border: 1px solid #334155; font-size: 11px; line-height: 16px;">
                                <div v-for="(log, idx) in executionLogs" :key="idx" :class="log.type === 'error' ? 'text-negative' : (log.type === 'success' ? 'text-positive' : 'text-grey-3')">
                                    <span>[{{ log.timestamp }}]</span> {{ log.message }}
                                </div>
                                <div v-if="executionLogs.length === 0" class="text-grey-6 italic">
                                    Select a test suite and click 'Run Suite' to begin execution...
                                </div>
                            </div>

                            <!-- Footer Status Bar -->
                            <div class="q-mt-xs q-pa-xs bg-slate-950 rounded-borders row items-center justify-between text-caption font-mono text-grey-4" style="border: 1px solid #1e293b;">
                                <span>Steps Passed: {{ passedStepsCount }} / {{ totalStepsCount }}</span>
                                <q-btn flat dense size="xs" color="grey-4" icon="delete" label="Clear Logs" @click="executionLogs = []" />
                            </div>
                        </div>

                    </div>

                </q-card>
            </q-dialog>
        `,
        data() {
            return {
                isOpen: false,
                testSuites: [],
                selectedSuite: null,
                executionLogs: [],
                isRunning: false,
                passedStepsCount: 0,
                totalStepsCount: 0,
                testStatusText: 'IDLE',
                testStatusColor: 'grey-8',
                contextBus: null
            };
        },
        mounted() {
            const vm = this;
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = function (event) {
                if (event.data && event.data.event === 'open-test-runner') {
                    vm.isOpen = true;
                    vm.fetchSuites();
                }
            };
            this.fetchSuites();
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },
        methods: {
            resolveCsrfToken() {
                return window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || (window.opener && window.opener.moqui && window.opener.moqui.moquiSessionToken)
                    || (document.querySelector('meta[name="moqui-session-token"]')?.getAttribute('content'))
                    || "";
            },

            async fetchSuites() {
                const vm = this;
                const headers = { 'moquiSessionToken': this.resolveCsrfToken() };
                try {
                    const response = await axios.get('/rest/s1/agi-ide/getTestManifests', { headers });
                    vm.testSuites = response.data?.testSuites || [];
                    if (vm.testSuites.length > 0 && !vm.selectedSuite) {
                        vm.selectedSuite = vm.testSuites[0];
                    }
                } catch (err) {
                    console.warn("Could not load test manifests:", err);
                }
            },

            selectSuite(suite) {
                this.selectedSuite = suite;
            },

            logMessage(msg, type = 'info') {
                this.executionLogs.push({
                    timestamp: new Date().toLocaleTimeString(),
                    message: msg,
                    type: type
                });
            },

            async executeSelectedSuite() {
                if (!this.selectedSuite || !this.selectedSuite.manifest) return;

                const manifest = this.selectedSuite.manifest;
                const steps = manifest.steps || [];

                this.isRunning = true;
                this.executionLogs = [];
                this.passedStepsCount = 0;
                this.totalStepsCount = steps.length;
                this.testStatusText = 'RUNNING';
                this.testStatusColor = 'warning';

                this.logMessage(`🚀 Starting Test Suite: ${manifest.suiteName}`);
                this.logMessage(`📋 Description: ${manifest.description}`);

                const headers = {
                    'moquiSessionToken': this.resolveCsrfToken(),
                    'Content-Type': 'application/json'
                };

                for (let i = 0; i < steps.length; i++) {
                    const step = steps[i];
                    this.logMessage(`▶️ [Step ${i + 1}/${steps.length}] ${step.title} (${step.stepId})...`);

                    try {
                        let stepSuccess = true;
                        let responseData = null;

                        if (step.action === 'INVOKE_TOOL' || step.action === 'INVOKE_SERVICE') {
                            const resp = await axios.post('/rest/s1/agi-ide/mcp/runService', {
                                serviceName: step.serviceName,
                                parameters: step.parameters || {}
                            }, { headers });

                            if (resp.data?.status === 'ERROR') {
                                stepSuccess = false;
                                this.logMessage(`❌ Service error in ${step.serviceName}: ${resp.data.errorMessage}`, 'error');
                            }
                            responseData = resp.data?.results || resp.data || {};
                        } else if (step.action === 'MUTATE_BUFFER') {
                            const storeResp = await axios.post('/rest/s1/agi-ide/storeWorkspaceBuffer', {
                                artifactUri: step.artifactUri,
                                metaJsonBuffer: JSON.stringify(step.astMutation)
                            }, { headers });
                            responseData = storeResp.data?.results || storeResp.data || {};
                        } else if (step.action === 'SAVE_BUFFER') {
                            const bufResp = await axios.get('/rest/s1/agi-ide/getWorkspaceBuffer', {
                                params: { artifactUri: step.artifactUri },
                                headers: headers
                            });
                            const metaBuffer = bufResp.data?.metaJsonBuffer;
                            const saveResp = await axios.post('/rest/s1/agi-ide/saveScreenXml', {
                                artifactUri: step.artifactUri,
                                metaJsonBuffer: typeof metaBuffer === 'string' ? metaBuffer : JSON.stringify(metaBuffer)
                            }, { headers });
                            responseData = saveResp.data?.results || saveResp.data || {};
                        }

                        if (step.assertions) {
                            const resolvedUri = step.assertions.targetUri
                                || step.artifactUri
                                || responseData?.artifactUri
                                || step.parameters?.artifactUri
                                || step.parameters?.targetArtifactUri
                                || step.parameters?.artifactLocation
                                || (step.parameters?.screenPath ? `component://${step.parameters.targetComponent || 'nursinghome'}/screen/${step.parameters.targetComponent || 'nursinghome'}/${step.parameters.screenPath.replace(/^\//, '')}.xml` : null);

                            const assertResp = await axios.get('/rest/s1/agi-ide/assertArtifactState', {
                                params: {
                                    artifactUri: resolvedUri,
                                    expectFileExists: step.assertions.expectTargetFileExists !== undefined ? step.assertions.expectTargetFileExists : step.assertions.expectFileExists,
                                    expectBufferExists: step.assertions.expectTargetBufferExists !== undefined ? step.assertions.expectTargetBufferExists : step.assertions.expectBufferExists,
                                    expectAgiArtifactExists: step.assertions.expectTargetAgiArtifactExists !== undefined ? step.assertions.expectTargetAgiArtifactExists : step.assertions.expectAgiArtifactExists,
                                    expectedStatus: step.assertions.expectedStatus
                                },
                                headers: headers
                            });

                            if (assertResp.data?.passed === false) {
                                stepSuccess = false;
                                (assertResp.data.failures || []).forEach(f => this.logMessage(`❌ Assertion Failure: ${f}`, 'error'));
                            }
                        }

                        if (stepSuccess) {
                            this.passedStepsCount++;
                            this.logMessage(`✅ Step ${step.stepId} PASSED.`, 'success');
                        } else {
                            this.logMessage(`❌ Step ${step.stepId} FAILED assertions.`, 'error');
                            break;
                        }

                    } catch (stepErr) {
                        this.logMessage(`❌ Exception in step ${step.stepId}: ${stepErr.response?.data?.errors || stepErr.message}`, 'error');
                        break;
                    }
                }

                this.isRunning = false;
                if (this.passedStepsCount === this.totalStepsCount) {
                    this.testStatusText = 'PASSED';
                    this.testStatusColor = 'positive';
                    this.logMessage(`🎉 All ${this.totalStepsCount} test steps passed successfully!`, 'success');
                } else {
                    this.testStatusText = 'FAILED';
                    this.testStatusColor = 'negative';
                    this.logMessage(`⚠️ Test suite completed with failures (${this.passedStepsCount}/${this.totalStepsCount} passed).`, 'error');
                }
            }
        }
    };

    window.AgiTestRunner = AgiTestRunner;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-test-runner'] = AgiTestRunner;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('agi-test-runner', AgiTestRunner);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();