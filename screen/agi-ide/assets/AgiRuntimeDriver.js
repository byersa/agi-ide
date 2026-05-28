// AgiRuntimeDriver.js
(function bootAgiWorkspace() {
    const targetSelector = '#agi-ide-workspace-mount';
    const targetEl = document.querySelector(targetSelector);

    if (!targetEl) {
        setTimeout(bootAgiWorkspace, 250);
        return;
    }

    try {
        console.info("🚀 [AGI-IDE] Core DOM localized. Hydrating workspace container pipeline...");

        // Create clean base application instance context
        const app = Vue.createApp({});

        // Wire plugins
        if (typeof Pinia !== 'undefined') app.use(Pinia.createPinia());
        if (typeof Quasar !== 'undefined') app.use(Quasar, { config: { loadingBar: { color: 'amber' } } });
        if (window.AgiComponentLibrary) window.AgiComponentLibrary.registerAll(app);

        // REMEDIATION: Catch our custom workspace tag registration definition mapping
        if (window.IdeWorkspaceComponent) {
            app.component('ide-workspace-component', window.IdeWorkspaceComponent);
            console.info("🎯 [AGI-IDE] <ide-workspace-component> successfully linked to Vue runtime.");
        } else {
            console.warn("⚠️ [AGI-IDE] window.IdeWorkspaceComponent payload was not loaded.");
        }

        // Register visualizer canvases
        if (window.MoquiCanvasEditor) {
            app.component('blueprint-renderer', window.MoquiCanvasEditor);
            app.component('m-architect-view-port', window.MoquiCanvasEditor);
        }

        // Mount the application interface securely
        window.moquiApp = app.mount(targetSelector);

        // Decoupled Hotkey Event Channel Listener
        window.addEventListener('toggle-command-palette', function () {
            var dlg = document.getElementById('CommandPalette');
            if (dlg) {
                if (dlg.hasAttribute('open') || dlg.open) {
                    if (typeof dlg.close === 'function') dlg.close();
                } else {
                    if (typeof dlg.showModal === 'function') dlg.showModal();
                }
            }
        });

    } catch (bootError) {
        console.error("❌ [AGI-IDE Severe Lifecycle Collision] Boot failed:", bootError);
    }
})();