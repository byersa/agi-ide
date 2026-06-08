(function () {
    const componentDef = {
        name: 'AgiTerminalHost',
        data() {
            return {
                activeEditorComponent: 'moqui-canvas-editor',
                currentComponentName: window.AGI_INITIAL_COMPONENT || 'agi-ai',
                currentScreenPath: window.AGI_INITIAL_SCREEN || 'SampleForm',
                rawXmlText: ``,
                cachedBlueprint: null,
                isSyncing: false,
                typingTimer: null
            }
        },
        mounted() {
            this.loadInitialXmlSpec();
        },
        methods: {
            async loadInitialXmlSpec() {
                this.isSyncing = true;
                try {
                    const res = await fetch(`/rest/s1/agi-ide/getBlueprint?componentName=${this.currentComponentName}&screenPath=${this.currentScreenPath}`);
                    if (!res.ok) throw new Error(`HTTP Error fetching initial specs: ${res.status}`);

                    const data = await res.json();

                    if (data && data.blueprint) {
                        // NEW: Capture the blueprint mapping tree inside our local cache context
                        this.cachedBlueprint = data.blueprint;

                        if (data.blueprint.rawXmlText) {
                            this.rawXmlText = data.blueprint.rawXmlText;
                        }
                    }
                } catch (e) {
                    console.error("Initial text spec pull pass failed:", e);
                } finally {
                    this.isSyncing = false;
                }
            },
            handleXmlCodeInput(newXml) {
                this.rawXmlText = newXml;

                // Clear the previous countdown timer every time the user presses a key
                if (this.typingTimer) clearTimeout(this.typingTimer);

                // Only fire the full compilation loop after the human stops typing for 750ms
                this.typingTimer = setTimeout(() => {
                    this.syncXmlToCanvas();
                }, 750);
            },
            async syncXmlToCanvas() {
                if (this.isSyncing) return;
                this.isSyncing = true;

                try {
                    console.info("Sending code text mirror modification pass up to backend serialization wrapper...");

                    // FIXED: Multi-layered fallback strategy to grab the token in standalone environments
                    const csrfToken = (window.moqui && window.moqui.moquiSessionToken)
                        || (document.querySelector('meta[name="moqui-session-token"]')
                            ? document.querySelector('meta[name="moqui-session-token"]').getAttribute('content')
                            : '')
                        || (document.cookie.match(/moquiSessionToken=([^;]+)/)
                            ? document.cookie.match(/moquiSessionToken=([^;]+)/)[1]
                            : '');

                    console.info("🔒 [AgiTerminalHost] Active CSRF Token resolved:", csrfToken ? "RESOLVED (Hidden)" : "NONE FOUND");

                    const response = await fetch('/rest/s1/agi-ide/compileRawXmlToBlueprint', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': csrfToken
                        },
                        body: JSON.stringify({
                            componentName: this.currentComponentName,
                            screenPath: this.currentScreenPath,
                            rawXmlText: this.rawXmlText
                        })
                    });

                    if (response.ok) {
                        const rawData = await response.json();
                        const canvasChild = this.$refs.canvasEditor;
                        if (canvasChild && rawData.blueprint) {
                            canvasChild.blueprintTree = rawData.blueprint;
                            console.info("🚀 [AgiTerminalHost] Right canvas layout updated via mirror compilation loop.");
                        }
                    } else if (response.status === 401) {
                        console.error("❌ CSRF token rejected by Moqui security gateway layer.");
                    }
                } catch (e) {
                    console.error("Mirror parse sync failure:", e);
                } finally {
                    this.isSyncing = false;
                }
            },
            handleCanvasMutation(mutatedBlueprintJson) {
                console.info("Canvas reported graphical mutation click/drag event. Regenerating text code...");
            }
        },
        template: `
            <div class="ama-terminal-host-workspace full-width column bg-slate-10" style="height: 100vh; overflow: hidden;">
                <div class="row no-wrap full-width" style="flex: 1; height: calc(100vh - 60px);">
                    
                    <div class="col-6 q-pa-md bg-grey-10 text-white flex flex-column" style="border-right: 2px solid #334155; height: 100%;">
                        <div class="text-subtitle2 text-grey-4 q-mb-sm font-mono row items-center justify-between">
                            <span><q-icon name="code" color="orange" /> RAW MOQUI XML SPECIFICATION</span>
                            <q-spinner-dots v-if="isSyncing" color="orange" size="sm" />
                        </div>
                        <textarea 
                            :value="rawXmlText"
                            @input="handleXmlCodeInput($event.target.value)"
                            class="full-width flex-grow q-pa-md font-mono bg-grey-9 text-amber-3 border-none rounded-borders"
                            style="resize: none; font-size: 13px; line-height: 1.5; outline: none; font-family: 'Courier New', monospace; flex: 1;"
                            spellcheck="false"
                        ></textarea>
                    </div>

                    <div class="col-6 q-pa-md bg-slate-9" style="height: 100%;">
                        <component 
                            :is="activeEditorComponent"
                            ref="canvasEditor"
                            :component-name="currentComponentName"
                            :screen-path="currentScreenPath"
                            :preloaded-xml-source="rawXmlText"
                            :initial-blueprint="cachedBlueprint"
                            @canvas-change="handleCanvasMutation"
                        />
                    </div>

                </div>

                <div class="full-width bg-indigo-10 text-white q-pa-sm row items-center justify-between" style="height: 60px;">
                    <div class="text-caption font-mono text-weight-bold">AGI-IDE DESKTOP ENGINE v5</div>
                    <agi-tool-palette :current-editor="activeEditorComponent" style="min-height: auto; width: 400px; border-radius: 4px;" class="shadow-none" />
                </div>
            </div>
        `
    };

    function registerTerminalHost() {
        if (typeof window.moqui !== 'undefined' && window.moqui.webrootVue && window.moqui.webrootVue.component) {
            window.moqui.webrootVue.component('ama-terminal-host', componentDef);
        } else {
            setTimeout(registerTerminalHost, 100);
        }
    }
    registerTerminalHost();
    window.AgiTerminalHost = componentDef;
})();