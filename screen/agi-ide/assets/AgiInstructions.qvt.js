(function () {
    const AgiInstructions = {
        name: 'AgiInstructions',
        template: `
            <div class="agi-instructions-container row fit q-col-gutter-md q-pa-md bg-dark text-white" style="min-height: 500px;">
                <div class="col-12 col-md-4">
                    <q-card dark flat bordered class="bg-slate-900">
                        <q-card-section class="q-pa-xs">
                            <div class="text-subtitle2 text-bold text-secondary q-px-sm q-pt-xs">AGI SYSTEM INSTRUCTIONS</div>
                        </q-card-section>
                        <q-separator dark />
                        <q-card-section class="q-pa-xs">
                            <discussion-tree 
                                wiki-space-id="AGI_INSTRUCTION"
                                @node-selected="handleNodeSelected"
                            />
                        </q-card-section>
                    </q-card>
                </div>
                <div class="col-12 col-md-8">
                    <q-card dark flat bordered class="bg-slate-900">
                        <q-card-section class="q-pa-xs">
                            <div class="text-subtitle2 text-bold text-primary q-px-sm q-pt-xs">INSTRUCTION EDITOR</div>
                        </q-card-section>
                        <q-separator dark />
                        <q-card-section class="q-pa-sm">
                            <agi-intent-detail 
                                v-if="selectedNode" 
                                :node="selectedNode"
                                @intent-saved="handleNodeSaved"
                            />
                            <div v-else class="text-grey-5 text-italic q-pa-md text-center">
                                Select an instruction node from the tree to view and edit system instructions.
                            </div>
                        </q-card-section>
                    </q-card>
                </div>
            </div>
        `,
        data() {
            return {
                selectedNode: null
            };
        },
        methods: {
            handleNodeSelected(node) {
                this.selectedNode = node;
            },
            handleNodeSaved(updatedData) {
                if (this.selectedNode && updatedData) {
                    if (updatedData.wikiPageId) this.selectedNode.wikiPageId = updatedData.wikiPageId;
                }
            }
        }
    };

    window.AgiInstructions = AgiInstructions;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-instructions'] = AgiInstructions;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('agi-instructions', AgiInstructions);
            window.moqui.webrootVueApp.component('AgiInstructions', AgiInstructions);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();
