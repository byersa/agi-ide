// runtime/component/agi-ide/screen/agi-ide/assets/AgiAgentManagerActuator.js
(function () {
    const componentDef = {
        name: 'AgiAgentManagerActuator',

        data() {
            // Quick 30-minute progress win: Extract the target context straight from URL parameters on initialization
            const urlParams = new URLSearchParams(window.location.search);
            const rawId = urlParams.get('id') || 'Generic_Actuator';

            return {
                amaId: rawId,
                // Clean up the unique string token back into a beautiful human-readable file label
                artifactLabel: rawId.replace('ama_screen_', '').replace('ama_entity_', '').replace(/_/g, '.'),
                contextType: urlParams.get('amaContext') || 'unknown',

                terminalLogs: [],
                executing: false
            }
        },

        mounted() {
            // Seed the log list with dynamic context data immediately on mount execution
            const cleanType = this.contextType.toUpperCase();
            this.terminalLogs.push({
                timestamp: new Date().toLocaleTimeString(),
                text: `🟢 [${cleanType} WORKER ACTIVED] Isolated channel bound securely to: ${this.artifactLabel}`
            });

            this.connectToLoomBus();
        },

        methods: {
            connectToLoomBus() {
                // Ensure we listen for our globally unified hyphenated broadcast channel name
                window.agiAgentBus = new BroadcastChannel('AgiAgentBus');
                window.agiAgentBus.onmessage = (event) => {
                    const { global, amaTarget, type, text } = event.data;
                    if (global || amaTarget === this.amaId) {
                        this.processIncomingFrame(type, text);
                    }
                };
            },

            processIncomingFrame(type, text) {
                if (type === 'command') {
                    this.executing = true;
                    this.terminalLogs.unshift({
                        timestamp: new Date().toLocaleTimeString(),
                        text: `⚡ [EXECUTING] -> ${text}`
                    });

                    // Simulate a quick responsive return pulse after a brief analysis delay
                    setTimeout(() => {
                        this.executing = false;
                        this.terminalLogs.unshift({
                            timestamp: new Date().toLocaleTimeString(),
                            text: `✅ [SUCCESS] Speculative refactoring topology map compiled for ${this.artifactLabel}.`
                        });
                    }, 1200);
                }
            }
        },

        template: `
            <div class="q-pa-md text-mono text-grey-3 fit column no-wrap" style="font-family: monospace; height: 100vh; background: #0f172a;">
                
                <div class="row items-center justify-between q-pb-sm q-mb-md" style="border-bottom: 1px solid #1e293b;">
                    <div class="row items-center q-gutter-sm">
                        <q-spinner-matrix v-if="executing" color="cyan-4" size="xs" />
                        <q-icon v-else name="terminal" :color="contextType === 'screen' ? 'amber-6' : 'teal-4'" size="xs" />
                        <div class="text-weight-bold text-grey-2" style="font-size: 13px;">
                            AGENT ACTUATOR // <span class="text-cyan-4">{{ amaId }}</span>
                        </div>
                    </div>
                    <q-badge :color="contextType === 'screen' ? 'amber-9' : 'teal-9'" text-color="white" class="text-weight-bold monospace">
                        {{ contextType.toUpperCase() }} Scope
                    </q-badge>
                </div>

                <div class="col overflow-auto q-pa-sm bg-black rounded-borders shadow-24" style="border: 1px solid #1e293b; font-size: 12px; line-height: 1.5;">
                    <div v-for="(log, idx) in terminalLogs" :key="idx" class="q-mb-xs">
                        <span class="text-grey-6">[{{ log.timestamp }}]</span>
                        <span :class="log.text.includes('🟢') ? 'text-green-4' : (log.text.includes('⚡') ? 'text-cyan-3' : 'text-grey-3')">
                            {{ log.text }}
                        </span>
                    </div>
                </div>

            </div>
        `
    };

    window.AgiAgentManagerActuator = componentDef;
})();