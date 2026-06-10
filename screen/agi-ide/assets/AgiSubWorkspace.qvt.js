(function() {
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
                            :icon="layoutState && layoutState.state === 'maximized' ? 'fullscreen_exit' : 'maximize'" 
                            @click="$emit('toggle-maximize', panelName)"
                        >
                            <q-tooltip>
                                {{ layoutState && layoutState.state === 'maximized' ? 'Restore Panel' : 'Maximize Panel' }}
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
        emits: ['toggle-maximize', 'detach-panel']
    };

    window.AgiSubWorkspace = AgiSubWorkspace;
})();
