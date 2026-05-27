// AgiBootstrapper.js - Pure Lifecyle Driver
(function bootAgiWorkspace() {
    console.info("🕵️‍♂️ [AGI-IDE BOOT] Inspecting system thread for active container context...");

    const targetSelector = '#q-app';
    const targetEl = document.querySelector(targetSelector);

    // 1. Safe DOM Polling: If Moqui is slow delivering the wrapper shell, poll gracefully without crashing
    if (!targetEl) {
        setTimeout(bootAgiWorkspace, 30);
        return;
    }

    try {
        console.info("🚀 [AGI-IDE BOOT] Target #q-app localized. Initializing clean application context...");

        // Instantiate our focused IDE app object layout
        const app = Vue.createApp(window.AgiWorkspaceAppDefinition);

        // 2. Clear Plugin Registration Path
        if (typeof Pinia !== 'undefined') {
            const pinia = Pinia.createPinia();
            app.use(pinia);
            window.moqui = window.moqui || {};
            window.moqui.pinia = pinia;
        }

        if (typeof Quasar !== 'undefined') {
            app.use(Quasar, { config: { loadingBar: { color: 'amber' } } });
        }

        // Register custom architecture layout canvases manually to ensure clean injection
        if (window.MoquiCanvasEditor) {
            app.component('blueprint-renderer', window.MoquiCanvasEditor);
            console.info("🎨 [AGI-IDE BOOT] blueprint-renderer component successfully registered.");
        }

        // 3. Forcibly execute the Mount Lifecycle
        window.moquiApp = app.mount(targetSelector);
        console.log("🎯 [AGI-IDE BOOT] App successfully anchored to DOM thread. Proxy exposed at window.moquiApp.");

        // 4. Clean Global Hotkey Latch
        window.removeEventListener('toggle-command-palette', window._agiHotkeyHandler); // Avoid duplicated listener footprints
        window._agiHotkeyHandler = () => {
            console.info("🎯 [GLOBAL CATCH] Caught shortcut broadcast. Accessing active Pinia store state...");

            // Reach directly into the warm app proxy we just mounted
            const store = window.moquiApp?.aiTreeStore;
            if (store) {
                store.showCommandPalette = !store.showCommandPalette;
                console.log("🎨 Command Palette Visibility Flipped:", store.showCommandPalette);
            } else {
                console.warn("⚠️ Hotkey caught, but aiTreeStore has not finished hydration.");
            }
        };
        window.addEventListener('toggle-command-palette', window._agiHotkeyHandler);

    } catch (bootError) {
        console.error("❌ [AGI-IDE Severe Boot Collision] Lifecycle execution failed:", bootError);
    }
})();