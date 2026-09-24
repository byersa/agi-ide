(function () {
    const AgiCanvasEditor = {
        name: 'AgiCanvasEditor',
        mixins: [window.AgiEditorShareMixin].filter(m => m !== undefined),
        props: {
            screenPath: { type: String, required: true },
            layoutTree: { type: [Object, String], default: () => null }
        },
        data() {
            return {
                selectedMariaId: '',
                activeTabModel: '',
                isInteractivePreview: false,
                contextBus: null,
                viewportClickListener: null,
                activeSubscreenTree: null
            };
        },
        watch: {
            layoutTree: {
                immediate: true,
                deep: true,
                handler(val) {
                    console.log("🔍 [AgiCanvasEditor] layoutTree updated:", val);
                    this.$nextTick(() => {
                        this.loadActiveSubscreenAst();
                    });
                }
            },
            dynamicSubscreenPath: {
                immediate: true,
                handler(val) {
                    console.log("🔍 [AgiCanvasEditor] dynamicSubscreenPath updated:", val);
                    this.loadActiveSubscreenAst();
                }
            }
        },
        computed: {
            parsedTree() {
                if (!this.layoutTree) return null;
                if (typeof this.layoutTree === 'string') {
                    try { return JSON.parse(this.layoutTree); } catch (e) { return null; }
                }
                return this.layoutTree;
            },
            effectiveTree() {
                return this.parsedTree;
            },
            subscreenItems() {
                const tree = this.parsedTree;
                if (!tree) return [];
                const subs = tree.subscreens;
                if (!subs) return [];
                let rawList = [];
                if (Array.isArray(subs.children)) rawList = subs.children;
                else if (Array.isArray(subs)) rawList = subs;

                return rawList.map(item => {
                    const attrs = item.attributes || {};
                    const realName = (item.name && item.name !== 'subscreens-item')
                        ? item.name
                        : (attrs.name || '');
                    const title = (item.menuTitle && item.menuTitle !== 'subscreens-item')
                        ? item.menuTitle
                        : (attrs['menu-title'] || attrs.menuTitle || realName);
                    return {
                        ...item,
                        name: realName,
                        menuTitle: title,
                        label: title,
                        location: item.location || attrs.location || ''
                    };
                });
            },
            defaultSubscreenItem() {
                const tree = this.parsedTree;
                return tree?.subscreens?.defaultItem
                    || (this.subscreenItems.length > 0 ? (this.subscreenItems[0].name || '') : '');
            },
            dynamicSubscreenPath() {
                const def = this.activeTabModel || this.defaultSubscreenItem;
                return def ? [def] : [];
            },
            blueprintContext() {
                return {
                    selectedMariaId: this.selectedMariaId,
                    currentPathList: this.dynamicSubscreenPath,
                    subscreens: this.parsedTree?.subscreens,
                    subscreenList: this.subscreenItems,
                    defaultSubscreen: this.defaultSubscreenItem,
                    activeSubscreenTree: this.activeSubscreenTree,
                    isSandboxed: true // <--- Verifies we are inside AgiCanvasEditor
                };
            },
            canvasWidgetNodes() {
                const rawTree = this.parsedTree;
                if (!rawTree) return [];
                const rootTag = rawTree._moquiTag || rawTree.name || rawTree.tag;

                const enrichWithSubscreens = (nodes) => {
                    if (!nodes || !Array.isArray(nodes)) return [];
                    return nodes.map(node => {
                        const tag = node._moquiTag || node.name || node.tag || node['@type'];

                        if (tag === 'subscreens-tabs' || tag === 'm-subscreens-tabs') {
                            const enriched = Object.assign({}, node);
                            enriched._moquiTag = 'subscreens-tabs';
                            enriched.subscreenList = this.subscreenItems;
                            enriched.defaultItem = this.activeTabModel || this.defaultSubscreenItem;
                            delete enriched['@type'];
                            return enriched;
                        }

                        if (tag === 'subscreens-active' || tag === 'm-subscreens-active') {
                            const enriched = Object.assign({}, node);
                            enriched._moquiTag = 'subscreens-active';
                            delete enriched['@type'];
                            return enriched;
                        }

                        if (node.children && Array.isArray(node.children)) {
                            const cloned = Object.assign({}, node);
                            cloned.children = enrichWithSubscreens(node.children);
                            return cloned;
                        }
                        if (node.widgets && Array.isArray(node.widgets)) {
                            const cloned = Object.assign({}, node);
                            cloned.widgets = enrichWithSubscreens(node.widgets);
                            return cloned;
                        }
                        return node;
                    });
                };

                if (rootTag === 'screen' && Array.isArray(rawTree.children)) {
                    const widgetsNode = rawTree.children.find(c => (c._moquiTag || c.name || c.tag) === 'widgets');
                    if (widgetsNode && Array.isArray(widgetsNode.children)) {
                        return enrichWithSubscreens(widgetsNode.children);
                    }
                    return enrichWithSubscreens(rawTree.children.filter(c => !['transition', 'actions', 'subscreens'].includes(c._moquiTag || c.name || c.tag)));
                }
                if (rootTag === 'widgets' && Array.isArray(rawTree.children)) {
                    return enrichWithSubscreens(rawTree.children);
                }
                return enrichWithSubscreens([rawTree]);
            }
        },
        methods: {

            async loadActiveSubscreenAst() {
                const activeName = this.dynamicSubscreenPath?.[0];
                console.log("🔄 [AgiCanvasEditor] loadActiveSubscreenAst triggered for:", activeName);

                if (!activeName) {
                    this.activeSubscreenTree = null;
                    return;
                }

                const subItem = this.subscreenItems.find(s => s.name === activeName);
                if (!subItem || !subItem.location) {
                    console.warn("⚠️ [AgiCanvasEditor] Subscreen item location not found for:", activeName, this.subscreenItems);
                    this.activeSubscreenTree = null;
                    return;
                }

                console.log("📄 [AgiCanvasEditor] Fetching subscreen AST from location:", subItem.location);
                const activeUser = window.AGI_SERVER_USER_ID || 'system_ide_user';

                try {
                    // 1. Try DB WorkspaceBuffer first
                    const resp = await axios.get(`/rest/s1/agi-ide/getWorkspaceBuffer?artifactUri=${encodeURIComponent(subItem.location)}&userId=${encodeURIComponent(activeUser)}`);
                    if (resp.data && resp.data.metaJsonBuffer) {
                        const parsed = typeof resp.data.metaJsonBuffer === 'string'
                            ? JSON.parse(resp.data.metaJsonBuffer)
                            : resp.data.metaJsonBuffer;
                        console.log("✅ [AgiCanvasEditor] Subscreen AST loaded from buffer:", parsed);
                        this.activeSubscreenTree = parsed;
                        return;
                    }

                    // 2. Fallback: Parse from physical file on disk
                    console.log("📄 [AgiCanvasEditor] Parsing subscreen AST directly from disk for:", subItem.location);
                    const parseResp = await axios.post('/rest/s1/agi-ide/parseXmlToTree', {
                        artifactUri: subItem.location
                    });

                    if (parseResp.data && (parseResp.data.layoutTree || parseResp.data.astTree)) {
                        const tree = parseResp.data.layoutTree || parseResp.data.astTree;
                        console.log("✅ [AgiCanvasEditor] Subscreen AST parsed from disk:", tree);
                        this.activeSubscreenTree = tree;
                    } else {
                        console.warn("⚠️ [AgiCanvasEditor] parseXmlToTree returned empty layoutTree:", parseResp.data);
                        this.activeSubscreenTree = null;
                    }
                } catch (e) {
                    console.error("❌ [AgiCanvasEditor] Failed to load subscreen AST:", e);
                    this.activeSubscreenTree = null;
                }
            },

            handleSandboxedNavigation(subscreenNameOrUrl) {
                const cleanTarget = (subscreenNameOrUrl || '').replace(/^\//, '').trim();
                const matchedSub = this.subscreenItems.find(s =>
                    s.name === cleanTarget ||
                    s.name.toLowerCase() === cleanTarget.toLowerCase() ||
                    (s.menuTitle && s.menuTitle.toLowerCase() === cleanTarget.toLowerCase())
                );

                const displayName = matchedSub ? (matchedSub.menuTitle || matchedSub.name) : cleanTarget;

                // Always switch the active tab in-place inside the canvas!
                this.activeTabModel = cleanTarget;
                this.loadActiveSubscreenAst();

                if (this.isInteractivePreview) {
                    this.$q.notify({
                        type: 'positive',
                        icon: 'tab',
                        message: `Switched view to: ${displayName}`,
                        timeout: 1200
                    });
                } else {
                    this.$q.notify({
                        type: 'info',
                        icon: 'touch_app',
                        message: `Viewing subscreen: ${displayName}`,
                        caption: matchedSub?.location || '',
                        timeout: 1500
                    });
                }
            },
            executeBufferSave() {
                this.$emit('trigger-save', this.effectiveTree);
            },
            confirmDeleteArtifact() {
                if (!this.screenPath) return;
                const confirmed = window.confirm(`Are you sure you want to delete "${this.screenPath}"?`);
                if (!confirmed) return;

                const targetPath = this.screenPath;
                const postData = new URLSearchParams();
                postData.append('artifactLocation', targetPath);
                if (window.AGI_SERVER_CSRF_TOKEN) {
                    postData.append('moquiSessionToken', window.AGI_SERVER_CSRF_TOKEN);
                }

                axios.post('/rest/s1/agi-ide/deleteArtifact', postData.toString(), {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-CSRF-Token': window.AGI_SERVER_CSRF_TOKEN || ''
                    }
                }).then(() => {
                    if (this.contextBus) {
                        this.contextBus.postMessage({
                            event: 'open-screen-artifact',
                            artifactLocation: 'component://nursinghome/screen/nursinghome.xml',
                            artifactType: 'XML',
                            targetComponent: 'nursinghome'
                        });
                    }
                });
            },
            onElementSelected(mariaId) {
                if (!mariaId) return;
                this.selectedMariaId = mariaId;
                this.scrollToNode(mariaId);
            },
            scrollToNode(mariaId) {
                if (!mariaId) return;
                const fieldName = mariaId.includes('#') ? mariaId.split('#').pop() : mariaId;

                this.$nextTick(() => {
                    const allSelected = this.$el.querySelectorAll('.agi-canvas-selected-node, .selected-highlight');
                    allSelected.forEach(el => {
                        el.classList.remove('agi-canvas-selected-node');
                        el.classList.remove('selected-highlight');
                    });

                    const el = this.$el.querySelector(`[data-field-name="${fieldName}"]`)
                        || this.$el.querySelector(`[mariaid="${mariaId}"]`)
                        || this.$el.querySelector(`[data-maria-id="${mariaId}"]`);

                    if (el) {
                        const targetWrapper = el.classList.contains('moqui-field-wrapper') ? el : (el.closest('.moqui-field-wrapper') || el);
                        targetWrapper.classList.add('agi-canvas-selected-node');
                        targetWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                });
            }
        },
        mounted() {
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = (msg) => {
                if (msg.data?.event === 'element-selected-by-id') {
                    this.onElementSelected(msg.data.mariaId);
                }
                if (msg.data?.event === 'artifact-relocated' || msg.data?.event === 'open-screen-artifact') {
                    this.selectedMariaId = '';
                    this.activeTabModel = '';
                }
            };
            this.onWindowSelection = (e) => {
                if (e.detail?.mariaId) {
                    this.onElementSelected(e.detail.mariaId);
                }
            };
            window.addEventListener('element-selected-by-id', this.onWindowSelection);

            this.$nextTick(() => {
                const viewportEl = this.$el.querySelector('#canvas-elements-viewport');
                if (!viewportEl) return;

                this.viewportClickListener = (event) => {
                    const tabEl = event.target.closest('.q-tab');
                    if (tabEl) {
                        event.stopPropagation();
                        event.stopImmediatePropagation();
                        event.preventDefault();

                        const tabLabelEl = tabEl.querySelector('.q-tab__label');
                        const candidateName = tabEl.getAttribute('name')
                            || (tabLabelEl ? tabLabelEl.innerText.trim() : tabEl.innerText.trim());

                        this.handleSandboxedNavigation(candidateName);
                        return;
                    }

                    const btnOrLink = event.target.closest('a, button, [type="submit"], .q-btn');
                    if (btnOrLink && !btnOrLink.classList.contains('agi-action-btn')) {
                        event.stopPropagation();
                        event.stopImmediatePropagation();
                        event.preventDefault();
                    }

                    if (!this.isInteractivePreview) {
                        const targetNode = event.target.closest('.moqui-field-wrapper, [data-field-name], [mariaid], [data-maria-id]');
                        if (targetNode) {
                            event.stopPropagation();
                            event.stopImmediatePropagation();
                            event.preventDefault();

                            const mId = targetNode.getAttribute('data-field-name')
                                || targetNode.getAttribute('mariaid')
                                || targetNode.getAttribute('data-maria-id');

                            if (mId) {
                                this.onElementSelected(mId);
                                if (this.contextBus) {
                                    this.contextBus.postMessage({
                                        event: 'element-selected-by-id',
                                        mariaId: mId
                                    });
                                }
                            }
                        }
                    }
                };

                viewportEl.addEventListener('click', this.viewportClickListener, true);
            });
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
            if (this.onWindowSelection) {
                window.removeEventListener('element-selected-by-id', this.onWindowSelection);
            }
            if (this.viewportClickListener) {
                const viewportEl = this.$el?.querySelector('#canvas-elements-viewport');
                if (viewportEl) {
                    viewportEl.removeEventListener('click', this.viewportClickListener, true);
                }
            }
        },
        template: `
            <div id="canvas-editor-root" class="fit column no-wrap bg-blue-grey-1" style="height: 100%;">
                
                <!-- HEADER BAR WITH MODE SWITCH (DESIGN vs PREVIEW) -->
                <div id="canvas-header-card" class="q-ma-xs q-pa-xs bg-white rounded-borders shadow-1" style="flex: 0 0 auto;">
                    <div id="canvas-title-bar" class="row items-center justify-between">
                        <div class="row items-center q-gutter-x-xs">
                            <span class="text-caption text-weight-bold text-grey-9 font-mono">Visual Canvas</span>
                            
                            <q-btn-toggle
                                v-model="isInteractivePreview"
                                dense rounded no-caps
                                size="xs"
                                :options="[
                                    { label: 'Design', value: false, icon: 'edit' },
                                    { label: 'Preview', value: true, icon: 'play_arrow' }
                                ]"
                                :toggle-color="isInteractivePreview ? 'positive' : 'primary'"
                                color="grey-3"
                                text-color="grey-8"
                            />
                        </div>

                        <div class="row items-center q-gutter-x-xs">
                            <q-btn icon="delete_forever" label="Delete" color="negative" dense flat size="xs" @click="confirmDeleteArtifact" />
                            <q-btn icon="save" label="Save" color="primary" dense unelevated size="xs" @click="executeBufferSave" />
                        </div>
                    </div>

                    <div id="canvas-path-status" class="text-caption text-grey-6 row items-center q-mt-xs" style="font-size: 11px;">
                        <q-icon name="folder" size="14px" class="q-mr-xs text-primary" />
                        <span class="ellipsis col font-mono">{{ screenPath }}</span>
                        <q-badge v-if="isInteractivePreview" color="positive" text-color="white" class="q-ml-xs text-caption" style="font-size: 9px;">
                            INTERACTIVE PREVIEW
                        </q-badge>
                        <q-badge v-else color="grey-7" text-color="white" class="q-ml-xs text-caption" style="font-size: 9px;">
                            CLICK TO SELECT AST
                        </q-badge>
                    </div>
                </div>

                <!-- CANVAS VIEWPORT -->
                <div id="canvas-elements-viewport" class="col overflow-auto q-pa-sm">
                    <template v-if="effectiveTree">
                        <template v-if="canvasWidgetNodes && canvasWidgetNodes.length > 0">
                            <m-blueprint-node 
                                v-for="(childNode, idx) in canvasWidgetNodes" 
                                :key="childNode.mariaId || idx"
                                :node="childNode" 
                                :context="blueprintContext"
                            ></m-blueprint-node>
                        </template>
                
                        <m-blueprint-node 
                            v-else
                            :node="effectiveTree" 
                            :context="blueprintContext"
                        ></m-blueprint-node>
                    </template>
                </div>
            </div>
        `
    };

    window.AgiCanvasEditor = AgiCanvasEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-canvas-editor'] = AgiCanvasEditor;

    const registerAgiCanvasEditor = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            if (!window.moqui.webrootVueApp.component('agi-canvas-editor')) {
                window.moqui.webrootVueApp.component('agi-canvas-editor', AgiCanvasEditor);
            }
        } else {
            setTimeout(registerAgiCanvasEditor, 50);
        }
    };
    registerAgiCanvasEditor();
})();