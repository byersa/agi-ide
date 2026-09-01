(function () {
    const AgiCanvasEditor = {
        name: 'AgiCanvasEditor',
        mixins: [window.AgiEditorShareMixin].filter(m => m !== undefined),
        template: `
            <div id="canvas-editor-root" class="fit q-pa-md bg-blue-grey-1" style="height: 100%;">
                <div id="canvas-header-card" class="q-mb-md q-pa-sm bg-white rounded-borders shadow-1">
                    <div id="canvas-title-bar" class="row items-center justify-between">
                        <span class="text-subtitle1 text-weight-bold text-grey-9">Visual Canvas Workspace</span>
                        <div class="row items-center q-gutter-x-sm">
                            <q-btn icon="delete_forever" label="Delete Artifact" color="negative" dense flat @click="confirmDeleteArtifact" />
                            <q-btn icon="save" label="Save Changes" color="primary" dense unelevated @click="executeBufferSave" />
                        </div>
                    </div>
                    <div id="canvas-path-status" class="text-caption text-grey-6 row items-center q-mt-xs">
                        <q-icon name="folder" size="xs" class="q-mr-xs" />
                        <span>Active Path:</span>
                        <span class="text-weight-medium q-ml-xs text-primary">{{ screenPath }}</span>
                    </div>
                </div>

                <!-- NATIVE QMETA BLUEPRINT RENDERER ENGINE -->
                <div id="canvas-elements-viewport" class="column no-wrap items-stretch full-width" @click="handleCanvasClick">
                    <template v-if="effectiveTree">
                        <template v-if="canvasWidgetNodes && canvasWidgetNodes.length > 0">
                            <m-blueprint-node 
                                v-for="(childNode, idx) in canvasWidgetNodes" 
                                :key="childNode.mariaId || idx"
                                :node="childNode" 
                                :context="{ 
                                    selectedMariaId: selectedMariaId,
                                    currentPathList: dynamicSubscreenPath,
                                    subscreens: parsedTree.subscreens
                                }"
                            ></m-blueprint-node>
                        </template>
                
                        <m-blueprint-node 
                            v-else
                            :node="effectiveTree" 
                            :context="{ 
                                selectedMariaId: selectedMariaId,
                                currentPathList: dynamicSubscreenPath,
                                subscreens: effectiveTree.subscreens
                            }"
                        ></m-blueprint-node>
                    </template>
                </div>
            </div>
        `,
        props: {
            screenPath: { type: String, required: true },
            layoutTree: { type: Object, default: () => null }
        },
        data() {
            return {
                selectedMariaId: '',
                contextBus: null
            };
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
            canvasWidgetNodes() {
                const rawTree = this.parsedTree;
                if (!rawTree) return [];
                const rootTag = rawTree._moquiTag || rawTree.name || rawTree.tag;
                if (rootTag === 'screen' && Array.isArray(rawTree.children)) {
                    const widgetsNode = rawTree.children.find(c => (c._moquiTag || c.name || c.tag) === 'widgets');
                    if (widgetsNode && Array.isArray(widgetsNode.children)) {
                        return widgetsNode.children;
                    }
                    return rawTree.children.filter(c => !['transition', 'actions', 'subscreens'].includes(c._moquiTag || c.name || c.tag));
                }
                if (rootTag === 'widgets' && Array.isArray(rawTree.children)) {
                    return rawTree.children;
                }
                return [rawTree];
            },
            dynamicSubscreenPath() {
                const tree = this.parsedTree;
                if (!tree) return [];
                const defaultSub = tree.subscreens?.defaultItem;
                if (defaultSub && defaultSub.length > 0) return [defaultSub];
                const subChildren = tree.subscreens?.children || [];
                if (subChildren.length > 0 && subChildren[0].name) return [subChildren[0].name];
                return [];
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
                }
            };
            this.onWindowSelection = (e) => {
                if (e.detail?.mariaId) {
                    this.onElementSelected(e.detail.mariaId);
                }
            };
            window.addEventListener('element-selected-by-id', this.onWindowSelection);
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
            if (this.onWindowSelection) {
                window.removeEventListener('element-selected-by-id', this.onWindowSelection);
            }
        },
        methods: {
            executeBufferSave() {
                this.$emit('trigger-save', this.effectiveTree);
            },
            confirmDeleteArtifact() {
                if (!this.screenPath) return;
                const confirmed = window.confirm(`Are you sure you want to completely delete "${this.screenPath}"?\n\nThis will purge the physical file, buffer cache, and screen registry.`);
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
                })
                    .then(resp => {
                        console.info("🗑️ Artifact deleted successfully:", resp.data);

                        try {
                            const rawHistory = localStorage.getItem('agi_recent_artifact_history');
                            if (rawHistory) {
                                const historyArr = JSON.parse(rawHistory);
                                const updated = historyArr.filter(h => (h.value !== targetPath && h.artifactPath !== targetPath));
                                localStorage.setItem('agi_recent_artifact_history', JSON.stringify(updated));
                            }
                            localStorage.removeItem(`agi_buffer_${targetPath}`);
                        } catch (storageErr) {
                            console.warn("Could not sync localStorage after delete:", storageErr);
                        }

                        if (this.contextBus) {
                            this.contextBus.postMessage({
                                event: 'artifact-deleted',
                                artifactLocation: targetPath
                            });
                        }
                        window.dispatchEvent(new CustomEvent('artifact-deleted', {
                            detail: { artifactLocation: targetPath }
                        }));

                        if (this.contextBus) {
                            this.contextBus.postMessage({
                                event: 'open-screen-artifact',
                                artifactLocation: 'component://nursinghome/screen/nursinghome.xml',
                                artifactType: 'XML',
                                targetComponent: 'nursinghome'
                            });
                        }
                    })
                    .catch(err => {
                        console.error("Failed to delete artifact:", err);
                        alert("Error deleting artifact: " + (err.response?.data?.messages || err.message));
                    });
            },
            onElementSelected(mariaId) {
                if (!mariaId) return;
                this.selectedMariaId = mariaId;
                this.scrollToNode(mariaId);
            },
            handleCanvasClick(event) {
                const target = event.target.closest('.moqui-field-wrapper, [data-field-name], [mariaid], [data-maria-id]');
                if (!target) return;
                event.stopPropagation();
                const mId = target.getAttribute('data-field-name')
                    || target.getAttribute('mariaid')
                    || target.getAttribute('data-maria-id');

                if (mId) {
                    this.onElementSelected(mId);
                    if (this.contextBus) {
                        this.contextBus.postMessage({
                            event: 'element-selected-by-id',
                            mariaId: mId
                        });
                    }
                }
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
                        || this.$el.querySelector(`[data-maria-id="${mariaId}"]`)
                        || this.$el.querySelector(`[mariaid$="#${fieldName}"]`);

                    if (el) {
                        const targetWrapper = el.classList.contains('moqui-field-wrapper') ? el : (el.closest('.moqui-field-wrapper') || el);
                        targetWrapper.classList.add('agi-canvas-selected-node');
                        targetWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        targetWrapper.classList.add('pulse-highlight');
                        setTimeout(() => targetWrapper.classList.remove('pulse-highlight'), 800);
                    }
                });
            }
        }
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