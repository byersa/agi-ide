(function () {
    if (!window.Pinia) {
        console.warn("⚠️ Pinia core library not discovered in window footprint. Aborting IDE store declaration initialization pass.");
        return;
    }

    // Define a robust, centralized store accessible by all sub-components
    const useAgiIdeStore = Pinia.defineStore('agiIdeStore', {
        state() {
            // Resolve the Moqui token using your robust hierarchy
            const resolvedToken = window.AGI_SERVER_CSRF_TOKEN
                || (window.moqui && window.moqui.moquiSessionToken)
                || (window.opener && window.opener.moqui && window.opener.moqui.moquiSessionToken)
                || (document.querySelector('meta[name="moqui-session-token"]')?.getAttribute('content'))
                || "";

            console.info(`🔒 [agiIdeStore] Token hydrated via store initialization. Status: ${resolvedToken ? 'Active' : 'Missing'}`);

            return {
                moquiSessionToken: resolvedToken,
                activeScreenPath: '',
                selectedMariaId: '',
                isBufferSaving: false,
                // 🎯 SINGLE SOURCE OF TRUTH FOR METAJSON
                activeBlueprintJson: null,
                blueprintCache: {} // Map of artifactUri -> parsed JSON tree
            };
        },
        getters: {
            // Centralized Axios Configuration computation rule
            getAxiosConfig(state) {
                return {
                    headers: {
                        "Content-Type": "application/json;charset=UTF-8",
                        "X-CSRF-Token": state.moquiSessionToken,
                        "moquiSessionToken": state.moquiSessionToken
                    }
                };
            },
            // Get active blueprint tree directly from state
            getActiveBlueprint(state) {
                if (state.activeScreenPath && state.blueprintCache[state.activeScreenPath]) {
                    return state.blueprintCache[state.activeScreenPath];
                }
                return state.activeBlueprintJson;
            }
        },
        actions: {
            initializeSession(token) {
                if (token) this.moquiSessionToken = token;
            },
            setActiveArtifact(screenPath) {
                this.activeScreenPath = screenPath;
            },
            setSelectedNode(mariaId) {
                this.selectedMariaId = mariaId;
            },
            // 🎯 CENTRAL MUTATION ACTION
            updateActiveBlueprint({ artifactUri, blueprintTree }) {
                const parsedTree = typeof blueprintTree === 'string'
                    ? JSON.parse(blueprintTree)
                    : blueprintTree;

                this.activeBlueprintJson = parsedTree;
                if (artifactUri) {
                    this.blueprintCache[artifactUri] = parsedTree;
                    this.activeScreenPath = artifactUri;
                }
                console.info("💾 [agiIdeStore] Updated single source of truth for artifact:", artifactUri || 'Global');
            },
            setArtifactMetadata(artifactPath, metaJsonData) {
                let parsed = typeof metaJsonData === 'string' ? JSON.parse(metaJsonData) : metaJsonData;

                this.currentArtifact = {
                    path: artifactPath,
                    // 🎯 Store the explicit editor handle ('AgiComponentEditor' vs 'AgiBlueprintEditor')
                    editor: parsed.editor || 'AgiBlueprintEditor',
                    rawMeta: parsed
                };
            },
        }
    });

    // Clean, globally exportable workspace state accessors
    window.useAgiIdeStore = useAgiIdeStore;
})();