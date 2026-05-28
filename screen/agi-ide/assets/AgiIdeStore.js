// runtime/component/agi-ide/assets/AgiIdeStore.js
(function () {
    if (typeof Pinia !== 'undefined') {
        // Define the formal, type-safe IDE Workspace store
        window.useAgiIdeStore = Pinia.defineStore('agiIdeStore', {
            state: () => ({
                // Explicitly initialized visibility toggles
                showCommandPalette: false,
                chatInput: '',
                activeBlueprintJson: null,
                isArchitectMode: false,
                targetPath: null,

                // Track project selections and files in scope
                activeComponent: 'aitree',
                selectedArtifact: '',
                backpackArtifacts: {
                    entities: [],
                    services: [],
                    screens: []
                }
            }),
            actions: {
                toggleCommandPalette() {
                    this.showCommandPalette = !this.showCommandPalette;
                    console.log("🎨 [PINIA] Command palette visibility toggled to:", this.showCommandPalette);
                },
                setBlueprint(json) {
                    this.activeBlueprintJson = json;
                }
            }
        });
        console.info("🧠 [AGI-IDE] Pinia store 'agiIdeStore' successfully defined.");
    }
})();