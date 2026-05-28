// AgiWorkspaceApp.js - Clean Workspace Shell Blueprint
window.AgiWorkspaceAppDefinition = {
    name: 'AgiIdeWorkspaceRoot',

    setup() {
        const { onMounted } = Vue;

        // Pinia Store Link
        const aiTreeStore = (window.moqui && window.moqui.useAiTreeStore) ? window.moqui.useAiTreeStore() : null;

        onMounted(() => {
            console.log("🎨 [AGI-IDE] Workspace visual component layer mounted into active context.");
            // Fetch initial project data cleanly on boot
            if (window.AgiWorkspaceAppDefinition.methods.fetchAvailableApps) {
                window.AgiWorkspaceAppDefinition.methods.fetchAvailableApps();
            }
        });

        return {
            aiTreeStore
        };
    },

    data() {
        return {
            moquiSessionToken: "",
            appRootPath: "/apps",
            username: "",
            userId: "",
            loading: 0,
            // Keep architecture view active as your natural default layout
            isArchitectMode: true,
            showCommandPalette: false,
            fields: {
                targetComponent: 'aitree', // Default project target
                selectedArtifact: ''
            },
            backpackArtifacts: {
                entities: [],
                services: [],
                screens: []
            },
            // Fallback object to catch early template renders before Pinia finishes attaching
            aiTreeStore: {
                chatInput: '',
                activeBlueprintJson: null,
                isArchitectMode: false
            },
        };
    },

    methods: {
        async fetchAvailableApps() {
            try {
                const token = this.moquiSessionToken || document.getElementById("confMoquiSessionToken")?.value;
                const response = await fetch('/rest/s1/moquiai/AvailableApps', {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'X-CSRF-Token': token
                    }
                });
                const data = await response.json();
                if (this.aiTreeStore) {
                    this.aiTreeStore.availableApps = data.apps || [];
                }
                console.log("📁 [AGI-IDE] Hydrated orchestration apps list:", data.apps);
            } catch (e) {
                console.warn("⚠️ [AGI-IDE] Failed to fetch available orchestrator apps:", e);
            }
        },

        sendWorkspaceMessage() {
            const text = this.aiTreeStore?.chatInput;
            const activeProject = document.getElementById("targetComponent")?.value;
            const currentArtifact = document.getElementById("selectedArtifact")?.value;

            if (!text || !text.trim()) return;

            console.log(`✉️ [AGI-IDE] Piping instruction out to host plane: "${text}"`);

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
                    targetComponent: activeProject,
                    artifactPath: currentArtifact
                }));
            }

            if (this.aiTreeStore) this.aiTreeStore.chatInput = '';
        },

        setUrl(url, bodyParameters, onComplete, pushState = true) {
            console.info("🔗 [AGI-IDE ROUTE] Simulating dynamic screen tree handoff for:", url);
            // Pushes raw path parameters cleanly to layout handlers if multi-screen shifts happen
        }
    }
};