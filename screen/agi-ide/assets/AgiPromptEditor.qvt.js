(function () {
    const AgiPromptEditor = {
        name: 'AgiPromptEditor',
        props: {
            activeArtifact: { type: String, default: '' },
            targetComponentProp: { type: String, default: 'nursinghome' }
        },
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
            <div class="agi-prompt-editor-docked full-width full-height column no-wrap bg-slate-900 overflow-hidden" style="min-height: 550px;">
                
                <!-- 1. STUDIO HEADER: ASSIST MODE SELECTOR & COORDINATE -->
                <div class="q-pa-xs bg-slate-950 row items-center justify-between border-bottom-dark" style="border-bottom: 1px solid #334155;">
                    <div class="row items-center q-gutter-x-sm">
                        <q-icon name="psychology" color="primary" size="sm" />
                        <span class="text-subtitle2 text-weight-bold font-mono text-slate-100">AGI COMMAND STUDIO</span>
                        <q-badge color="cyan-9" :label="activeArtifactMetadata.typeName || 'Artifact'" class="q-ml-xs font-mono" />
                        <q-badge :color="statusColor" :label="payloadState.statusId" class="q-ml-xs font-mono" />
                    </div>

                    <!-- Breadcrumb Focus Coordinate -->
                    <div class="col q-mx-md row items-center no-wrap overflow-hidden">
                        <q-breadcrumbs active-color="purple-3" class="text-caption font-mono text-slate-300" separator-color="grey-5">
                            <template v-slot:separator>
                                <q-icon size="10px" name="chevron_right" color="grey-4" />
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

                    <!-- Mode Selector and Quick Actions -->
                    <div class="row items-center q-gutter-x-xs">
                        <q-select
                            v-model="currentMode"
                            :options="assistModes"
                            emit-value
                            map-options
                            dense
                            outlined
                            color="primary"
                            bg-color="slate-800"
                            style="min-width: 155px"
                            class="font-mono text-caption text-white"
                            @update:model-value="onModeChange"
                        >
                            <template v-slot:option="scope">
                                <q-item v-bind="scope.itemProps" dense>
                                    <q-item-section avatar min-width="24px">
                                        <q-icon :name="scope.opt.icon" :color="scope.opt.color" size="xs" />
                                    </q-item-section>
                                    <q-item-section>
                                        <q-item-label class="text-caption font-mono text-slate-200">{{ scope.opt.label }}</q-item-label>
                                        <q-item-label caption class="text-slate-400" style="font-size: 9px;">{{ scope.opt.caption }}</q-item-label>
                                    </q-item-section>
                                </q-item>
                            </template>
                        </q-select>

                        <q-btn
                            v-if="currentMode === 'plan' || currentMode === 'discuss'"
                            flat
                            dense
                            color="amber-4"
                            icon="upgrade"
                            label="Promote to Build"
                            class="font-mono text-caption text-weight-bold"
                            @click="promoteToBuild"
                        >
                            <q-tooltip>Promote active prompt and facets into a direct Build Payload</q-tooltip>
                        </q-btn>

                        <q-btn flat dense round icon="manage_search" size="xs" color="cyan-4" @click="showPalette = !showPalette">
                            <q-tooltip>Browse / Switch Focus Artifact</q-tooltip>
                        </q-btn>
                        
                        <q-btn flat round dense icon="close" text-color="white" size="xs" @click="closeDockedEditor">
                            <q-tooltip>Close Studio Panel</q-tooltip>
                        </q-btn>
                    </div>
                </div>

                <!-- Inline Artifact Palette Drawer -->
                <q-slide-transition>
                    <div v-if="showPalette" class="bg-slate-950 border-bottom-dark q-pa-xs" style="border-bottom: 1px solid #334155;">
                        <div class="row items-center justify-between q-px-xs q-mb-xs">
                            <span class="text-caption text-weight-bold text-cyan-4 font-mono">FOCUS WORKSPACE ARTIFACT</span>
                            <q-btn flat dense icon="close" size="xs" color="slate-300" @click="showPalette = false" />
                        </div>
                        <agi-artifact-palette @artifact-selected="onArtifactSelectedFromPalette" />
                    </div>
                </q-slide-transition>

                <!-- 2. TASK PROMPT & DISPATCH BAR -->
                <div class="bg-slate-950 q-pa-sm border-bottom-dark" style="border-bottom: 1px solid #334155;">
                    <div class="row items-center justify-between q-mb-xs">
                        <div class="row items-center q-gutter-x-xs">
                            <span class="text-caption font-mono text-slate-200 text-weight-bold">USER PROMPT &amp; TASK DISPATCH</span>
                            <q-badge outline color="teal-4" class="font-mono" style="font-size: 9px;">{{ activeArtifactMetadata.artifactType }}</q-badge>
                        </div>
                        
                        <q-btn-dropdown 
                            flat dense size="xs" color="cyan-4" icon="history" 
                            label="Load Past Intent / Prompt" no-caps
                            @before-show="searchHistoricalPayloads('')"
                        >
                            <div class="q-pa-sm bg-slate-950 font-mono" style="min-width: 460px; max-height: 380px;">
                                <q-input 
                                    v-model="historySearchFilter" 
                                    dense outlined 
                                    placeholder="Search by keywords, status, or date..." 
                                    bg-color="slate-900"
                                    input-class="text-caption font-mono text-white"
                                    debounce="300"
                                    @update:model-value="searchHistoricalPayloads"
                                >
                                    <template v-slot:prepend>
                                        <q-icon name="search" size="xs" color="cyan-4" />
                                    </template>
                                </q-input>

                                <q-list dense separator class="q-mt-xs overflow-y-auto" style="max-height: 300px;">
                                    <q-item 
                                        v-for="pld in matchingHistoricalPayloads" 
                                        :key="pld.agiPayloadId" 
                                        clickable v-ripple
                                        class="rounded-borders q-my-xs bg-slate-900"
                                        @click="restoreHistoricalPayload(pld)"
                                    >
                                        <q-item-section avatar min-width="24px">
                                            <q-badge :color="pld.modeEnumId === 'AamPlan' ? 'amber-9' : 'primary'" :label="pld.modeEnumId ? pld.modeEnumId.replace('Aam', '') : ''" />
                                        </q-item-section>
                                        <q-item-section>
                                            <q-item-label class="text-caption font-mono text-weight-bold text-slate-200 ellipsis">
                                                {{ pld.title || pld.userPromptText }}
                                            </q-item-label>
                                            <q-item-label caption class="text-slate-400" style="font-size: 9px;">
                                                {{ pld.lastUpdatedStamp }} | {{ pld.statusId }}
                                            </q-item-label>
                                            <div class="row q-gutter-xs q-mt-xs" v-if="pld.facets && Object.keys(pld.facets).length > 0">
                                                <q-badge v-for="(fVal, fKey) in pld.facets" :key="fKey" color="slate-800" text-color="teal-3" style="font-size: 8px;">
                                                    {{ fKey }}: {{ fVal }}
                                                </q-badge>
                                            </div>
                                        </q-item-section>
                                    </q-item>
                                    <q-item v-if="matchingHistoricalPayloads.length === 0">
                                        <q-item-section class="text-slate-400 italic text-center text-caption font-mono">
                                            No matching past payloads found.
                                        </q-item-section>
                                    </q-item>
                                </q-list>
                            </div>
                        </q-btn-dropdown>
                    </div>

                    <!-- Prompt Textarea & Action Button -->
                    <div class="row items-start q-col-gutter-sm">
                        <div class="col">
                            <q-input 
                                ref="promptInput"
                                v-model="userPrompt" 
                                type="textarea"
                                rows="2"
                                dark
                                outlined 
                                dense 
                                :placeholder="modePromptPlaceholder" 
                                class="font-mono text-caption"
                                style="background-color: #020617; border-radius: 4px;"
                                input-style="color: #f8fafc; font-family: monospace; font-size: 11px;"
                                :disable="isExecuting"
                                @update:model-value="onPromptInput"
                                @keydown.ctrl.enter="handleDirectDispatch"
                            />
                        </div>
                        <div class="col-auto column q-gutter-y-xs">
                            <q-btn 
                                :color="modeActionColor" 
                                :icon="modeActionIcon" 
                                :label="modeActionLabel" 
                                no-caps 
                                class="q-px-md font-mono text-weight-bold full-width" 
                                style="height: 38px;"
                                :loading="isExecuting" 
                                @click="handleDirectDispatch" 
                            />
                            <div class="row items-center justify-between text-caption font-mono text-slate-400" style="font-size: 10px;">
                                <span>Ctrl+Enter</span>
                                <q-btn flat dense size="xs" color="cyan-4" icon="refresh" label="Re-sync" @click="syncControlsToAssemblyBuffer" />
                            </div>
                        </div>
                    </div>

                    <!-- Dynamic Tool Parameters -->
                    <q-slide-transition>
                        <div v-if="selectedCommand" class="q-mt-xs q-pa-xs bg-slate-900 rounded-borders border-dark row items-center q-gutter-x-sm" style="border: 1px solid #334155;">
                            <q-chip color="primary" text-color="white" dense size="sm" icon="build" removable @remove="clearSelectedCommand">
                                {{ selectedCommand.command }}
                            </q-chip>
                            <span class="text-caption text-slate-300 ellipsis" style="max-width: 220px;">{{ selectedCommand.description }}</span>
                            
                            <div v-for="param in visibleParams" :key="param.name" class="col-auto">
                                <q-input 
                                    v-model="commandParamValues[param.name]" 
                                    :label="param.name" 
                                    dense 
                                    outlined 
                                    class="text-caption font-mono text-white" 
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
                                    <q-item-label caption class="text-slate-300 ellipsis" style="font-size: 10px;">{{ cmd.description }}</q-item-label>
                                </q-item-section>
                            </q-item>
                        </q-list>
                    </div>
                </div>

                <!-- 3. TWO-PANE MAIN WORKSPACE -->
                <div class="col row no-wrap overflow-hidden bg-slate-900">
                    
                    <!-- LEFT PANE: GROUNDING CONTROLS & FACETS (42% Width) -->
                    <div class="col-5 column no-wrap border-right-dark bg-slate-950 q-pa-sm" style="border-right: 1px solid #334155; overflow-y: auto;">
                        
                        <!-- A. INTENT FACETS BAR -->
                        <div class="q-mb-xs q-pa-xs rounded-borders bg-slate-900" style="border: 1px solid #334155;">
                            <div class="row items-center justify-between q-px-xs q-mb-xs">
                                <div class="row items-center q-gutter-x-xs text-caption font-mono text-weight-bold text-amber-4">
                                    <q-icon name="local_offer" size="xs" />
                                    <span>INTENT FACETS &amp; PHI TAGS</span>
                                </div>
                                <span class="text-caption font-mono text-slate-400" style="font-size: 9px;">Mode: {{ currentMode }}</span>
                            </div>
                        
                            <div class="q-pa-xs font-mono text-caption">
                                <div class="row items-center q-gutter-xs q-mb-xs">
                                    <q-chip 
                                        v-for="(val, key) in payloadState.facets" 
                                        :key="key" 
                                        dense size="sm" 
                                        removable
                                        color="slate-800" 
                                        text-color="teal-3"
                                        class="font-mono text-caption"
                                        @remove="removeFacet(key)"
                                    >
                                        <strong class="text-amber-3">{{ key }}:</strong>&nbsp;{{ val }}
                                    </q-chip>
                                    <div v-if="Object.keys(payloadState.facets).length === 0" class="text-caption text-slate-400 italic">
                                        No facets attached.
                                    </div>
                                </div>
                        
                                <div class="row items-center q-gutter-xs q-mb-xs">
                                    <span class="text-slate-300" style="font-size: 9px;">Quick:</span>
                                    <q-chip 
                                        v-for="rec in quickFacetPresets" 
                                        :key="rec.key + rec.val"
                                        dense size="xs" clickable
                                        color="slate-950" text-color="cyan-3"
                                        class="font-mono"
                                        @click="applyPreset(rec.key, rec.val)"
                                    >
                                        + {{ rec.key }}: {{ rec.label || rec.val }}
                                    </q-chip>
                                </div>
                        
                                <div class="row items-center q-gutter-xs">
                                    <q-select
                                        v-model="newFacetKey"
                                        :options="standardFacetKeys"
                                        use-input
                                        new-value-mode="add-unique"
                                        dense outlined
                                        placeholder="key"
                                        bg-color="slate-950"
                                        class="col-4 font-mono text-caption text-white"
                                        style="font-size: 10px;"
                                        @update:model-value="onFacetKeyChanged"
                                    />
                                    <q-select
                                        v-model="newFacetVal"
                                        :options="dynamicFacetValueOptions"
                                        use-input
                                        new-value-mode="add-unique"
                                        dense outlined
                                        placeholder="value"
                                        bg-color="slate-950"
                                        class="col font-mono text-caption text-white"
                                        style="font-size: 10px;"
                                        @keydown.enter="addFacet"
                                    />
                                    <q-btn dense flat round icon="add" size="xs" color="amber-4" @click="addFacet">
                                        <q-tooltip>Add Facet</q-tooltip>
                                    </q-btn>
                                </div>
                            </div>
                        </div>

                        <!-- B. TARGET SCOPE & FOCUS COORDINATE (Polymorphic) -->
                        <div v-if="isPanelVisible('targetCoordinate')" class="q-mb-xs q-pa-xs rounded-borders bg-slate-900" style="border: 1px solid #334155;">
                            <div class="row items-center justify-between q-px-xs q-mb-xs">
                                <div class="row items-center q-gutter-x-xs text-caption font-mono text-weight-bold text-cyan-4">
                                    <q-icon name="gps_fixed" size="xs" />
                                    <span>1. TARGET COORDINATE (WHERE)</span>
                                </div>
                                <q-btn v-if="focusedElementId" flat dense size="xs" color="slate-300" icon="close" label="Clear Focus" @click="clearFocusedCoordinate" />
                            </div>

                            <div class="q-pa-xs font-mono text-caption">
                                <div class="row items-center justify-between q-mb-xs">
                                    <q-checkbox 
                                        v-model="includeTargetCoordinate" 
                                        label="Include Target AST Slice" 
                                        dense color="secondary" 
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

                        <!-- C. CANONICAL ARCHETYPES (Polymorphic) -->
                        <q-expansion-item 
                            v-if="isPanelVisible('canonicalArchetypes')"
                            default-opened dense
                            header-class="bg-slate-900 text-cyan-4 text-weight-bold font-mono text-caption q-pa-xs rounded-borders q-mt-xs"
                            icon="architecture"
                            label="2. CANONICAL ARCHETYPES (STRUCTURE)"
                        >
                            <div class="q-pa-xs font-mono text-caption">
                                <div class="row items-center justify-between q-mb-xs">
                                    <span class="text-caption text-slate-200 text-weight-bold">CANONICAL BLUEPRINTS</span>
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
                                    <div v-if="availableArchetypes.length === 0" class="text-caption text-slate-400 italic">
                                        No archetypes found under mcp/resources/screen/archetype/
                                    </div>
                                </div>

                                <q-expansion-item 
                                    v-if="selectedArchetypePreview" 
                                    dense 
                                    header-class="text-caption text-slate-200 rounded-borders q-pa-xs"
                                    :label="'Blueprint: ' + selectedArchetypePreview.name"
                                    default-opened
                                >
                                    <pre class="q-pa-xs bg-slate-950 text-slate-200 rounded-borders overflow-auto" style="font-size: 10px; max-height: 120px; border: 1px solid #1e293b;">{{ selectedArchetypePreview.xml }}</pre>
                                </q-expansion-item>
                            </div>
                        </q-expansion-item>

                        <!-- D. DATA GROUNDING & ENTITY SCHEMAS (Polymorphic) -->
                        <q-expansion-item 
                            v-if="isPanelVisible('detectedEntities')"
                            default-opened dense
                            header-class="bg-slate-900 text-teal-4 text-weight-bold font-mono text-caption q-pa-xs rounded-borders q-mt-xs"
                            icon="storage"
                            label="3. DATA GROUNDING (DATA)"
                        >
                            <div class="q-pa-xs q-gutter-y-xs font-mono text-caption">
                                <div class="text-caption text-slate-200 text-weight-bold q-mb-xs">DETECTED ENTITIES &amp; SCHEMAS</div>
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
                                            <q-item-label caption class="text-slate-400" style="font-size: 9px;">
                                                {{ Object.keys(ent.fields || {}).length }} fields | {{ (ent.relationships || []).length }} relationships
                                            </q-item-label>
                                        </q-item-section>
                                    </q-item>
                                    <q-item v-if="detectedEntities.length === 0" class="q-pa-xs">
                                        <q-item-section class="text-slate-400 italic text-center text-caption font-mono">
                                            No direct entity mappings detected.
                                        </q-item-section>
                                    </q-item>
                                </q-list>

                                <div class="row items-center q-gutter-x-xs q-mt-xs">
                                    <q-checkbox v-model="includeFullAst" dense color="cyan-4" label="Full Screen AST" @update:model-value="syncControlsToAssemblyBuffer" />
                                    <q-checkbox v-model="includeRawXml" dense color="cyan-4" label="Raw XML" @update:model-value="syncControlsToAssemblyBuffer" />
                                </div>
                            </div>
                        </q-expansion-item>

                        <!-- E. BUSINESS INTENT THREADS (Polymorphic) -->
                        <q-expansion-item 
                            v-if="isPanelVisible('intentThreads')"
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

                        <!-- F. GOVERNANCE RULES (Polymorphic) -->
                        <q-expansion-item 
                            v-if="isPanelVisible('governanceRules')"
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
                                            <q-item-label caption class="text-slate-300" style="font-size: 10px;">{{ rule.snippet }}</q-item-label>
                                        </q-item-section>
                                    </q-item>
                                </q-list>
                            </div>
                        </q-expansion-item>

                        <!-- G. SERVICE/ENTITY/TEST FALLBACK PLACEHOLDER -->
                        <div v-if="activeArtifactMetadata.artifactType !== 'XML_SCREEN'" class="q-pa-sm q-mt-xs rounded-borders bg-slate-900 border-dark text-caption font-mono" style="border: 1px solid #334155;">
                            <div class="text-weight-bold text-teal-4 q-mb-xs">SPECIFICATION GROUNDING</div>
                            <div class="text-slate-300" style="font-size: 11px;">Schema: <span class="text-cyan-3">{{ activeArtifactMetadata.schemaUri || 'Generic' }}</span></div>
                            <div class="text-slate-400 q-mt-xs" style="font-size: 10px;">Instruction: {{ activeArtifactMetadata.instructionUri }}</div>
                        </div>

                        <!-- H. PROVENANCE & PAYLOAD HISTORY -->
                        <q-expansion-item 
                            dense
                            header-class="bg-slate-900 text-slate-200 text-weight-bold font-mono text-caption q-pa-xs rounded-borders q-mt-xs"
                            icon="history"
                            label="6. PROVENANCE &amp; HISTORY"
                        >
                            <div class="q-pa-xs bg-black rounded-borders max-h-32 overflow-y-auto">
                                <q-list separator dense v-if="promptHistory.length > 0">
                                    <q-item v-for="(hist, idx) in promptHistory" :key="idx" class="q-pa-xs">
                                        <q-item-section>
                                            <div class="row items-center justify-between">
                                                <span class="font-mono text-caption text-primary" style="font-size: 10px;">{{ hist.timestamp }} ({{ hist.mode || 'build' }})</span>
                                                <q-btn flat dense size="xs" color="secondary" icon="tune" label="Fork" @click="forkHistoryTurn(hist)" />
                                            </div>
                                            <div class="text-slate-200 font-mono ellipsis" style="font-size: 11px;">{{ hist.text }}</div>
                                        </q-item-section>
                                    </q-item>
                                </q-list>
                                <div v-else class="text-center text-slate-400 italic q-pa-xs text-caption">No prior turns in this session.</div>
                            </div>
                        </q-expansion-item>

                    </div>

                    <!-- RIGHT PANE: ADAPTIVE VIEWPORTS & ASSEMBLY BUFFER (58% Width) -->
                    <div class="col-7 column no-wrap bg-slate-900 q-pa-sm justify-between">
                        
                        <div class="row items-center justify-between q-mb-xs">
                            <div class="row items-center q-gutter-x-xs text-caption font-mono text-weight-bold text-cyan-4">
                                <q-icon :name="modeViewportIcon" size="xs" />
                                <span>{{ modeViewportTitle }}</span>
                            </div>
                            <span class="text-caption font-mono text-slate-300" style="font-size: 11px;">
                                Payload Target: {{ targetArtifactId ? 'AgiArtifact #' + targetArtifactId : 'Root Intent' }}
                            </span>
                        </div>

                        <!-- 1. TEST MODE SPECIFIC VIEWPORT -->
                        <div v-if="currentMode === 'test'" class="col column q-gutter-y-xs">
                            <div class="row items-center justify-between text-caption font-mono text-slate-200">
                                <span>Declarative Test Manifest Pipeline (JSON):</span>
                                <q-btn flat dense size="xs" color="teal-4" icon="add" label="Template Assertion" @click="addTestStepTemplate" />
                            </div>
                            <textarea 
                                v-model="testManifestJsonText"
                                class="col full-width font-mono text-caption q-pa-sm rounded-borders"
                                style="background-color: #020617; color: #5eead4; border: 1px solid #115e59; resize: none; font-size: 11px; line-height: 16px;"
                                placeholder='[ { "stepId": "01_ASSERT", "action": "ASSERT_STATE", "assertions": { "expectFileExists": true } } ]'
                            ></textarea>
                        </div>

                        <!-- 2. DEFAULT ASSEMBLY BUFFER VIEWPORT -->
                        <textarea 
                            v-else
                            v-model="stagedAssemblyBuffer"
                            class="col full-width font-mono text-caption q-pa-sm rounded-borders"
                            style="background-color: #020617; color: #f8fafc; border: 1px solid #334155; resize: none; font-size: 11px; line-height: 16px; font-family: monospace;"
                            placeholder="/* Staged assembly buffer automatically populates from left controls. You can make ad-hoc edits directly here before dispatching... */"
                        ></textarea>

                        <!-- Bottom Telemetry & Status Bar -->
                        <div class="q-mt-xs q-pa-xs bg-slate-950 rounded-borders row items-center justify-between text-caption font-mono text-slate-300" style="border: 1px solid #1e293b;">
                            <div class="row items-center q-gutter-x-sm">
                                <q-badge color="purple-8">{{ includeTargetCoordinate && focusedElementId ? 'Target: <' + displayTargetTag + '>' : 'Root Target' }}</q-badge>
                                <q-badge color="cyan-9">{{ activeArchetypesCount }} Archetypes</q-badge>
                                <q-badge color="teal-9">{{ activeEntitiesCount }} Entities</q-badge>
                                <q-badge color="deep-purple-8">{{ selectedIntents.length }} Intents</q-badge>
                                <q-badge color="secondary">{{ activeRulesCount }} Rules</q-badge>
                            </div>
                            <span style="font-size: 11px;">FSM Mode: <strong class="text-white">{{ currentMode.toUpperCase() }}</strong></span>
                        </div>

                    </div>

                </div>

            </div>
        `,
        data() {
            return {
                currentMode: 'build',
                userPrompt: '',
                targetComponent: this.targetComponentProp || 'nursinghome',
                activeArtifactLocation: this.activeArtifact || '',
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
                historySearchFilter: '',
                matchingHistoricalPayloads: [],

                // Introspected Registry Metadata
                activeArtifactMetadata: {
                    artifactType: 'XML_SCREEN',
                    typeName: 'Moqui XML Screen',
                    schemaUri: '',
                    instructionUri: '',
                    editorComponent: 'agi-screen-payload-editor',
                    groundingPanels: ['targetCoordinate', 'canonicalArchetypes', 'detectedEntities', 'intentThreads', 'governanceRules']
                },

                // Assist Modes FSM Definitions
                assistModes: [
                    { label: 'Plan', value: 'plan', icon: 'lightbulb', color: 'amber-4', caption: 'Ad-hoc Formulation' },
                    { label: 'Build', value: 'build', icon: 'build', color: 'primary', caption: 'Direct Artifact Mutation' },
                    { label: 'Orchestrate', value: 'orchestrate', icon: 'hub', color: 'purple-4', caption: 'Large Model Management' },
                    { label: 'Test', value: 'test', icon: 'fact_check', color: 'teal-4', caption: 'Lifecycle Assertions' },
                    { label: 'Query', value: 'query', icon: 'analytics', color: 'blue-4', caption: 'Data & Reporting' },
                    { label: 'History', value: 'history', icon: 'history', color: 'orange-4', caption: 'Audit & Pruning' },
                    { label: 'Discuss', value: 'discuss', icon: 'forum', color: 'green-4', caption: 'Intent & ADR Synthesis' }
                ],

                // AgiPayload Envelope State
                payloadState: {
                    agiPayloadId: null,
                    statusId: 'PlsDraft',
                    facets: {
                        hipaa: 'true',
                        domain: 'clinical'
                    }
                },
                newFacetKey: 'entity',
                newFacetVal: '',
                testManifestJsonText: '',
                standardFacetKeys: [
                    'entity',
                    'domain',
                    'hipaa',
                    'archetype',
                    'role',
                    'action',
                    'privacy'
                ],
                commonEntities: [
                    'mantle.party.Party',
                    'mantle.party.Person',
                    'mantle.party.PartyRelationship',
                    'mantle.facility.Facility',
                    'mantle.work.effort.WorkEffort',
                    'nursinghome.facility.Room'
                ],
                quickFacetPresets: [
                    { key: 'entity', val: 'mantle.party.Party', label: 'Party' },
                    { key: 'entity', val: 'mantle.party.Person', label: 'Person' },
                    { key: 'domain', val: 'clinical', label: 'clinical' },
                    { key: 'hipaa', val: 'true', label: 'hipaa' }
                ],

                availableArchetypes: [],
                selectedArchetypePreview: null,
                archetypeContentCache: {},

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

                stagedAssemblyBuffer: ''
            };
        },
        computed: {
            statusColor() {
                const map = {
                    PlsDraft: 'grey-7',
                    PlsStaged: 'amber-9',
                    PlsExecuting: 'blue-8',
                    PlsCommitted: 'positive',
                    PlsFailed: 'negative'
                };
                return map[this.payloadState.statusId] || 'grey-7';
            },

            modePromptPlaceholder() {
                switch (this.currentMode) {
                    case 'plan': return "Draft ad-hoc ideas or architecture changes (creates build payload)...";
                    case 'build': return "Type task prompt or '/' for MCP tools (e.g. 'Generate room lookup screen using lookup-modal archetype')...";
                    case 'test': return "Enter test scenario description or assertion objective...";
                    case 'discuss': return "Enter architectural decisions, trade-offs, or intent notes...";
                    case 'query': return "Enter clinical data query or entity reporting parameters...";
                    default: return "Type task prompt or '/' for MCP tools...";
                }
            },

            modeActionLabel() {
                switch (this.currentMode) {
                    case 'plan': return 'Save Plan';
                    case 'build': return 'Dispatch Turn';
                    case 'test': return 'Execute Suite';
                    case 'discuss': return 'Log Discussion';
                    case 'query': return 'Run Query';
                    default: return 'Process Turn';
                }
            },

            modeActionIcon() {
                switch (this.currentMode) {
                    case 'plan': return 'lightbulb';
                    case 'build': return 'bolt';
                    case 'test': return 'fact_check';
                    case 'discuss': return 'forum';
                    default: return 'send';
                }
            },

            modeActionColor() {
                switch (this.currentMode) {
                    case 'plan': return 'amber-9';
                    case 'build': return 'positive';
                    case 'test': return 'teal-8';
                    case 'discuss': return 'green-8';
                    default: return 'primary';
                }
            },

            modeViewportTitle() {
                switch (this.currentMode) {
                    case 'test': return 'STAGED TEST MANIFEST & ASSERTIONS';
                    case 'discuss': return 'INTENT NARRATIVE & DECISION LEDGER';
                    case 'plan': return 'AD-HOC PLANNING ASSEMBLY BUFFER';
                    default: return 'STAGED RAG ASSEMBLY BUFFER (EDITABLE GROUNDING)';
                }
            },

            modeViewportIcon() {
                switch (this.currentMode) {
                    case 'test': return 'fact_check';
                    case 'discuss': return 'forum';
                    case 'plan': return 'lightbulb';
                    default: return 'terminal';
                }
            },

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
            },
            dynamicFacetValueOptions() {
                if (this.newFacetKey === 'entity') {
                    const detected = (this.detectedEntities || []).map(e => e.entityName);
                    return Array.from(new Set([...detected, ...this.commonEntities]));
                }
                if (this.newFacetKey === 'hipaa') {
                    return ['true', 'false'];
                }
                if (this.newFacetKey === 'domain') {
                    return ['clinical', 'billing', 'operations', 'administration', 'pharmacy'];
                }
                if (this.newFacetKey === 'action') {
                    return ['view', 'create', 'update', 'delete', 'lookup', 'export'];
                }
                return [];
            }
        },

        watch: {
            activeArtifact(newUri) {
                if (newUri && newUri !== this.activeArtifactLocation) {
                    this.activeArtifactLocation = newUri;
                    this.fetchArtifactMetadata(newUri);
                    this.fetchActiveRagContext(newUri);
                }
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

                if (event.data.event === 'artifact-relocated') {
                    const oldUri = event.data.oldUri;
                    const newUri = event.data.newUri;

                    if (vm.activeArtifactLocation === oldUri || !vm.activeArtifactLocation) {
                        vm.activeArtifactLocation = newUri;
                        vm.fetchArtifactMetadata(newUri);
                        vm.fetchActiveRagContext(newUri);
                    }
                    return;
                }

                if (event.data.event === 'force-open-command-palette' || event.data.event === 'open-prompt-editor' || event.data.event === 'open-screen-artifact') {
                    vm.targetComponent = event.data.targetComponent || vm.targetComponent || 'nursinghome';
                    vm.activeArtifactLocation = event.data.artifactLocation || event.data.artifactUri || vm.activeArtifactLocation || '';
                    vm.targetArtifactId = event.data.agiArtifactId || vm.targetArtifactId || '';

                    let coord = event.data.focusCoordinate || vm.focusedElementId || '';
                    if (coord.includes('agi-workspace-root')) {
                        coord = vm.focusedElementId && !vm.focusedElementId.includes('agi-workspace-root') ? vm.focusedElementId : '';
                    }

                    vm.focusedElementId = coord;
                    vm.includeTargetCoordinate = !!coord;

                    vm.fetchDynamicTools();
                    vm.fetchMcpArchetypes();
                    if (vm.activeArtifactLocation) {
                        vm.fetchArtifactMetadata(vm.activeArtifactLocation);
                        vm.fetchActiveRagContext(vm.activeArtifactLocation);
                    } else {
                        vm.syncControlsToAssemblyBuffer();
                    }
                }
            };

            this.fetchDynamicTools();
            this.fetchMcpArchetypes();
            if (this.activeArtifactLocation) {
                this.fetchArtifactMetadata(this.activeArtifactLocation);
                this.fetchActiveRagContext(this.activeArtifactLocation);
            }
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

            async fetchArtifactMetadata(uri) {
                if (!uri) return;
                try {
                    const resp = await axios.get('/rest/s1/agi-ai/artifactMetadata', {
                        params: { artifactUri: uri },
                        headers: { 'moquiSessionToken': this.resolveCsrfToken() }
                    });
                    if (resp.data) {
                        this.activeArtifactMetadata = {
                            artifactType: resp.data.artifactType || 'XML_SCREEN',
                            typeName: resp.data.typeName || 'Artifact',
                            schemaUri: resp.data.schemaUri || '',
                            instructionUri: resp.data.instructionUri || '',
                            editorComponent: resp.data.editorComponent || 'agi-screen-payload-editor',
                            groundingPanels: resp.data.groundingPanels || []
                        };
                    }
                } catch (e) {
                    console.warn("Could not introspect artifact metadata:", e);
                }
            },

            isPanelVisible(panelName) {
                return (this.activeArtifactMetadata?.groundingPanels || []).includes(panelName);
            },

            closeDockedEditor() {
                this.$emit('close');
                if (this.contextBus) {
                    this.contextBus.postMessage({ event: 'close-prompt-editor' });
                }
            },

            onModeChange(newMode) {
                if (newMode === 'test' && !this.testManifestJsonText) {
                    this.addTestStepTemplate();
                }
            },

            promoteToBuild() {
                this.currentMode = 'build';
                this.$q.notify({
                    type: 'info',
                    message: 'Promoted prompt and context into Build Payload mode.',
                    position: 'top-right',
                    timeout: 1500
                });
            },

            onFacetKeyChanged(newKey) {
                if (newKey === 'hipaa' && !this.newFacetVal) {
                    this.newFacetVal = 'true';
                } else if (newKey === 'domain' && !this.newFacetVal) {
                    this.newFacetVal = 'clinical';
                } else if (newKey === 'entity' && !this.newFacetVal) {
                    this.newFacetVal = this.dynamicFacetValueOptions[0] || 'mantle.party.Party';
                }
            },

            applyPreset(key, val) {
                this.payloadState.facets[key] = val;
                this.syncControlsToAssemblyBuffer();
            },

            addFacet() {
                if (!this.newFacetKey || !this.newFacetVal) return;
                const k = String(this.newFacetKey).trim();
                const v = String(this.newFacetVal).trim();
                this.payloadState.facets[k] = v;
                this.newFacetVal = '';
                this.syncControlsToAssemblyBuffer();
            },

            removeFacet(key) {
                delete this.payloadState.facets[key];
                this.syncControlsToAssemblyBuffer();
            },

            addTestStepTemplate() {
                const template = [
                    {
                        stepId: '01_VERIFY_FILE',
                        title: 'Verify File Existence on Disk',
                        action: 'ASSERT_STATE',
                        assertions: { expectFileExists: true }
                    },
                    {
                        stepId: '02_VERIFY_BUFFER',
                        title: 'Verify WorkspaceBuffer AST Presence',
                        action: 'ASSERT_STATE',
                        assertions: { expectBufferExists: true }
                    }
                ];
                this.testManifestJsonText = JSON.stringify(template, null, 2);
            },

            clearFocusedCoordinate() {
                this.focusedElementId = '';
                this.includeTargetCoordinate = false;
                this.syncControlsToAssemblyBuffer();
            },

            onPromptInput(val) {
                this.showCommandList = val.startsWith('/') && !this.selectedCommand;
            },

            onArtifactSelectedFromPalette(item) {
                this.activeArtifactLocation = item.value;
                this.fetchArtifactMetadata(item.value);
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
                if (this.currentMode !== 'plan') {
                    this.userPrompt = '';
                }
                this.commandParamValues = {};
            },

            async fetchDynamicTools() {
                const vm = this;
                const headers = { 'moquiSessionToken': this.resolveCsrfToken() };

                try {
                    const response = await axios.get('/rest/s1/agi-ai/mcp/tools', { headers });
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

            async fetchMcpArchetypes() {
                const vm = this;
                const headers = { 'moquiSessionToken': this.resolveCsrfToken() };

                try {
                    const response = await axios.get('/rest/s1/agi-ai/mcp/resources', {
                        params: { category: 'screen', subCategory: 'archetype' },
                        headers: headers
                    });

                    const resList = response.data?.resources || [];
                    vm.availableArchetypes = resList.map(r => ({
                        ...r,
                        selected: r.name === 'lookup-modal'
                    }));

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
                    const resp = await axios.get('/rest/s1/agi-ai/mcp/resources/content', {
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

            syncControlsToAssemblyBuffer() {
                const lines = [];

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
                    lines.push("/* [1. TARGET SCOPE]: Entire Artifact / Root Container                      */");
                    lines.push("/* ========================================================================= */");
                    lines.push("");
                }

                const activeArchs = this.availableArchetypes.filter(a => a.selected);
                if (this.isPanelVisible('canonicalArchetypes') && activeArchs.length > 0) {
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

                const activeEntities = (this.detectedEntities || []).filter(e => e.enabled);
                if (this.isPanelVisible('detectedEntities')) {
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
                }

                if (this.isPanelVisible('intentThreads') && this.selectedIntents.length > 0) {
                    lines.push("/* ========================================================================= */");
                    lines.push(`/* [4. BUSINESS INTENT SPECIFICATIONS]: ${this.selectedIntents.length} attached            */`);
                    lines.push("/* ========================================================================= */");
                    this.selectedIntents.forEach(id => {
                        lines.push(`- Intent Node: ${id}`);
                    });
                    lines.push("");
                }

                const activeRules = this.governanceRules.filter(r => r.enabled);
                if (this.isPanelVisible('governanceRules') && activeRules.length > 0) {
                    lines.push("/* ========================================================================= */");
                    lines.push("/* [5. GOVERNANCE & COMPLIANCE DIRECTIVES]                                   */");
                    lines.push("/* ========================================================================= */");
                    activeRules.forEach(r => {
                        lines.push(`* ${r.title}: ${r.snippet}`);
                    });
                    lines.push("");
                }

                lines.push("/* ========================================================================= */");
                lines.push("/* [6. AD-HOC SYSTEM DIRECTIVES & NOTES] (Type custom notes below)           */");
                lines.push("/* ========================================================================= */");

                this.stagedAssemblyBuffer = lines.join("\n");
            },

            async handleDirectDispatch() {
                if (!this.userPrompt.trim()) return;

                this.isExecuting = true;
                const tkn = this.resolveCsrfToken();
                const previousFileUri = this.activeArtifactLocation || '';
                const executedPromptText = this.userPrompt.trim();

                const headers = {
                    'moquiSessionToken': tkn,
                    'Content-Type': 'application/json'
                };

                let innerPayload = {};
                if (this.currentMode === 'test' && this.testManifestJsonText.trim()) {
                    try {
                        innerPayload.testManifest = JSON.parse(this.testManifestJsonText);
                    } catch (e) {
                        this.$q.notify({ type: 'negative', message: 'Invalid JSON in Test Manifest.' });
                        this.isExecuting = false;
                        return;
                    }
                }

                const payloadEnvelope = {
                    agiPayloadId: this.payloadState.agiPayloadId,
                    mode: this.currentMode,
                    targetComponent: this.targetComponent || 'nursinghome',
                    artifactUri: previousFileUri,
                    targetMariaId: this.includeTargetCoordinate ? (this.focusedElementId || null) : null,
                    title: executedPromptText.length > 45 ? executedPromptText.slice(0, 42) + '...' : executedPromptText,
                    userPromptText: executedPromptText,
                    facets: this.payloadState.facets,
                    payload: innerPayload
                };

                try {
                    const payloadResp = await axios.post('/rest/s1/agi-ai/payload', payloadEnvelope, { headers });
                    const pldData = payloadResp.data || {};

                    if (pldData.agiPayloadId) {
                        this.payloadState.agiPayloadId = pldData.agiPayloadId;
                        this.payloadState.statusId = pldData.statusId;
                    }

                    const activeEntityRag = (this.detectedEntities || []).filter(e => e.enabled).map(e => ({
                        category: 'ENTITY_SCHEMA',
                        title: e.entityName,
                        snippet: `Fields: ${Object.keys(e.fields || {}).join(', ')}`,
                        enabled: true
                    }));

                    const dispatchBody = {
                        agiPayloadId: this.payloadState.agiPayloadId,
                        mode: this.currentMode,
                        artifactUri: previousFileUri,
                        targetComponent: this.targetComponent,
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
                        facets: this.payloadState.facets,
                        activeRagContext: JSON.stringify({
                            artifactUri: previousFileUri,
                            targetComponent: this.targetComponent,
                            focusCoordinate: this.focusedElementId,
                            astTree: this.rawAstObject
                        })
                    };

                    const response = await axios.post('/rest/s1/agi-ide/executeStagedAgentTurn', dispatchBody, { headers });
                    this.isExecuting = false;
                    const res = response.data || {};

                    let parsedRes = res;
                    if (typeof res.completionText === 'string') {
                        try { parsedRes = JSON.parse(res.completionText); } catch (e) { }
                    }

                    const newUri = parsedRes.createdArtifactUri
                        || parsedRes.targetArtifactUri
                        || parsedRes.targetScreenUri
                        || parsedRes.artifactUri
                        || res.createdArtifactUri
                        || previousFileUri;
                    const updatedXml = parsedRes.rawXmlContent || '';

                    if (previousFileUri && newUri && previousFileUri !== newUri && this.contextBus) {
                        this.contextBus.postMessage({
                            event: 'artifact-relocated',
                            oldUri: previousFileUri,
                            newUri: newUri
                        });
                    }

                    if (newUri && this.contextBus) {
                        this.contextBus.postMessage({
                            event: 'open-screen-artifact',
                            artifactUri: newUri
                        });
                        this.contextBus.postMessage({
                            event: 'artifact-state-mutated',
                            artifactUri: newUri,
                            rawXmlText: updatedXml
                        });
                        this.contextBus.postMessage({
                            event: 'reload-blueprint-tree',
                            artifactUri: newUri
                        });
                        this.contextBus.postMessage({
                            event: 'refresh-artifact-palette'
                        });
                    }

                    if (this.$q) {
                        this.$q.notify({
                            type: 'positive',
                            message: parsedRes.message || `Turn dispatched successfully [${this.payloadState.statusId}].`
                        });
                    }

                    this.processExecutionTelemetry('Studio Turn', executedPromptText, newUri, payloadEnvelope);

                } catch (err) {
                    this.isExecuting = false;
                    const errorMsg = err.response?.data?.errors || err.message || 'Agent execution failed.';
                    if (this.$q) this.$q.notify({ type: 'negative', message: errorMsg });
                }
            },

            forkHistoryTurn(hist) {
                this.userPrompt = hist.text || '';
                this.currentMode = hist.mode || 'build';
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
                    vm.fetchArtifactMetadata(newUri);
                    vm.fetchActiveRagContext(newUri);
                }

                vm.promptHistory.unshift({
                    timestamp: new Date().toLocaleTimeString(),
                    mode: vm.currentMode,
                    command: executedCommandName || 'AI Agent',
                    text: promptText,
                    resultUri: newUri || '',
                    payload: stagedPayload || null
                });

                vm.blueprintTreeKey++;

                if (vm.currentMode !== 'plan') {
                    vm.userPrompt = '';
                }
                vm.clearSelectedCommand();
            },

            async searchHistoricalPayloads(searchTerm = '') {
                const vm = this;
                const headers = { 'moquiSessionToken': this.resolveCsrfToken() };
                try {
                    const resp = await axios.get('/rest/s1/agi-ai/payloads', {
                        params: {
                            searchTerm: searchTerm,
                            targetComponent: vm.targetComponent || 'nursinghome'
                        },
                        headers: headers
                    });
                    vm.matchingHistoricalPayloads = resp.data?.payloadList || [];
                } catch (err) {
                    console.warn("Could not retrieve historical payloads:", err);
                }
            },

            restoreHistoricalPayload(pld) {
                this.userPrompt = pld.userPromptText || '';
                this.payloadState.agiPayloadId = pld.agiPayloadId;
                this.payloadState.statusId = pld.statusId;
                this.payloadState.facets = pld.facets || {};
                if (pld.modeEnumId) {
                    this.currentMode = pld.modeEnumId.replace(/^Aam/, '').toLowerCase();
                }
                if (pld.artifactUri) {
                    this.activeArtifactLocation = pld.artifactUri;
                    this.fetchArtifactMetadata(pld.artifactUri);
                    this.fetchActiveRagContext(pld.artifactUri);
                }
                this.syncControlsToAssemblyBuffer();
                if (this.$q) {
                    this.$q.notify({
                        type: 'info',
                        message: `Restored payload #${pld.agiPayloadId} into studio.`
                    });
                }
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