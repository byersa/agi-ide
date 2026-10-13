(function () {
    const AgiEditors = {
        name: 'AgiEditors',
        emits: ['trigger-save', 'toggle-editor'],
        props: {
            activeEditors: {
                type: Array,
                default: () => ['AgiScreenEditor']
            },
            availableEditors: {
                type: Array,
                default: () => []
            },
            localScreenPath: {
                type: String,
                default: ''
            },
            companionQvtPath: {
                type: String,
                default: ''
            },
            targetComponentName: {
                type: String,
                default: 'nursinghome'
            },
            layoutTree: {
                type: [Object, Array, String],
                default: () => null
            },
            editorConstructors: {
                type: Object,
                default: () => ({})
            }
        },
        computed: {
            currentArtifactLabel() {
                if (!this.localScreenPath) return 'No Artifact Loaded';
                const parts = this.localScreenPath.split('/');
                return parts[parts.length - 1];
            }
        },
        methods: {
            getEditorMeta(edId) {
                return (
                    this.availableEditors.find(e => e.id === edId) || {
                        label: edId,
                        icon: 'edit',
                        color: 'slate-400'
                    }
                );
            },
            closeEditor(edId) {
                this.$emit('toggle-editor', edId);
            },
            handleSave() {
                this.$emit('trigger-save');
            }
        },
        template: `
            <div class="fit column no-wrap overflow-hidden relative-position" style="height: 100%; min-height: 0; width: 100%;">
                
                <!-- State A: No Editors Selected -->
                <div v-if="activeEditors.length === 0" class="fit column flex-center text-slate-500 text-caption font-mono">
                    <q-icon name="visibility_off" size="32px" class="q-mb-xs" />
                    <div>All editors are hidden.</div>
                    <div class="text-slate-600">Select one or more from the "Editors" menu above.</div>
                </div>

                <!-- State B: Concurrent Side-by-Side Editor Panels -->
                <div v-else class="fit row no-wrap overflow-hidden" style="height: 100%; min-height: 0;">
                    <div 
                        v-for="(edId, idx) in activeEditors" 
                        :key="edId"
                        class="column no-wrap overflow-hidden relative-position"
                        :style="{
                            flex: '1 1 0%',
                            minWidth: '0',
                            height: '100%',
                            borderRight: idx < activeEditors.length - 1 ? '1px solid #1e293b' : 'none'
                        }"
                    >
                        <!-- Individual Editor Header Strip -->
                        <div class="row items-center justify-between q-px-xs bg-black" style="height: 24px; min-height: 24px; flex: 0 0 24px; border-bottom: 1px solid #1e293b;">
                            <div class="row items-center q-gutter-x-xs no-wrap ellipsis">
                                <q-icon :name="getEditorMeta(edId).icon" size="12px" :color="getEditorMeta(edId).color" />
                                <span class="text-caption text-weight-bold text-slate-300 ellipsis" style="font-size: 10px;">
                                    {{ getEditorMeta(edId).label }}
                                </span>
                            </div>
                            <q-btn flat round dense icon="close" size="xs" color="slate-500" @click="closeEditor(edId)" />
                        </div>

                        <!-- Editor Mounting Viewport -->
                        <div class="col overflow-hidden relative-position" style="flex: 1 1 0%; min-height: 0;">
                            <!-- Canvas Editor -->
                            <component 
                                :is="editorConstructors.AgiCanvasEditor" 
                                v-if="edId === 'AgiCanvasEditor' && editorConstructors.AgiCanvasEditor"
                                :screen-path="localScreenPath" 
                                :layout-tree="layoutTree" 
                                @trigger-save="handleSave" 
                            />
                            <!-- Screen XML Editor -->
                            <component 
                                :is="editorConstructors.AgiScreenEditor" 
                                v-else-if="edId === 'AgiScreenEditor' && editorConstructors.AgiScreenEditor"
                                :screen-path="localScreenPath" 
                                :layout-tree="layoutTree" 
                                @trigger-save="handleSave" 
                            />
                            <!-- Component Source Editor -->
                            <component 
                                :is="editorConstructors.AgiComponentEditor" 
                                v-else-if="edId === 'AgiComponentEditor' && editorConstructors.AgiComponentEditor"
                                :screen-path="companionQvtPath || localScreenPath" 
                                @trigger-save="handleSave" 
                            />
                            <!-- Test Runner -->
                            <component 
                                :is="editorConstructors.AgiTestRunner" 
                                v-else-if="edId === 'AgiTestRunner' && editorConstructors.AgiTestRunner"
                                :target-component="targetComponentName" 
                            />
                            <!-- Fallback / Custom Placeholder -->
                            <div v-else class="fit row flex-center text-slate-500 text-caption font-mono">
                                {{ edId }} active on {{ currentArtifactLabel }}
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        `
    };

    window.AgiEditors = AgiEditors;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-editors'] = AgiEditors;
    window.AgiComponents['AgiEditors'] = AgiEditors;

    const registerComp = () => {
        const app = window.moqui?.webrootVueApp;
        if (app) {
            if (!app.component('agi-editors')) app.component('agi-editors', AgiEditors);
            if (!app.component('AgiEditors')) app.component('AgiEditors', AgiEditors);
        } else {
            setTimeout(registerComp, 30);
        }
    };
    registerComp();

})();