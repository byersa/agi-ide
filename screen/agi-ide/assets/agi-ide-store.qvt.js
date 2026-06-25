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
                isBufferSaving: false
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
            }
        }
    });

    // Clean, globally exportable workspace state accessors
    window.useAgiIdeStore = useAgiIdeStore;
})();