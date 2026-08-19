(function () {
    const AgiIntentCompiler = {
        /**
         * Dispatches a background compilation prompt to resolve plain-text intent 
         * into valid, production-ready Vue/Quasar schema attributes.
         */
        async compileIntent(mariaId, screenPath, rawIntentText) {
            console.info(`🧠 [INTENT COMPILE] Sending intent for [${mariaId}] to Gemini...`);

            const ideStore = window.useAgiIdeStore ? window.useAgiIdeStore() : null;
            const axiosConfig = ideStore ? ideStore.getAxiosConfig : {};

            const compilationPrompt = `
                COMPILATION INTENT REQUEST:
                Translate this intent string into strict, schema-compliant UI bindings: "${rawIntentText}"
                
                Target Element MariaId: "${mariaId}"
                
                Execute the appropriate system tool to update this node's attributes in our active layout buffer.
            `;

            try {
                const response = await axios.post('/rest/s1/agi-ide/openAiProxy', {
                    userPrompt: compilationPrompt.trim(),
                    moquiSessionToken: ideStore ? ideStore.moquiSessionToken : "",
                    targetMariaId: mariaId,
                    focusCoordinate: screenPath // Ensures the engine targets the right file
                }, axiosConfig);

                const result = response.data;

                // If successful, notify the workspace to reload the updated design-time metadata
                if (result && !result.error) {
                    console.info(`🎯 [INTENT SUCCESS] Element [${mariaId}] compiled successfully on disk.`);

                    // Broadcast mutation event so our canvas live-reloads
                    const contextBus = new BroadcastChannel('agi-ide-context-bus');
                    contextBus.postMessage({
                        event: 'artifact-state-mutated',
                        mutatedTree: window.AgiWorkspace?.activeWorkspaceBuffer?.metaJsonBuffer
                    });
                    contextBus.close();
                }
            } catch (err) {
                console.error(`❌ [INTENT FAILED] Failed compiling intent for [${mariaId}]:`, err);
            }
        }
    };

    window.AgiIntentCompiler = AgiIntentCompiler;
})();