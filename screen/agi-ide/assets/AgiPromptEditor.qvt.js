(function () {
    const AgiPromptEditor = {
        name: 'AgiPromptEditor',
        components: {
            'discussion-tree': {
                name: 'DiscussionTreeProxy',
                render() {
                    const comp = window.DiscussionTree || window.AgiComponents?.['discussion-tree'] || (window.moqui && window.moqui.webrootVueApp?._context?.components?.['discussion-tree']);
                    return comp ? Vue.h(comp, this.$attrs, this.$slots) : null;
                }
            },
            'discussion-detail': {
                name: 'DiscussionDetailProxy',
                render() {
                    const comp = window.DiscussionDetail || window.AgiComponents?.['discussion-detail'] || (window.moqui && window.moqui.webrootVueApp?._context?.components?.['discussion-detail']);
                    return comp ? Vue.h(comp, this.$attrs, this.$slots) : null;
                }
            },
            'agi-intent-detail': {
                name: 'AgiIntentDetailProxy',
                render() {
                    const comp = window.AgiIntentDetail || window.AgiComponents?.['agi-intent-detail'] || (window.moqui && window.moqui.webrootVueApp?._context?.components?.['agi-intent-detail']);
                    return comp ? Vue.h(comp, this.$attrs, this.$slots) : null;
                }
            },
            'agi-artifact-palette': {
                name: 'AgiArtifactPaletteProxy',
                render() {
                    const comp = window.AgiArtifactPalette || window.AgiComponents?.['agi-artifact-palette'] || (window.moqui && window.moqui.webrootVueApp?._context?.components?.['agi-artifact-palette']);
                    return comp ? Vue.h(comp, this.$attrs, this.$slots) : null;
                }
            }
        },
        template: `
            <q-dialog v-model="isOpen" position="top" @hide="onDialogClosed">
                <q-card class="agi-prompt-editor-card bg-slate-900 shadow-24 q-mt-sm column no-wrap" style="width: 1240px; max-width: 96vw; height: 90vh;">
                    
                    <!-- 1. STUDIO HEADER: BREADCRUMB FOCUS COORDINATE -->
                    <q-card-section class="q-pa-xs bg-slate-950 row items-center justify-between border-bottom-dark" style="border-bottom: 1px solid #334155;">
                        <div class="row items-center q-gutter-x-sm">
                            <q-icon name="psychology" color="primary" size="sm" />
                            <span class="text-subtitle2 text-weight-bold font-mono">AGI COMMAND STUDIO</span>
                        </div>
                    
                        <div class="col q-mx-md row items-center no-wrap overflow-hidden">
                            <q-breadcrumbs active-color="purple-3" class="text-caption font-mono text-grey-4" separator-color="grey-6">
                                <template v-slot:separator>
                                    <q-icon size="10px" name="chevron_right" color="grey-6" />
                                </template>
                    
                                <q-breadcrumbs-el 
                                    v-for="(crumb, idx) in breadcrumbSegments" 
                                    :key="idx" 
                                    :label="crumb.label" 
                                    :icon="crumb.icon"
                                    :class="crumb.isTarget ? 'text-weight-bolder text-purple-3 bg-slate-900 q-px-xs rounded-borders' : ''"
                                />
                            </q-breadcrumbs>
                        </div>
                    
                        <div class="row items-center q-gutter-x-xs">
                            <q-btn flat dense round icon="manage_search" size="xs" color="cyan-4" @click="showPalette = !showPalette">
                                <q-tooltip>Browse / Switch Focus Artifact</q-tooltip>
                            </q-btn>
                            <q-btn flat round dense icon="close" text-color="white" v-close-popup />
                        </div>
                    </q-card-section>

                    <!-- Inline Artifact Palette Drawer -->
                    <q-slide-transition>
                        <div v-if="showPalette" class="bg-slate-950 border-bottom-dark q-pa-xs" style="border-bottom: 1px solid #334155;">
                            <div class="row items-center justify-between q-px-xs q-mb-xs">
                                <span class="text-caption text-weight-bold text-cyan-4 font-mono">FOCUS WORKSPACE ARTIFACT</span>
                                <q-btn flat dense icon="close" size="xs" color="grey-5" @click="showPalette = false" />
                            </div>
                            <agi-artifact-palette @artifact-selected="onArtifactSelectedFromPalette" />
                        </div>
                    </q-slide-transition>

                    <!-- 2. OVERARCHING TASK PROMPT & DISPATCH BAR -->
                    <div class="bg-slate-950 q-pa-sm border-bottom-dark" style="border-bottom: 1px solid #334155;">
                        <div class="row items-start q-col-gutter-sm">
                            <div class="col">
                                <q-input 
                                    ref="promptInput"
                                    v-model="userPrompt" 
                                    type="textarea"
                                    rows="2"
                                    placeholder="Type task prompt or '/' for MCP tools (e.g. 'Generate room lookup screen using lookup-modal archetype')..." 
                                    outlined 
                                    dense 
                                    bg-color="slate-900"
                                    input-class="font-mono text-caption"
                                    :disable="isExecuting"
                                    @update:model-value="onPromptInput"
                                    @keydown.ctrl.enter="handleDirectDispatch"
                                    @keydown.esc="isOpen = false"
                                />
                            </div>
                            <div class="col-auto column q-gutter-y-xs">
                                <q-btn 
                                    color="positive" 
                                    icon="bolt" 
                                    label="Dispatch Turn" 
                                    no-caps 
                                    class="q-px-md font-mono text-weight-bold full-width" 
                                    style="height: 38px;"
                                    :loading="isExecuting" 
                                    @click="handleDirectDispatch" 
                                />
                                <div class="row items-center justify-between text-caption font-mono text-grey-5" style="font-size: 10px;">
                                    <span>Ctrl+Enter</span>
                                    <q-btn flat dense size="xs" color="cyan-4" icon="refresh" label="Reset Buffer" @click="syncControlsToAssemblyBuffer" />
                                </div>
                            </div>
                        </div>

                        <!-- Dynamic Tool Parameters -->
                        <q-slide-transition>
                            <div v-if="selectedCommand" class="q-mt-xs q-pa-xs bg-slate-900 rounded-borders border-dark row items-center q-gutter-x-sm" style="border: 1px solid #334155;">
                                <q-chip color="primary" text-color="white" dense size="sm" icon="build" removable @remove="clearSelectedCommand">
                                    {{ selectedCommand.command }}
                                </q-chip>
                                <span class="text-caption text-grey-4 ellipsis" style="max-width: 220px;">{{ selectedCommand.description }}</span>
                                
                                <div v-for="param in visibleParams" :key="param.name" class="col-auto">
                                    <q-input 
                                        v-model="commandParamValues[param.name]" 
                                        :label="param.name" 
                                        dense 
                                        outlined 
                                        class="text-caption font-mono" 
                                        style="min-width: 140px;"
                                    />
                                </div>
                            </div>
                        </q-slide-transition>

                        <!-- Slash Command Autocomplete Dropdown -->
                        <div 
                            v-if="showCommandList && availableCommands.length > 0" 
                            class="q-mt-xs rounded-borders border-dark q-pa-xs max-h-36 overflow-y-auto shadow-8"
                            style="background-color: #020617; border: 1px solid #334155;"
                        >
                            <q-list dense separator>
                                <q-item 
                                    v-for="cmd in availableCommands" 
                                    :key="cmd.command" 
                                    clickable 
                                    v-ripple 
                                    @click="selectCommand(cmd)"
                                    class="rounded-borders q-my-xs"
                                    style="background-color: #0f172a;"
                                >
                                    <q-item-section avatar min-width="24px">
                                        <q-icon name="bolt" color="cyan-4" size="xs" />
                                    </q-item-section>
                                    <q-item-section>
                                        <q-item-label class="font-mono text-caption text-cyan-4">{{ cmd.command }}</q-item-label>
                                        <q-item-label caption class="text-slate-400 ellipsis" style="font-size: 10px;">{{ cmd.description }}</q-item-label>
                                    </q-item-section>
                                </q-item>
                            </q-list>
                        </div>
                    </div>

                    <!-- 3. TWO-PANE MAIN WORKSPACE -->
                    <div class="col row no-wrap overflow-hidden bg-slate-900">
                        
                        <!-- ========================================================================= -->
                        <!-- LEFT PANE: GROUNDING CONTROLS (42% Width)                                 -->
                        <!-- ========================================================================= -->
                        <div class="col-5 column no-wrap border-right-dark bg-slate-950 q-pa-sm" style="border-right: 1px solid #334155; overflow-y: auto;">
                            
                            <!-- A. TARGET SCOPE & FOCUS COORDINATE (WHERE) -->
                            <div class="q-mb-xs q-pa-xs rounded-borders bg-slate-900" style="border: 1px solid #334155;">
                                <div class="row items-center justify-between q-px-xs q-mb-xs">
                                    <div class="row items-center q-gutter-x-xs text-caption font-mono text-weight-bold text-cyan-4">
                                        <q-icon name="gps_fixed" size="xs" />
                                        <span>1. TARGET COORDINATE (WHERE)</span>
                                    </div>
                                    <q-btn v-if="focusedElementId" flat dense size="xs" color="grey-5" icon="close" label="Clear Focus" @click="clearFocusedCoordinate" />
                                </div>

                                <div class="q-pa-xs font-mono text-caption">
                                    <div class="row items-center justify-between q-mb-xs">
                                        <q-checkbox 
                                            v-model="includeTargetCoordinate" 
                                            label="Include Target AST Slice" 
                                            dense dark color="secondary" 
                                            @update:model-value="syncControlsToAssemblyBuffer"
                                        />
                                    </div>

                                    <div class="row items-center q-gutter-xs q-mt-xs">
                                        <q-chip 
                                            v-for="(seg, sIdx) in parsedCoordinateArray" 
                                            :key="sIdx" 
                                            dense size="sm" 
                                            :color="sIdx === parsedCoordinateArray.length - 1 ? 'deep-purple-8' : 'slate-800'" 
                                            text-color="white"
                                            class="font-mono text-caption"
                                        >
                                            {{ seg }}
                                        </q-chip>
                                    </div>
                                </div>
                            </div>

                            <!-- B. ARCHETYPES & MCP RESOURCES (STRUCTURE) -->
                            <q-expansion-item 
                                default-opened dense
                                header-class="bg-slate-900 text-cyan-4 text-weight-bold font-mono text-caption q-pa-xs rounded-borders q-mt-xs"
                                icon="architecture"
                                label="2. CANONICAL ARCHETYPES (STRUCTURE)"
                            >
                                <div class="q-pa-xs font-mono text-caption">
                                    <div class="row items-center justify-between q-mb-xs">
                                        <span class="text-caption text-grey-4 text-weight-bold">CANONICAL BLUEPRINTS</span>
                                        <q-btn flat dense icon="refresh" size="xs" color="cyan-4" label="Rescan" @click="fetchMcpArchetypes" />
                                    </div>

                                    <div class="row q-gutter-xs items-center q-mb-xs">
                                        <q-chip 
                                            v-for="arch in availableArchetypes" 
                                            :key="arch.uri"
                                            v-model:selected="arch.selected"
                                            clickable
                                            dense
                                            color="slate-800"
                                            text-color="white"
                                            :class="{ 'bg-cyan-9 text-white': arch.selected }"
                                            icon="code"
                                            @click="toggleArchetype(arch)"
                                        >
                                            {{ arch.name }} ({{ arch.component }})
                                        </q-chip>
                                        <div v-if="availableArchetypes.length === 0" class="text-caption text-grey-5 italic">
                                            No archetypes found under mcp/resources/screen/archetype/
                                        </div>
                                    </div>

                                    <!-- Quick Archetype Preview Drawer -->
                                    <q-expansion-item 
                                        v-if="selectedArchetypePreview" 
                                        dense 
                                        header-class="bg-slate-950 text-caption text-amber-4 rounded-borders q-pa-xs"
                                        :label="'Blueprint: ' + selectedArchetypePreview.name"
                                        default-opened
                                    >
                                        <pre class="q-pa-xs bg-slate-950 text-grey-3 rounded-borders overflow-auto" style="font-size: 10px; max-height: 120px; border: 1px solid #1e293b;">{{ selectedArchetypePreview.xml }}</pre>
                                    </q-expansion-item>
                                </div>
                            </q-expansion-item>

                            <!-- C. DATA GROUNDING & ENTITY MODEL (DATA) -->
                            <q-expansion-item 
                                default-opened dense
                                header-class="bg-slate-900 text-teal-4 text-weight-bold font-mono text-caption q-pa-xs rounded-borders q-mt-xs"
                                icon="storage"
                                label="3. DATA GROUNDING (DATA)"
                            >
                                <div class="q-pa-xs q-gutter-y-xs font-mono text-caption">
                                    <div class="text-caption text-grey-4 text-weight-bold q-mb-xs">DETECTED ENTITIES &amp; SCHEMAS</div>
                                    <q-list dense separator class="bg-black rounded-borders max-h-32 overflow-y-auto">
                                        <q-item v-for="(ent, idx) in detectedEntities" :key="idx" tag="label" class="q-pa-xs" v-ripple>
                                            <q-item-section side top>
                                                <q-checkbox v-model="ent.enabled" dense color="secondary" @update:model-value="syncControlsToAssemblyBuffer" />
                                            </q-item-section>
                                            <q-item-section>
                                                <q-item-label class="text-weight-bold text-caption text-secondary">
                                                    {{ ent.entityName }}
                                                    <q-badge v-if="ent.isPrimary" color="purple-8" class="q-ml-xs text-caption" style="font-size: 8px;">Primary</q-badge>
                                                </q-item-label>
                                                <q-item-label caption class="text-grey-5" style="font-size: 9px;">
                                                    {{ Object.keys(ent.fields || {}).length }} fields | {{ (ent.relationships || []).length }} relationships
                                                </q-item-label>
                                            </q-item-section>
                                        </q-item>
                                        <q-item v-if="detectedEntities.length === 0" class="q-pa-xs">
                                            <q-item-section class="text-grey-5 italic text-center" style="font-size: 10px;">
                                                No direct entity mappings detected.
                                            </q-item-section>
                                        </q-item>
                                    </q-list>

                                    <!-- AST & XML Inclusion Checkboxes -->
                                    <div class="row items-center q-gutter-x-xs q-mt-xs">
                                        <q-checkbox v-model="includeFullAst" dense dark color="cyan-4" label="Full Screen AST" @update:model-value="syncControlsToAssemblyBuffer" />
                                        <q-checkbox v-model="includeRawXml" dense dark color="cyan-4" label="Raw XML" @update:model-value="syncControlsToAssemblyBuffer" />
                                    </div>
                                </div>
                            </q-expansion-item>

                            <!-- D. BUSINESS INTENT HIERARCHY (WHY) -->
                            <q-expansion-item 
                                default-opened dense
                                header-class="bg-slate-900 text-purple-3 text-weight-bold font-mono text-caption q-pa-xs rounded-borders q-mt-xs"
                                icon="account_tree"
                                label="4. BUSINESS INTENT &amp; THREADS (WHY)"
                            >
                                <div class="q-pa-xs bg-black rounded-borders" style="min-height: 140px; max-height: 180px; overflow-y: auto; border: 1px solid #1e293b;">
                                    <discussion-tree 
                                        :key="blueprintTreeKey"
                                        wiki-space-id="AGI_INTENT"
                                        :agi-artifact-id="targetArtifactId || ''"
                                        :source-reference-id="activeArtifactLocation || ''">
                                        <template v-slot:node-detail="{ node }">
                                            <discussion-detail :node="node">
                                                <div class="q-pa-xs row items-center justify-between bg-slate-900 rounded-borders q-mb-xs">
                                                    <q-checkbox 
                                                        v-model="selectedIntents" 
                                                        :val="node.wikiPageId || node.id" 
                                                        label="Attach to Staged Buffer" 
                                                        dark 
                                                        dense 
                                                        color="secondary" 
                                                        @update:model-value="syncControlsToAssemblyBuffer"
                                                    />
                                                </div>
                                                <agi-intent-detail 
                                                    :node="node" 
                                                    :selected-artifact="{ agiArtifactId: targetArtifactId, artifactPath: activeArtifactLocation }"
                                                />
                                            </discussion-detail>
                                        </template>
                                    </discussion-tree>
                                </div>
                            </q-expansion-item>

                            <!-- E. GOVERNANCE RULES -->
                            <q-expansion-item 
                                default-opened dense
                                header-class="bg-slate-900 text-amber-4 text-weight-bold font-mono text-caption q-pa-xs rounded-borders q-mt-xs"
                                icon="gavel"
                                label="5. GOVERNANCE &amp; COMPLIANCE"
                            >
                                <div class="q-pa-xs q-gutter-y-xs font-mono text-caption">
                                    <q-list dense separator class="bg-black rounded-borders">
                                        <q-item v-for="(rule, idx) in governanceRules" :key="idx" tag="label" class="q-pa-xs" v-ripple>
                                            <q-item-section side top>
                                                <q-checkbox v-model="rule.enabled" dense color="secondary" @update:model-value="syncControlsToAssemblyBuffer" />
                                            </q-item-section>
                                            <q-item-section>
                                                <q-item-label class="text-weight-bold text-caption text-secondary">{{ rule.title }}</q-item-label>
                                                <q-item-label caption class="text-grey-4" style="font-size: 10px;">{{ rule.snippet }}</q-item-label>
                                            </q-item-section>
                                        </q-item>
                                    </q-list>
                                </div>
                            </q-expansion-item>

                            <!-- F. PROVENANCE & HISTORY -->
                            <q-expansion-item 
                                dense
                                header-class="bg-slate-900 text-grey-4 text-weight-bold font-mono text-caption q-pa-xs rounded-borders q-mt-xs"
                                icon="history"
                                label="6. PROVENANCE &amp; HISTORY"
                            >
                                <div class="q-pa-xs bg-black rounded-borders max-h-32 overflow-y-auto">
                                    <q-list separator dense v-if="promptHistory.length > 0">
                                        <q-item v-for="(hist, idx) in promptHistory" :key="idx" class="q-pa-xs">
                                            <q-item-section>
                                                <div class="row items-center justify-between">
                                                    <span class="font-mono text-caption text-primary" style="font-size: 10px;">{{ hist.timestamp }}</span>
                                                    <q-btn flat dense size="xs" color="secondary" icon="tune" label="Fork" @click="forkHistoryTurn(hist)" />
                                                </div>
                                                <div class="text-slate-300 font-mono ellipsis" style="font-size: 11px;">{{ hist.text }}</div>
                                            </q-item-section>
                                        </q-item>
                                    </q-list>
                                    <div v-else class="text-center text-grey-5 italic q-pa-xs text-caption">No prior turns in this session.</div>
                                </div>
                            </q-expansion-item>

                        </div>

                        <!-- ========================================================================= -->
                        <!-- RIGHT PANE: STAGED RAG ASSEMBLY BUFFER (58% Width - EDITABLE)             -->
                        <!-- ========================================================================= -->
                        <div class="col-7 column no-wrap bg-slate-900 q-pa-sm justify-between">
                            
                            <div class="row items-center justify-between q-mb-xs">
                                <div class="row items-center q-gutter-x-xs text-caption font-mono text-weight-bold text-cyan-4">
                                    <q-icon name="terminal" size="xs" />
                                    <span>STAGED RAG ASSEMBLY BUFFER (EDITABLE GROUNDING)</span>
                                </div>
                                <span class="text-caption font-mono text-grey-5" style="font-size: 11px;">Exact payload synthesized for Agent</span>
                            </div>

                            <!-- Editable Unified Buffer Textarea -->
                            <textarea 
                                v-model="stagedAssemblyBuffer"
                                class="col full-width font-mono text-caption q-pa-sm rounded-borders"
                                style="background-color: #020617; color: #f8fafc; border: 1px solid #334155; resize: none; font-size: 11px; line-height: 16px; font-family: monospace;"
                                placeholder="/* Staged assembly buffer automatically populates from left controls. You can make ad-hoc edits directly here before dispatching... */"
                            ></textarea>

                            <!-- Bottom Status Summary -->
                            <div class="q-mt-xs q-pa-xs bg-slate-950 rounded-borders row items-center justify-between text-caption font-mono text-grey-4" style="border: 1px solid #1e293b;">
                                <div class="row items-center q-gutter-x-sm">
                                    <q-badge color="purple-8">{{ includeTargetCoordinate && focusedElementId ? 'Target: <' + displayTargetTag + '>' : 'Root Target' }}</q-badge>
                                    <q-badge color="cyan-9">{{ activeArchetypesCount }} Archetypes</q-badge>
                                    <q-badge color="teal-9">{{ activeEntitiesCount }} Entities</q-badge>
                                    <q-badge color="deep-purple-8">{{ selectedIntents.length }} Intents</q-badge>
                                    <q-badge color="secondary">{{ activeRulesCount }} Rules</q-badge>
                                </div>
                                <span style="font-size: 11px;">Ready for Agent Compilation</span>
                            </div>

                        </div>

                    </div>

                </q-card>
            </q-dialog>
        `,
        data() {
            return {
                isOpen: false,
                userPrompt: '',
                targetComponent: 'nursinghome',
                activeArtifactLocation: '',
                targetArtifactId: '',
                focusedElementId: '',
                blueprintTreeKey: 1,
                isExecuting: false,
                showCommandList: false,
                showPalette: false,
                selectedCommand: null,
                commandParamValues: {},
                rawAstObject: null,
                rawXmlSource: '',
                promptHistory: [],
                registeredCommands: [],

                // Archetypes & MCP Resources
                availableArchetypes: [],
                selectedArchetypePreview: null,
                archetypeContentCache: {},

                // Left Pane Grounding Controls State
                includeTargetCoordinate: true,
                includeFullAst: false,
                includeRawXml: false,
                detectedEntities: [],
                selectedIntents: [],
                governanceRules: [
                    { title: 'HIPAA PHI Encryption', snippet: 'Enforce encrypt="true" on PHI/PII fields; enable-audit-log="true" on sensitive entities', enabled: true },
                    { title: 'UDM Reuse First', snippet: 'Extend Mantle UDM entities before defining custom tables', enabled: true },
                    { title: 'Strict xml-screen-3.xsd', snippet: 'Never wrap <hidden/> or <display/> in <container name="...">; use declarative forms', enabled: true }
                ],

                // Right Pane Editable Assembly Buffer
                stagedAssemblyBuffer: ''
            };
        },
        computed: {
            displayTargetTag() {
                if (!this.focusedElementId) return 'screen';
                const parts = this.focusedElementId.split('#');
                return parts[parts.length - 1];
            },

            parsedCoordinateArray() {
                const segs = [];

                if (this.activeArtifactLocation) {
                    let clean = this.activeArtifactLocation.replace(/^component:\/\//, '');
                    const rawParts = clean.split('/').filter(p => p && p !== 'screen');
                    rawParts.forEach(p => {
                        if (segs.length === 0 || segs[segs.length - 1] !== p) {
                            segs.push(p);
                        }
                    });
                }

                if (this.focusedElementId) {
                    if (!this.focusedElementId.includes('AgiWorkspace') && !this.focusedElementId.includes('agi-workspace-root')) {
                        const subParts = this.focusedElementId.split('#').filter(Boolean);
                        subParts.forEach(sub => {
                            if (!['container-box', 'box-body', 'box-header', 'container'].includes(sub)) {
                                if (!segs.includes(sub)) {
                                    segs.push(sub);
                                }
                            }
                        });
                    }
                }

                return segs;
            },

            breadcrumbSegments() {
                const list = [];
                const arr = this.parsedCoordinateArray;
                if (arr.length === 0) {
                    return [{ label: 'Global Scope', icon: 'public', isTarget: false }];
                }

                arr.forEach((item, idx) => {
                    const isLast = idx === arr.length - 1;
                    let icon = 'folder';

                    if (idx === 0) icon = 'apps';
                    else if (item.endsWith('.xml')) icon = 'code';
                    else if (isLast && this.focusedElementId && !this.focusedElementId.includes('agi-workspace-root')) {
                        icon = 'gps_fixed';
                    }

                    list.push({
                        label: item,
                        icon: icon,
                        isTarget: isLast && !!this.focusedElementId && !this.focusedElementId.includes('agi-workspace-root')
                    });
                });
                return list;
            },

            availableCommands() {
                if (!this.userPrompt.startsWith('/')) return [];
                const search = this.userPrompt.toLowerCase();
                return this.registeredCommands.filter(c => c.command.toLowerCase().includes(search));
            },
            visibleParams() {
                if (!this.selectedCommand || !this.selectedCommand.params) return [];
                return this.selectedCommand.params.filter(p => !p.internal);
            },
            activeArchetypesCount() {
                return this.availableArchetypes.filter(a => a.selected).length;
            },
            activeEntitiesCount() {
                return this.detectedEntities.filter(e => e.enabled).length;
            },
            activeRulesCount() {
                return this.governanceRules.filter(r => r.enabled).length;
            }
        },

        mounted() {
            const vm = this;
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = function (event) {
                if (!event.data) return;

                if (event.data.event === 'element-selected-by-id' && event.data.mariaId) {
                    if (!event.data.mariaId.includes('agi-workspace-root') && !event.data.mariaId.includes('AgiWorkspace')) {
                        vm.focusedElementId = event.data.mariaId;
                        vm.includeTargetCoordinate = true;
                        vm.syncControlsToAssemblyBuffer();
                    }
                    return;
                }

                if (event.data.event === 'force-open-command-palette' || event.data.event === 'open-prompt-editor') {
                    vm.targetComponent = event.data.targetComponent || 'nursinghome';
                    vm.activeArtifactLocation = event.data.artifactLocation || vm.activeArtifactLocation || '';
                    vm.targetArtifactId = event.data.agiArtifactId || '';

                    let coord = event.data.focusCoordinate || vm.focusedElementId || '';
                    if (coord.includes('agi-workspace-root')) {
                        coord = vm.focusedElementId && !vm.focusedElementId.includes('agi-workspace-root') ? vm.focusedElementId : '';
                    }

                    vm.focusedElementId = coord;
                    vm.includeTargetCoordinate = !!coord;

                    vm.isOpen = true;
                    vm.fetchDynamicTools();
                    vm.fetchMcpArchetypes();
                    if (vm.activeArtifactLocation) {
                        vm.fetchActiveRagContext(vm.activeArtifactLocation);
                    } else {
                        vm.syncControlsToAssemblyBuffer();
                    }
                }
            };

            this.fetchDynamicTools();
            this.fetchMcpArchetypes();
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },
        methods: {
            resolveCsrfToken() {
                return window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || (window.opener && window.opener.moqui && window.opener.moqui.moquiSessionToken)
                    || (document.querySelector('meta[name="moqui-session-token"]')?.getAttribute('content'))
                    || "";
            },

            clearFocusedCoordinate() {
                this.focusedElementId = '';
                this.includeTargetCoordinate = false;
                this.syncControlsToAssemblyBuffer();
            },

            onPromptInput(val) {
                this.showCommandList = val.startsWith('/') && !this.selectedCommand;
            },

            onDialogClosed() {
                this.userPrompt = '';
                this.showPalette = false;
                this.clearSelectedCommand();
            },

            onArtifactSelectedFromPalette(item) {
                this.activeArtifactLocation = item.value;
                this.fetchActiveRagContext(item.value);
                this.showPalette = false;

                if (this.selectedCommand && this.commandParamValues.hasOwnProperty('artifactUri')) {
                    this.commandParamValues['artifactUri'] = item.value;
                }
            },

            selectCommand(cmd) {
                this.selectedCommand = cmd;
                this.showCommandList = false;
                this.userPrompt = cmd.command + ' ';
                this.commandParamValues = {};

                if (cmd.params) {
                    cmd.params.forEach(p => {
                        this.commandParamValues[p.name] = '';
                    });
                }
            },

            clearSelectedCommand() {
                this.selectedCommand = null;
                this.userPrompt = '';
                this.commandParamValues = {};
            },

            // 🛠️ Fetch Dynamic MCP Tools via REST
            async fetchDynamicTools() {
                const vm = this;
                const headers = { 'moquiSessionToken': this.resolveCsrfToken() };

                try {
                    const response = await axios.get('/rest/s1/agi-ide/mcp/tools', { headers });
                    const data = response.data || {};
                    const rawTools = data.tools || [];

                    vm.registeredCommands = rawTools.map(t => ({
                        command: t.name ? '/' + t.name.replace(/__/g, '/').replace(/_/g, '-') : '/tool',
                        rawName: t.name,
                        serviceName: t.serviceCallName || t.name,
                        description: t.description || 'MCP Tool',
                        params: t.inputSchema?.properties ? Object.keys(t.inputSchema.properties).map(pKey => ({
                            name: pKey,
                            type: t.inputSchema.properties[pKey].type || 'string',
                            description: t.inputSchema.properties[pKey].description || ''
                        })) : []
                    }));
                } catch (err) {
                    console.warn("Could not load dynamic MCP tools:", err);
                }
            },

            // 📐 Fetch MCP Archetype Resources via REST
            async fetchMcpArchetypes() {
                const vm = this;
                const headers = { 'moquiSessionToken': this.resolveCsrfToken() };

                try {
                    const response = await axios.get('/rest/s1/agi-ide/mcp/resources', {
                        params: { category: 'screen', subCategory: 'archetype' },
                        headers: headers
                    });

                    const resList = response.data?.resources || [];
                    vm.availableArchetypes = resList.map(r => ({
                        ...r,
                        selected: r.name === 'lookup-modal' // Default selected for search/lookup workflows
                    }));

                    // Preload default archetype content
                    const defaultArch = vm.availableArchetypes.find(a => a.selected);
                    if (defaultArch) {
                        await vm.loadArchetypeContent(defaultArch);
                    }
                    vm.syncControlsToAssemblyBuffer();
                } catch (err) {
                    console.warn("Could not load MCP archetypes:", err);
                }
            },

            async loadArchetypeContent(arch) {
                if (this.archetypeContentCache[arch.uri]) {
                    this.selectedArchetypePreview = {
                        name: arch.name,
                        xml: this.archetypeContentCache[arch.uri]
                    };
                    return this.archetypeContentCache[arch.uri];
                }

                try {
                    const resp = await axios.get('/rest/s1/agi-ide/mcp/resources/content', {
                        params: { uri: arch.uri },
                        headers: { 'moquiSessionToken': this.resolveCsrfToken() }
                    });

                    const xmlText = resp.data?.contents?.[0]?.text || '';
                    this.archetypeContentCache[arch.uri] = xmlText;
                    this.selectedArchetypePreview = {
                        name: arch.name,
                        xml: xmlText
                    };
                    return xmlText;
                } catch (err) {
                    console.error("Could not fetch archetype content:", err);
                    return '';
                }
            },

            async toggleArchetype(arch) {
                await this.loadArchetypeContent(arch);
                this.syncControlsToAssemblyBuffer();
            },

            async fetchActiveRagContext(artifactUri) {
                if (!artifactUri) return;
                const vm = this;
                const headers = { 'moquiSessionToken': this.resolveCsrfToken() };
                const openBraceChar = String.fromCharCode(123);

                // 1. Load Workspace Buffer AST
                try {
                    const response = await axios.get('/rest/s1/agi-ide/getWorkspaceBuffer', {
                        params: { artifactUri: artifactUri },
                        headers: headers
                    });

                    const bufData = response.data || {};
                    let astTree = bufData.metaJsonBuffer || bufData.layoutTree || null;

                    if (typeof astTree === 'string' && astTree.trim().indexOf(openBraceChar) === 0) {
                        try { astTree = JSON.parse(astTree); } catch (e) { }
                    }

                    vm.rawAstObject = astTree;
                    vm.rawXmlSource = bufData.rawXmlContent || '';
                } catch (err) {
                    console.warn("Could not load workspace buffer AST:", err);
                    vm.rawAstObject = null;
                }

                // 2. Fetch Entity Definitions via Backend Introspection Service
                try {
                    const entityResp = await axios.get('/rest/s1/agi-ide/getScreenEntityGrounding', {
                        params: { artifactUri: artifactUri },
                        headers: headers
                    });
                    vm.detectedEntities = (entityResp.data?.detectedEntities || []).map(ent => ({
                        ...ent,
                        enabled: ent.enabled !== undefined ? ent.enabled : true
                    }));
                } catch (err) {
                    console.warn("Could not introspect screen entities, using standard fallback:", err);
                    vm.detectedEntities = [
                        {
                            entityName: 'nursinghome.facility.Room',
                            isPrimary: true,
                            enabled: true,
                            fields: {
                                facilityId: { type: 'id', isPk: true },
                                parentFacilityId: { type: 'id' },
                                facilityName: { type: 'text-medium' },
                                statusId: { type: 'id' }
                            },
                            relationships: [{ relatedEntity: 'mantle.facility.Facility', type: 'one' }]
                        }
                    ];
                }

                vm.syncControlsToAssemblyBuffer();
            },

            // 🎯 SYNTHESIS ENGINE: Synthesizes Archetypes, Schemas, Entities, and AST into Assembly Buffer
            syncControlsToAssemblyBuffer() {
                const lines = [];

                // 1. Target Scope Section
                if (this.includeTargetCoordinate && this.focusedElementId && this.rawAstObject) {
                    const targetName = this.focusedElementId.split('#').pop();

                    const findNode = (node) => {
                        if (!node || typeof node !== 'object') return null;
                        const attrName = node.attributes?.name;
                        const mId = node.mariaId || node.id;
                        if (attrName === targetName || mId === this.focusedElementId) return node;
                        const children = node.children || node.widgets || [];
                        if (Array.isArray(children)) {
                            for (let child of children) {
                                const found = findNode(child);
                                if (found) return found;
                            }
                        }
                        return null;
                    };

                    const focusedNode = findNode(this.rawAstObject);

                    lines.push("/* ========================================================================= */");
                    lines.push(`/* [1. TARGET SCOPE & FOCUSED AST SLICE]: <field name="${targetName}"> */`);
                    lines.push(`/* Coordinate ID: ${this.focusedElementId} */`);
                    lines.push("/* ========================================================================= */");

                    if (focusedNode) {
                        lines.push(JSON.stringify(focusedNode, null, 2));
                    } else {
                        lines.push(`/* Node snippet for [${targetName}] not found in top-level AST */`);
                        lines.push(`[Target Coordinate]: ${this.focusedElementId}`);
                    }
                    lines.push("");
                } else {
                    lines.push("/* ========================================================================= */");
                    lines.push("/* [1. TARGET SCOPE]: Entire Screen / Root Container                         */");
                    lines.push("/* ========================================================================= */");
                    lines.push("");
                }

                // 2. Canonical Archetypes (Blueprints)
                const activeArchs = this.availableArchetypes.filter(a => a.selected);
                if (activeArchs.length > 0) {
                    lines.push("/* ========================================================================= */");
                    lines.push(`/* [2. CANONICAL ARCHETYPE BLUEPRINTS]: ${activeArchs.length} Selected               */`);
                    lines.push("/* ========================================================================= */");
                    activeArchs.forEach(arch => {
                        const cachedXml = this.archetypeContentCache[arch.uri] || "";
                        lines.push(`/* Archetype: ${arch.name} (${arch.uri}) */`);
                        if (cachedXml) {
                            lines.push(cachedXml);
                        } else {
                            lines.push(`/* Archetype URI: ${arch.uri} */`);
                        }
                        lines.push("");
                    });
                }

                // 3. Data Grounding & Schemas Section
                const activeEntities = (this.detectedEntities || []).filter(e => e.enabled);
                lines.push("/* ========================================================================= */");
                lines.push(`/* [3. DATA GROUNDING & SCHEMAS]: ${activeEntities.length} Entities Selected             */`);
                lines.push("/* ========================================================================= */");

                activeEntities.forEach(ent => {
                    lines.push(`/* Entity: ${ent.entityName} ${ent.isPrimary ? '(Primary Target)' : ''} */`);
                    lines.push(JSON.stringify({
                        entityName: ent.entityName,
                        fields: ent.fields || {},
                        relationships: ent.relationships || []
                    }, null, 2));
                    lines.push("");
                });

                if (this.includeFullAst && this.rawAstObject) {
                    lines.push("/* Full Screen Blueprint AST: */");
                    lines.push(JSON.stringify(this.rawAstObject, null, 2));
                    lines.push("");
                }
                if (this.includeRawXml && this.rawXmlSource) {
                    lines.push("/* Raw Screen XML Source: */");
                    lines.push(this.rawXmlSource);
                    lines.push("");
                }

                // 4. Business Intent Grounding
                if (this.selectedIntents.length > 0) {
                    lines.push("/* ========================================================================= */");
                    lines.push(`/* [4. BUSINESS INTENT SPECIFICATIONS]: ${this.selectedIntents.length} attached            */`);
                    lines.push("/* ========================================================================= */");
                    this.selectedIntents.forEach(id => {
                        lines.push(`- Intent Node: ${id}`);
                    });
                    lines.push("");
                }

                // 5. Governance Rules
                const activeRules = this.governanceRules.filter(r => r.enabled);
                if (activeRules.length > 0) {
                    lines.push("/* ========================================================================= */");
                    lines.push("/* [5. GOVERNANCE & COMPLIANCE DIRECTIVES]                                   */");
                    lines.push("/* ========================================================================= */");
                    activeRules.forEach(r => {
                        lines.push(`* ${r.title}: ${r.snippet}`);
                    });
                    lines.push("");
                }

                // 6. Ad-hoc Directives Workspace
                lines.push("/* ========================================================================= */");
                lines.push("/* [6. AD-HOC SYSTEM DIRECTIVES & NOTES] (Type custom notes below)           */");
                lines.push("/* ========================================================================= */");

                this.stagedAssemblyBuffer = lines.join("\n");
            },

            // 🎯 DISPATCH TURN: Sends Prompt + Editable Staged Assembly Buffer to Agent
            async handleDirectDispatch() {
                if (!this.userPrompt.trim()) return;

                this.isExecuting = true;
                const tkn = this.resolveCsrfToken();
                const currentFileUri = this.activeArtifactLocation || '';
                const executedPromptText = this.userPrompt.trim();

                const headers = {
                    'moquiSessionToken': tkn,
                    'Content-Type': 'application/json'
                };

                const activeEntityRag = (this.detectedEntities || []).filter(e => e.enabled).map(e => ({
                    category: 'ENTITY_SCHEMA',
                    title: e.entityName,
                    snippet: `Fields: ${Object.keys(e.fields || {}).join(', ')}`,
                    enabled: true
                }));

                const payload = {
                    artifactUri: currentFileUri,
                    targetComponent: this.targetComponent || 'nursinghome',
                    focusCoordinate: this.includeTargetCoordinate ? (this.focusedElementId || null) : null,
                    focusCoordinateArray: this.includeTargetCoordinate ? this.parsedCoordinateArray : [],
                    userPrompt: executedPromptText,
                    adHocPrompt: this.stagedAssemblyBuffer,
                    mcpTool: this.selectedCommand ? this.selectedCommand.command : null,
                    mcpParams: this.selectedCommand ? this.commandParamValues : null,
                    selectedArchetypes: this.availableArchetypes.filter(a => a.selected).map(a => a.uri),
                    selectedIntents: this.selectedIntents,
                    ragContext: [...this.governanceRules.filter(r => r.enabled), ...activeEntityRag],
                    rawXmlContent: this.includeRawXml ? this.rawXmlSource : null,
                    activeRagContext: JSON.stringify({
                        artifactUri: currentFileUri,
                        targetComponent: this.targetComponent,
                        focusCoordinate: this.focusedElementId,
                        astTree: this.rawAstObject
                    })
                };

                try {
                    const response = await axios.post('/rest/s1/agi-ide/executeStagedAgentTurn', payload, { headers });
                    this.isExecuting = false;
                    const res = response.data || {};

                    let parsedRes = res;
                    if (typeof res.completionText === 'string') {
                        try { parsedRes = JSON.parse(res.completionText); } catch (e) { }
                    }

                    const newUri = parsedRes.createdArtifactUri || res.createdArtifactUri || currentFileUri;
                    const updatedXml = parsedRes.rawXmlContent || '';

                    if (newUri && this.contextBus) {
                        this.contextBus.postMessage({
                            event: 'artifact-state-mutated',
                            artifactUri: newUri,
                            rawXmlText: updatedXml
                        });
                    }

                    if (this.$q) {
                        this.$q.notify({
                            type: 'positive',
                            message: parsedRes.message || 'Turn dispatched and buffer synced successfully.'
                        });
                    }

                    this.processExecutionTelemetry('Studio Turn', executedPromptText, newUri, payload);

                } catch (err) {
                    this.isExecuting = false;
                    const errorMsg = err.response?.data?.errors || err.message || 'Agent execution failed.';
                    if (this.$q) this.$q.notify({ type: 'negative', message: errorMsg });
                }
            },

            forkHistoryTurn(hist) {
                this.userPrompt = hist.text || '';
                if (hist.payload && hist.payload.adHocPrompt) {
                    this.stagedAssemblyBuffer = hist.payload.adHocPrompt;
                }
                if (this.$q) {
                    this.$q.notify({
                        type: 'info',
                        message: 'Loaded historical turn into Studio assembly buffer.'
                    });
                }
            },

            processExecutionTelemetry(executedCommandName, promptText, resultUri, stagedPayload) {
                const vm = this;
                const newUri = resultUri || vm.activeArtifactLocation;

                if (newUri) {
                    vm.activeArtifactLocation = newUri;
                    vm.fetchActiveRagContext(newUri);
                }

                vm.promptHistory.unshift({
                    timestamp: new Date().toLocaleTimeString(),
                    command: executedCommandName || 'AI Agent',
                    text: promptText,
                    resultUri: newUri || '',
                    payload: stagedPayload || null
                });

                vm.blueprintTreeKey++;

                if (newUri && vm.contextBus) {
                    vm.contextBus.postMessage({
                        event: 'reload-blueprint-tree',
                        artifactUri: newUri
                    });
                    vm.contextBus.postMessage({
                        event: 'open-screen-artifact',
                        artifactUri: newUri
                    });
                }

                vm.userPrompt = '';
                vm.clearSelectedCommand();
            }
        }
    };

    window.AgiPromptEditor = AgiPromptEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-prompt-editor'] = AgiPromptEditor;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('agi-prompt-editor', AgiPromptEditor);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();