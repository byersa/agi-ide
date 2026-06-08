(function () {
    const componentDef = {
        name: 'AgiToolPalette',
        props: {
            currentEditor: { type: String, default: 'moqui-canvas-editor' }
        },
        data() {
            return {
                isRecording: false,
                audioContext: null,
                mediaRecorder: null,
                socket: null, // Hook target for local Ollama/OpenRouter voice proxy connection

                // Restored your authentic blueprint tool item lists from Saturday
                palette: {
                    screen: [
                        { label: 'entity-find', icon: 'search', command: 'Help me add an entity-find action for MedicalCondition' },
                        { label: 'form-single', icon: 'content_paste', command: 'Help me add a form-single for' },
                        { label: 'container', icon: 'crop_square', command: 'Help me add a container for' },
                        { label: 'link', icon: 'link', command: 'Help me add a link to' }
                    ],
                    service: [
                        { label: 'entity-one', icon: 'filter_1', command: 'Help me add an entity-one action for' },
                        { label: 'entity-update', icon: 'edit', command: 'Help me add an entity-update for' },
                        { label: 'entity-find', icon: 'search', command: 'Help me add an entity-find action for' },
                        { label: 'script', icon: 'description', command: 'Help me add a groovy script to' }
                    ]
                }
            }
        },
        computed: {
            // Contextually look up whether we are inspecting a screen definition or service logic layout
            currentMode() {
                if (this.currentEditor === 'moqui-canvas-editor') return 'screen';
                return 'service';
            },
            paletteItems() {
                return this.palette[this.currentMode] || [];
            }
        },
        methods: {
            handleItemClick(item) {
                console.info("Palette item chosen:", item.label);
                // Pastes the command payload directly over to your active AI chat stream state
                if (this.$root.aiTreeStore) {
                    this.$root.aiTreeStore.chatInput = item.command;
                }
                // Global event broadcast hook for parent view shells
                window.dispatchEvent(new CustomEvent('palette-pasted', { detail: { command: item.command } }));
            },

            // Audio Agent Subsystems (Preserved & Protected for specialized contributors)
            async toggleVoiceAgent() {
                if (this.isRecording) {
                    this.stopVoiceStream();
                } else {
                    await this.startVoiceStream();
                }
            },
            async startVoiceStream() {
                try {
                    this.isRecording = true;
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

                    // low-latency WebAudio API processing nodes configuration context
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    console.info("🎙️ [AgiToolPalette] Audio Context capturing stream initiated.");
                } catch (err) {
                    console.error("❌ Failed to bind mic access:", err);
                    this.isRecording = false;
                }
            },
            stopVoiceStream() {
                this.isRecording = false;
                console.info("🛑 [AgiToolPalette] Audio stream captured. Dispatching transcript pipeline processing rules.");
                // Audio engineers can extract and send raw PCM buffers out over sockets from here
            }
        },
        template: `
            <q-card class="palette-card shadow-3 full-height flex flex-column bg-white" style="border: 1px solid #e0e0e0; border-radius: 12px; min-height: calc(100vh - 120px);">
                <div class="bg-indigo-10 text-white q-pa-md text-weight-bold row items-center justify-between" style="border-top-left-radius: 11px; border-top-right-radius: 11px;">
                    <div class="row items-center">
                        <q-icon name="handyman" class="q-mr-sm" />
                        <span>BLUEPRINT TOOLS</span>
                    </div>
                    
                    <q-btn round flat dense 
                           :icon="isRecording ? 'mic' : 'mic_none'" 
                           :color="isRecording ? 'red-5' : 'white'" 
                           @click="toggleVoiceAgent">
                        <q-tooltip>Toggle Live AI Voice Prompting</q-tooltip>
                        <q-inner-loading v-if="isRecording" class="bg-transparent text-white" />
                    </q-btn>
                </div>

                <q-list dense padding class="q-pa-sm flex-grow">
                    <q-item-label header class="text-uppercase text-weight-bolder text-grey-6 text-tracking-wider" style="font-size: 11px;">
                        Context: {{ currentMode }} primitives
                    </q-item-label>
                    
                    <q-item v-for="item in paletteItems" :key="item.label" clickable v-ripple @click="handleItemClick(item)" class="rounded-borders q-mb-xs">
                        <q-item-section avatar side>
                            <q-icon :name="item.icon" color="indigo-7" size="sm" />
                        </q-item-section>
                        <q-item-section class="text-weight-medium text-grey-9 text-body2">
                            &lt;{{ item.label }}&gt;
                        </q-item-section>
                        <q-item-section side>
                            <q-icon name="add_circle_outline" color="green-6" size="xs" />
                        </q-item-section>
                    </q-item>
                </q-list>

                <div class="q-pa-sm text-center text-caption font-mono text-weight-bold bg-slate-1 border-top text-slate-7" style="border-bottom-left-radius: 11px; border-bottom-right-radius: 11px;">
                    {{ currentMode.toUpperCase() }} ORCHESTRATION MODE
                </div>
            </q-card>
        `
    };

    // Safe global runtime registration verification pass
    function registerPalette() {
        if (typeof window.moqui !== 'undefined' && window.moqui.webrootVue && window.moqui.webrootVue.component) {
            window.moqui.webrootVue.component('agi-tool-palette', componentDef);
            console.info("🚀 [AGI-IDE] AgiToolPalette officially registered with window.moqui.webrootVue.");
        } else {
            setTimeout(registerPalette, 200);
        }
    }
    registerPalette();
    window.AgiToolPalette = componentDef;
})();