(function () {
    const componentDef = {
        name: 'MoquiCanvasEditor',
        props: {
            componentName: { type: String, required: true },
            screenPath: { type: String, required: true },
            preloadedXmlSource: { type: String, default: '' },
            // NEW: Accept an initial blueprint tree handed down directly by the parent
            initialBlueprint: { type: Object, default: null }
        },
        data() {
            return {
                blueprintTree: null,
                loading: false,
                activeNode: null,
                currentMode: 'screen' // Switches visual canvas panels ('screen' or 'service')
            }
        },
        watch: {
            // Watch for changes when navigating to entirely different screens later
            screenPath() {
                this.fetchLayoutBlueprint();
            },
            // NEW: If the parent pushes a newly compiled blueprint map down, update the local canvas tree state
            initialBlueprint: {
                deep: true,
                handler(newBlueprint) {
                    if (newBlueprint) this.blueprintTree = newBlueprint;
                }
            }
        },
        mounted() {
            // Listen for mode changes coming from the external sibling palette
            window.addEventListener('palette-mode-change', (e) => {
                if (e.detail && e.detail.mode) this.currentMode = e.detail.mode;
            });
        },
        methods: {
            async fetchLayoutBlueprint() {
                // If we already have an initial blueprint seed loaded, skip the startup fetch cycle!
                if (this.blueprintTree) return;

                if (!this.screenPath) return;
                this.loading = true;
                try {
                    const response = await fetch(`/rest/s1/agi-ide/getBlueprint?componentName=${this.componentName}&screenPath=${this.screenPath}`);
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    const rawData = await response.json();
                    if (rawData && rawData.blueprint) {
                        this.blueprintTree = rawData.blueprint;
                        if (rawData.blueprint.rawXmlText && this.$parent) {
                            this.$parent.rawXmlText = rawData.blueprint.rawXmlText;
                        }
                    }
                } catch (err) {
                    console.error("❌ Blueprint live network sync failed:", err);
                } finally {
                    this.loading = false;
                }
            },
            selectNode(node) {
                this.activeNode = node;
            }
        },
        template: `
            <div class="moqui-canvas-wrapper full-width row no-wrap relative-position" style="height: calc(100vh - 120px); border-radius: 12px; background: #f4f6f9; overflow: hidden;">
                <div style="position: absolute; bottom: 0; left: 0; background: #2196f3; color: white; font-size: 10px; z-index: 10000; padding: 2px 6px; border-top-right-radius: 4px;">MCE_V5_LIVE</div>

                <div class="canvas-center-workspace col-8 q-pa-md flex flex-column relative-position" style="overflow-y: auto; height: 100%;">
                    <q-inner-loading :showing="loading" color="primary" />

                    <q-banner dense class="bg-indigo-9 text-white q-mb-md rounded-borders shadow-1">
                        <template v-slot:avatar><q-icon name="layers" /></template>
                        <span class="text-weight-bold">Active Canvas Context:</span> {{ screenPath }}.xml
                        <template v-slot:action>
                            <q-btn flat dense round icon="refresh" color="white" @click="fetchLayoutBlueprint" />
                        </template>
                    </q-banner>

                    <div v-if="currentMode === 'screen'" class="canvas-viewport bg-white q-pa-xl rounded-borders shadow-1" style="min-height: 80%; border: 1px dashed #bdbdbd; position: relative;">
                        <div v-if="blueprintTree && blueprintTree.children" class="widgets-canvas-root">
                            
                            <div v-for="(node, idx) in blueprintTree.children" :key="idx" class="q-mb-md">
                                
                                <q-form v-if="node['@type'] === 'FormSingle'" class="q-gutter-y-md q-pa-md bg-white rounded-borders shadow-1" style="border-left: 4px solid #4caf50;">
                                    <div class="row items-center justify-between text-caption text-green-9 text-weight-bold">
                                        <span>&lt;form-single name="{{ node.name }}"&gt;</span>
                                        <q-chip dense icon="directions_run" size="xs" color="green-1" text-color="green-9">action: {{ node.action }}</q-chip>
                                    </div>
                                    <div v-for="field in node.children" :key="field.name" class="form-field-wrapper q-pa-sm rounded-borders cursor-pointer" :class="{'selected-node': activeNode === field}" @click.stop="selectNode(field)" style="border: 1px solid #f0f0f0;">
                                        <div class="text-caption text-grey-8 text-weight-medium q-mb-xs">{{ field.title }} <span class="text-grey-5" style="font-family: monospace;">({{ field.name }})</span></div>
                                        <template v-for="(widget, wIdx) in field.children" :key="wIdx">
                                            <q-input v-if="widget['@type'] === 'text-line'" dense outlined readonly :placeholder="widget.attributes.placeholder || 'Text Input Line'" class="bg-grey-1" />
                                            <q-select v-if="widget['@type'] === 'm-drop-down'" dense outlined readonly :options="widget.attributes.options" option-value="value" option-label="label" emit-value map-options class="bg-grey-1" />
                                            <q-btn v-if="widget['@type'] === 'submit'" color="green-7" unevaluated :label="widget.attributes.text || 'Submit'" class="full-width text-weight-bold" />
                                        </template>
                                    </div>
                                </q-form>

                                <div v-if="node['@type'] === 'Container'" class="q-pa-md bg-grey-1 rounded-borders relative-position cursor-pointer transition-box" :class="{'selected-node': activeNode === node}" @click.stop="selectNode(node)" style="border: 1px solid #e0e0e0;">
                                    <q-badge color="grey-7" floating style="top: -10px;">&lt;container id="{{ node.id }}"&gt;</q-badge>
                                    <div v-for="(child, cIdx) in node.children" :key="cIdx" class="full-width q-mt-sm">
                                        
                                        <q-form v-if="child['@type'] === 'FormSingle'" class="q-gutter-y-md q-pa-md bg-white rounded-borders shadow-1" style="border-left: 4px solid #4caf50;">
                                            <div class="row items-center justify-between text-caption text-green-9 text-weight-bold">
                                                <span>&lt;form-single name="{{ child.name }}"&gt;</span>
                                                <q-chip dense icon="directions_run" size="xs" color="green-1" text-color="green-9">action: {{ child.action }}</q-chip>
                                            </div>
                                            <div v-for="field in child.children" :key="field.name" class="form-field-wrapper q-pa-sm rounded-borders cursor-pointer" :class="{'selected-node': activeNode === field}" @click.stop="selectNode(field)" style="border: 1px solid #f0f0f0;">
                                                <div class="text-caption text-grey-8 text-weight-medium q-mb-xs">{{ field.title }} <span class="text-grey-5" style="font-family: monospace;">({{ field.name }})</span></div>
                                                <template v-for="(widget, wIdx) in field.children" :key="wIdx">
                                                    <q-input v-if="widget['@type'] === 'text-line'" dense outlined readonly :placeholder="widget.attributes.placeholder || 'Text Input Line'" class="bg-grey-1" />
                                                    <q-select v-if="widget['@type'] === 'm-drop-down'" dense outlined readonly :options="widget.attributes.options" option-value="value" option-label="label" emit-value map-options class="bg-grey-1" />
                                                    <q-btn v-if="widget['@type'] === 'submit'" color="green-7" unevaluated :label="widget.attributes.text || 'Submit'" class="full-width text-weight-bold" />
                                                </template>
                                            </div>
                                        </q-form>

                                    </div>
                                </div>

                            </div>
                        </div>
                        <div v-else class="text-center text-grey-5 q-mt-xl">
                            <q-icon name="cloud_download" size="64px" />
                            <div class="text-subtitle1">Awaiting XML Blueprint Definition Target Context...</div>
                        </div>
                    </div>

                    <div v-else class="service-view-pane bg-grey-2 q-pa-md rounded-borders full-height">
                        <div class="text-center text-grey-6 q-mt-xl">
                            <q-icon name="settings_suggest" size="48px" />
                            <div class="text-subtitle2">Mantle Service Logic Track Active</div>
                        </div>
                    </div>
                </div>

                <div class="inspector-side-panel col-4 bg-white q-pa-md shadow-2" style="border-left: 1px solid #e0e0e0; height: 100%; display: flex; flex-direction: column;">
                    <div class="text-subtitle2 text-indigo-10 text-weight-bold q-mb-sm row items-center">
                        <q-icon name="tune" class="q-mr-xs" /> DECLARATIVE PROPERTY INSPECTOR
                    </div>
                    <q-separator />
                    <div v-if="activeNode" class="inspector-content q-mt-md q-gutter-y-md flex-grow" style="overflow-y: auto; flex: 1;">
                        <div class="row items-center justify-between">
                            <span class="text-caption text-weight-bold text-grey-7">Node Metatype:</span>
                            <q-badge color="indigo-7" class="text-weight-bold q-pa-xs">{{ activeNode['@type'] }}</q-badge>
                        </div>
                        <div class="q-gutter-y-sm">
                            <q-input v-if="'title' in activeNode" v-model="activeNode.title" label="Display Label Name (title)" dense outlined stack-label color="indigo" />
                            <q-input v-if="'name' in activeNode" v-model="activeNode.name" label="System Property Handle (name)" dense outlined stack-label color="indigo" />
                        </div>
                    </div>
                    <div v-else class="flex flex-center flex-grow text-grey-5 text-center q-mt-xl" style="flex: 1;">
                        <div>
                            <q-icon name="touch_app" size="48px" class="q-mb-sm text-grey-4" />
                            <div class="text-caption">Click any element layout item inside the canvas area to inspect its live core parameters.</div>
                        </div>
                    </div>
                </div>
            </div>
        `
    };

    // Safe Global Runtime Bootstrapper Injection 
    function verifyAndRegister() {
        if (typeof window.moqui !== 'undefined' && window.moqui.webrootVue && window.moqui.webrootVue.component) {
            window.moqui.webrootVue.component('moqui-canvas-editor', componentDef);
            console.info("🚀 [AGI-IDE] MoquiCanvasEditor updated to Reactive HTML Engine v5.");
        } else {
            setTimeout(verifyAndRegister, 250);
        }
    }
    verifyAndRegister();
    window.MoquiCanvasEditor = componentDef;
})();