(function () {
    const AgiSubWorkspace = {
        name: 'AgiSubWorkspace',
        template: `
            <q-card flat bordered class="column no-wrap fit" style="height: 100%; width: 100%;">
                <!-- Header Bar -->
                <q-card-section class="q-pa-sm bg-grey-3 row items-center justify-between no-wrap">
                    <div class="text-subtitle2 text-bold text-uppercase">{{ title }}</div>
                    <div class="row q-gutter-xs items-center">
                        <!-- Maximize/Restore Button -->
                        <q-btn 
                            flat 
                            round 
                            dense 
                            size="sm" 
                            :icon="isMaximized ? 'fullscreen_exit' : 'maximize'" 
                            @click="$emit('toggle-maximize', panelName)"
                        >
                            <q-tooltip>
                                {{ isMaximized ? 'Restore Panel' : 'Maximize Panel' }}
                            </q-tooltip>
                        </q-btn>
                        
                        <!-- Detach Button -->
                        <q-btn 
                            flat 
                            round 
                            dense 
                            size="sm" 
                            icon="open_in_new" 
                            @click="$emit('detach-panel', panelName)"
                        >
                            <q-tooltip>Detach to External Window</q-tooltip>
                        </q-btn>
                    </div>
                </q-card-section>
                
                <q-separator></q-separator>
                
                <!-- Body Slot Container -->
                <q-card-section class="col col-stretch q-pa-none relative-position overflow-hidden">
                    <slot></slot>
                </q-card-section>
            </q-card>
        `,
        props: {
            title: {
                type: String,
                default: 'Workspace Panel'
            },
            panelName: {
                type: String,
                required: true
            },
            layoutState: {
                type: Object,
                required: true
            }
        },
        emits: ['toggle-maximize', 'detach-panel'],
        computed: {
            // 🎯 SAFELY EXTRACT STATE FROM THE PROP PACKET
            isMaximized() {
                if (!this.layoutState) return false;
                // If passed the master layout grid dictionary, target this panel's key specifically
                if (this.layoutState[this.panelName]) {
                    return this.layoutState[this.panelName].state === 'maximized';
                }
                // Fallback for standalone direct block assignment
                return this.layoutState.state === 'maximized';
            }
        }
    };

    window.AgiSubWorkspace = AgiSubWorkspace;

    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-sub-workspace'] = AgiSubWorkspace;

    // 🎯 SAFE ASYNC BOOTSTRAP APPMOUNT REGISTRATION
    const registerAgiSubWorkspace = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            if (!window.moqui.webrootVueApp.component('agi-sub-workspace')) {
                window.moqui.webrootVueApp.component('agi-sub-workspace', AgiSubWorkspace);
                console.info("🚀 [AGI] Registered 'agi-sub-workspace' dependency cleanly.");
            }
        } else {
            setTimeout(registerAgiSubWorkspace, 50);
        }
    };

    registerAgiSubWorkspace();
})();