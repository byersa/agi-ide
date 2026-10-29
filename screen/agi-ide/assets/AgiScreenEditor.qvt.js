(function () {
    const AgiScreenEditor = {
        name: 'AgiScreenEditor',
        mixins: [window.AgiEditorShareMixin].filter(m => m !== undefined),
        template: `
            <div :class="['screen-editor-container fit column no-wrap q-pa-xs', activeHighlightedMariaId ? 'glow-active' : '']" style="height: 100%; min-height: 0;">
                
                <component is="style">
                    .screen-editor-container .CodeMirror {
                        height: 100% !important;
                        width: 100% !important;
                        font-family: monospace;
                        font-size: 12px;
                    }
                    .screen-editor-container .CodeMirror-scroll {
                        height: 100% !important;
                        min-height: 100% !important;
                    }
                </component>

                <!-- Toolbar Header -->
                <div class="q-mb-xs row items-center justify-between" style="flex: 0 0 auto;">
                    <div class="row items-center q-gutter-x-sm">
                        <span class="text-caption text-weight-bold font-mono" :class="isMarkdownArtifact ? 'text-amber-4' : 'text-grey-4'">
                            {{ isMarkdownArtifact ? 'DIRECTIVES &amp; TEXT EDITOR' : 'XML SCREEN EDITOR' }}
                        </span>
                        <span v-if="currentArtifactUri" class="text-caption text-cyan-3 font-mono text-weight-bold" style="font-size: 11px;">
                            [{{ currentArtifactLabel }}]
                        </span>
                        <q-btn icon="save" label="Save (Ctrl+S)" color="primary" dense size="xs" class="q-px-xs font-mono" @click="executeBufferSave" />
                    </div>
                    
                    <div class="row items-center q-gutter-x-xs">
                        <q-chip 
                            v-for="(svc, idx) in detectedTransitionServices"
                            :key="idx"
                            color="amber-10" 
                            text-color="black" 
                            icon="bolt" 
                            dense size="sm" 
                            clickable
                            class="text-weight-bold font-mono"
                            @click="jumpToServiceEditor(svc)"
                        >
                            <q-tooltip>Open {{ svc.serviceName }} in AgiServiceEditor</q-tooltip>
                            Service: {{ svc.serviceName }}
                        </q-chip>

                        <q-chip 
                            v-if="activeHighlightedMariaId" 
                            color="primary" 
                            text-color="white" 
                            icon="gps_fixed" 
                            dense size="sm" 
                            @click="clearHighlight" 
                            clickable
                        >
                            Synced: {{ displayElementName }}
                        </q-chip>
                    </div>
                </div>

                <!-- Code Editor Container -->
                <div class="col full-width relative-position rounded-borders overflow-hidden" style="border: 1px solid #334155; min-height: 0; flex: 1 1 0%; height: 100%;">
                    <div ref="cmHost" class="fit" style="height: 100%; width: 100%;"></div>
                </div>
            </div>
        `,

        props: {
            screenPath: { type: String, default: '' },
            layoutTree: { type: [Object, Array, String], default: () => [] }
        },

        data() {
            return {
                cmInstance: null,
                rawXmlSource: '',
                currentArtifactUri: this.screenPath || '',
                activeHighlightedMariaId: '',
                contextBus: null,
                activeTextMarker: null,
                localBlueprintTree: { id: "root", tagName: "screen", children: [] },
                isViewingVirtualBuffer: false,
                isUserTyping: false,
                instanceEditorId: 'editor_' + Math.random().toString(36).substring(2, 9)
            };
        },

        computed: {
            isMarkdownArtifact() {
                const u = (this.currentArtifactUri || '').toLowerCase();
                return u.endsWith('.md') || u.endsWith('.txt');
            },

            isJsonArtifact() {
                const u = (this.currentArtifactUri || '').toLowerCase();
                return u.endsWith('.json');
            },

            currentArtifactLabel() {
                if (!this.currentArtifactUri) return '';
                const parts = this.currentArtifactUri.split('/');
                return parts[parts.length - 1];
            },

            displayElementName() {
                if (!this.activeHighlightedMariaId) return '';
                const parts = this.activeHighlightedMariaId.split('#');
                return parts[parts.length - 1] || this.activeHighlightedMariaId;
            },

            detectedTransitionServices() {
                const results = [];
                if (this.isMarkdownArtifact || !this.localBlueprintTree) return results;

                const scanTree = (node) => {
                    if (!node || typeof node !== 'object') return;

                    const tag = node.name || node._moquiTag || node.tagName;
                    if (tag === 'transition') {
                        const tName = node.attributes?.name || '';
                        const findServiceCall = (subNode) => {
                            if (!subNode || typeof subNode !== 'object') return;
                            const subTag = subNode.name || subNode._moquiTag || subNode.tagName;
                            if (subTag === 'service-call') {
                                const sName = subNode.attributes?.name || '';
                                if (sName) {
                                    results.push({
                                        transitionName: tName,
                                        serviceName: sName
                                    });
                                }
                            }
                            const children = subNode.children || subNode.widgets || [];
                            if (Array.isArray(children)) children.forEach(findServiceCall);
                        };
                        const children = node.children || node.widgets || [];
                        if (Array.isArray(children)) children.forEach(findServiceCall);
                    }

                    const children = node.children || node.widgets || [];
                    if (Array.isArray(children)) children.forEach(scanTree);
                };

                scanTree(this.localBlueprintTree);

                if (results.length === 0 && this.rawXmlSource && !this.isMarkdownArtifact) {
                    const svcMatch = this.rawXmlSource.match(/<service-call\s+name=["']([^"']+)["']/);
                    if (svcMatch && svcMatch[1]) {
                        results.push({
                            transitionName: 'transition',
                            serviceName: svcMatch[1]
                        });
                    }
                }

                return results;
            }
        },

        watch: {
            screenPath: {
                immediate: true,
                handler(newPath) {
                    if (newPath) {
                        this.currentArtifactUri = newPath;
                        this.isViewingVirtualBuffer = false;
                        this.fetchRemoteScreenBuffer(newPath);
                    }
                }
            },
            layoutTree: {
                handler(newTree) {
                    if (this.isUserTyping) return;
                    if (this.isMarkdownArtifact) {
                        if (typeof newTree === 'string' && newTree.trim().length > 0) {
                            if (this.cmInstance && this.cmInstance.getValue() !== newTree) {
                                this.setEditorContent(newTree);
                            }
                        }
                        return;
                    }
                    if (newTree && !this.isViewingVirtualBuffer) {
                        let treeObj = newTree;
                        if (typeof newTree === 'string' && newTree.trim().startsWith('{')) {
                            try { treeObj = JSON.parse(newTree.trim()); } catch (e) { }
                        }
                        if (treeObj && typeof treeObj === 'object') {
                            const newJson = JSON.stringify(treeObj);
                            const oldJson = JSON.stringify(this.localBlueprintTree || {});
                            if (newJson !== oldJson) {
                                this.localBlueprintTree = treeObj;
                                this.compileTreeToXmlText();
                            }
                        }
                    }
                },
                deep: true
            }
        },

        mounted() {
            this.initOrRefreshEditor();

            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = (msg) => {
                if (!msg.data || msg.data.originId === this.instanceEditorId) return;

                if (msg.data.event === 'open-screen-artifact') {
                    this.handleOpenScreenArtifact(msg.data);
                }

                if (msg.data.event === 'element-selected-by-id') {
                    this.highlightAndScrollToSourceElement(msg.data.mariaId, msg.data.node);
                }

                if (msg.data.event === 'artifact-relocated') {
                    this.clearHighlight();
                }
            };

            this.onWindowSelection = (e) => {
                if (e.detail?.event === 'element-selected-by-id' || e.detail?.mariaId) {
                    this.highlightAndScrollToSourceElement(e.detail.mariaId, e.detail.node);
                }
            };
            window.addEventListener('element-selected-by-id', this.onWindowSelection);

            this.onWindowOpenArtifact = (e) => {
                if (e.detail?.event === 'open-screen-artifact' || e.detail?.artifactUri) {
                    this.handleOpenScreenArtifact(e.detail);
                }
            };
            window.addEventListener('open-screen-artifact', this.onWindowOpenArtifact);

            window.addEventListener('resize', this.forceEditorRefresh);
        },

        beforeUnmount() {
            window.removeEventListener('resize', this.forceEditorRefresh);
            if (this.contextBus) this.contextBus.close();
            if (this.onWindowSelection) window.removeEventListener('element-selected-by-id', this.onWindowSelection);
            if (this.onWindowOpenArtifact) window.removeEventListener('open-screen-artifact', this.onWindowOpenArtifact);
            if (this.cmInstance) {
                this.cmInstance.toTextArea?.();
                this.cmInstance = null;
            }
        },

        methods: {
            forceEditorRefresh() {
                if (this.cmInstance) {
                    this.$nextTick(() => {
                        this.cmInstance.refresh();
                    });
                }
            },

            getAppropriateMode() {
                if (this.isMarkdownArtifact) {
                    return (window.CodeMirror && CodeMirror.modes && CodeMirror.modes.markdown) ? 'text/x-markdown' : 'text/plain';
                }
                if (this.isJsonArtifact) return 'application/json';
                return 'application/xml';
            },

            initOrRefreshEditor(attempts = 0) {
                if (typeof CodeMirror === 'undefined') {
                    if (attempts < 20) setTimeout(() => this.initOrRefreshEditor(attempts + 1), 50);
                    return;
                }

                const host = this.$refs.cmHost;
                if (!host || host.offsetWidth === 0) {
                    if (attempts < 20) setTimeout(() => this.initOrRefreshEditor(attempts + 1), 50);
                    return;
                }

                if (this.cmInstance) {
                    this.cmInstance.setOption('mode', this.getAppropriateMode());
                    this.cmInstance.refresh();
                    return;
                }

                host.innerHTML = '';

                this.cmInstance = CodeMirror(host, {
                    value: this.rawXmlSource || '',
                    mode: this.getAppropriateMode(),
                    htmlMode: false,
                    theme: 'material-darker',
                    lineNumbers: true,
                    lineWrapping: true,
                    tabSize: 4,
                    indentUnit: 4,
                    undoDepth: 200
                });

                this.cmInstance.on('focus', () => {
                    this.cmInstance.refresh();
                });

                this.cmInstance.on('change', (cm, change) => {
                    if (change.origin === 'setValue') return;
                    this.isUserTyping = true;
                    this.rawXmlSource = cm.getValue();

                    clearTimeout(this._busDebounce);
                    this._busDebounce = setTimeout(() => {
                        if (this.contextBus) {
                            this.contextBus.postMessage({
                                event: 'xml-source-mutated',
                                originId: this.instanceEditorId,
                                rawXmlText: this.rawXmlSource
                            });
                        }
                    }, 350);

                    clearTimeout(this._typingTimeout);
                    this._typingTimeout = setTimeout(() => {
                        this.isUserTyping = false;
                    }, 500);
                });

                this.cmInstance.setSize('100%', '100%');
                this.$nextTick(() => {
                    setTimeout(() => this.cmInstance?.refresh(), 60);
                });
            },

            handleOpenScreenArtifact(payload) {
                if (!payload) return;
                const uri = payload.artifactUri || payload.screenPath || payload.artifactLocation || '';
                const xml = payload.stagedXml || payload.rawXmlContent || '';
                const tree = payload.layoutTree || payload.astTree || null;

                if (uri) {
                    this.currentArtifactUri = uri;
                }

                if (xml && typeof xml === 'string' && xml.trim().length > 0) {
                    this.isViewingVirtualBuffer = true;
                    this.setEditorContent(xml);
                    return;
                }

                if (tree && typeof tree === 'object' && !this.isMarkdownArtifact) {
                    this.isViewingVirtualBuffer = false;
                    this.localBlueprintTree = JSON.parse(JSON.stringify(tree));
                    this.compileTreeToXmlText();
                    return;
                }

                if (uri) {
                    this.isViewingVirtualBuffer = false;
                    this.fetchRemoteScreenBuffer(uri);
                }
            },

            setEditorContent(text) {
                if (this.isUserTyping) return;

                let content = text || '';

                const isXml = (this.currentArtifactUri || '').endsWith('.xml');
                if (isXml) {
                    const trimmed = (typeof content === 'string') ? content.trim() : '';

                    if (typeof content === 'object' || trimmed.startsWith('{')) {
                        console.warn("🛡️ [AgiScreenEditor] Intercepted non-XML JSON payload targeted for XML editor. Compiling or fetching raw XML instead.");

                        let candidateObj = (typeof content === 'object') ? content : null;
                        if (!candidateObj && trimmed.startsWith('{')) {
                            try { candidateObj = JSON.parse(trimmed); } catch (e) { }
                        }

                        if (candidateObj?.rawXmlContent && typeof candidateObj.rawXmlContent === 'string' && candidateObj.rawXmlContent.trim().startsWith('<')) {
                            content = candidateObj.rawXmlContent.trim();
                        } else if (candidateObj?.astTree || candidateObj?.layoutTree) {
                            this.localBlueprintTree = candidateObj.astTree || candidateObj.layoutTree;
                            this.compileTreeToXmlText();
                            return;
                        } else {
                            this.fetchRemoteScreenBuffer(this.currentArtifactUri);
                            return;
                        }
                    }
                }

                this.rawXmlSource = content;

                if (!this.cmInstance) {
                    this.initOrRefreshEditor();
                    return;
                }

                if (this.cmInstance.getValue() !== this.rawXmlSource) {
                    try {
                        this.cmInstance.setValue(this.rawXmlSource);
                        this.cmInstance.clearHistory();
                    } catch (e) {
                        this.cmInstance = null;
                        this.initOrRefreshEditor();
                        return;
                    }
                }

                this.cmInstance.setOption('mode', this.getAppropriateMode());
                this.$nextTick(() => {
                    setTimeout(() => this.cmInstance?.refresh(), 50);
                });
            },

            async fetchRemoteScreenBuffer(uri) {
                if (!uri) return;
                const headers = {};
                if (window.AGI_SERVER_CSRF_TOKEN) {
                    headers['X-CSRF-Token'] = window.AGI_SERVER_CSRF_TOKEN;
                }

                const isXml = uri.endsWith('.xml');

                try {
                    if (isXml) {
                        try {
                            const rawResp = await axios.get('/rest/s1/agi-ide/getRawXml', {
                                params: { artifactUri: uri },
                                headers
                            });
                            const rawText = rawResp.data?.rawText || rawResp.data?.rawXml || '';
                            if (rawText && rawText.trim().startsWith('<')) {
                                this.setEditorContent(rawText.trim());
                                return;
                            }
                        } catch (rawErr) {
                            console.warn("Direct raw XML read failed, falling back to buffer:", rawErr.message);
                        }
                    }

                    const resp = await axios.get('/rest/s1/agi-ide/getWorkspaceBuffer', {
                        params: { artifactUri: uri },
                        headers
                    });

                    const buffer = resp.data?.metaJsonBuffer || resp.data?.bufferText || resp.data?.fileContent || resp.data?.xmlText || '';

                    if (buffer) {
                        if (isXml) {
                            if (typeof buffer === 'object') {
                                this.localBlueprintTree = JSON.parse(JSON.stringify(buffer));
                                await this.compileTreeToXmlText();
                                return;
                            } else if (typeof buffer === 'string' && buffer.trim().startsWith('{')) {
                                try {
                                    const parsed = JSON.parse(buffer.trim());
                                    if (parsed.rawXmlContent && parsed.rawXmlContent.trim().startsWith('<')) {
                                        this.setEditorContent(parsed.rawXmlContent.trim());
                                        return;
                                    }
                                    this.localBlueprintTree = parsed.astTree || parsed.layoutTree || parsed;
                                    await this.compileTreeToXmlText();
                                    return;
                                } catch (ignore) { }
                            }
                        }

                        const contentToDisplay = (typeof buffer === 'object') ? JSON.stringify(buffer, null, 2) : buffer;
                        this.setEditorContent(contentToDisplay);
                        return;
                    }

                    const rawResp = await axios.get('/rest/s1/agi-ide/getRawXml', {
                        params: { artifactUri: uri },
                        headers
                    });
                    const rawText = rawResp.data?.rawText || rawResp.data?.rawXml || '';
                    if (rawText) {
                        this.setEditorContent(rawText);
                    }
                } catch (e) {
                    console.warn(`Could not load remote buffer for ${uri}:`, e.message);
                }
            },

            async compileTreeToXmlText() {
                if (this.isMarkdownArtifact || !this.localBlueprintTree || typeof this.localBlueprintTree !== 'object') return;
                const vm = this;
                const headers = {};
                if (window.AGI_SERVER_CSRF_TOKEN) {
                    headers['X-CSRF-Token'] = window.AGI_SERVER_CSRF_TOKEN;
                }

                try {
                    const response = await axios.post('/rest/s1/agi-ide/compileTreeToXml', {
                        layoutTree: this.localBlueprintTree
                    }, { headers });

                    const xml = response.data?.xmlText || '';
                    if (xml && xml.trim().startsWith('<')) {
                        vm.setEditorContent(xml.trim());
                    } else {
                        if (vm.currentArtifactUri && vm.currentArtifactUri.endsWith('.xml')) {
                            vm.fetchRemoteScreenBuffer(vm.currentArtifactUri);
                        }
                    }
                } catch (err) {
                    console.error("Error compiling tree to XML:", err);
                    if (vm.currentArtifactUri && vm.currentArtifactUri.endsWith('.xml')) {
                        vm.fetchRemoteScreenBuffer(vm.currentArtifactUri);
                    }
                }
            },

            executeBufferSave() {
                const content = this.cmInstance ? this.cmInstance.getValue() : this.rawXmlSource;
                this.$emit('trigger-save', {
                    artifactUri: this.currentArtifactUri,
                    xmlContent: content,
                    layoutTree: this.isMarkdownArtifact ? content : (this.localBlueprintTree || this.layoutTree)
                });
            },

            clearHighlight() {
                this.activeHighlightedMariaId = '';
                if (this.activeTextMarker) {
                    this.activeTextMarker.clear();
                    this.activeTextMarker = null;
                }
            },

            jumpToServiceEditor(svc) {
                if (!svc || !svc.serviceName) return;

                let uri = '';
                const rawName = svc.serviceName.trim();

                if (rawName.includes('#')) {
                    const beforeVerb = rawName.substring(0, rawName.lastIndexOf('.'));
                    const parts = beforeVerb.split('.').filter(p => p !== 'service');
                    const comp = parts[0] || 'nursinghome';
                    const fileParts = parts.slice(1);

                    uri = `component://${comp}/service/${fileParts.join('/')}.xml`;
                }

                const payload = {
                    event: 'open-service-artifact',
                    serviceName: svc.serviceName,
                    serviceUri: uri,
                    transitionName: svc.transitionName
                };

                if (this.contextBus) this.contextBus.postMessage(payload);
                window.dispatchEvent(new CustomEvent('open-service-artifact', { detail: payload }));
            },

            highlightAndScrollToSourceElement(mariaId, nodeData = null) {
                if (!mariaId || !this.cmInstance || this.isMarkdownArtifact) return;

                const genericSubTags = [
                    'default-field', 'header-field', 'text-line', 'date-time',
                    'drop-down', 'check', 'radio', 'text-find', 'display', 'hidden'
                ];

                const parts = mariaId.toString().split('#').filter(p => !genericSubTags.includes(p));
                const rawElementName = parts[parts.length - 1] || mariaId;
                const elementName = nodeData?.attributes?.name || (nodeData?.name && !genericSubTags.includes(nodeData.name) ? nodeData.name : rawElementName);

                const doc = this.cmInstance.getDoc();
                const text = doc.getValue();
                if (!text || !elementName) return;

                const searchPatterns = [
                    `name="${elementName}"`,
                    `<field name="${elementName}"`,
                    `id="${elementName}"`,
                    `<${elementName}`
                ];

                let targetIndex = -1;
                let patternLen = 0;

                for (let pattern of searchPatterns) {
                    const idx = text.indexOf(pattern);
                    if (idx !== -1) {
                        targetIndex = idx;
                        patternLen = pattern.length;
                        break;
                    }
                }

                if (targetIndex !== -1) {
                    this.activeHighlightedMariaId = mariaId;
                    if (this.activeTextMarker) this.activeTextMarker.clear();

                    const startPos = doc.posFromIndex(targetIndex);
                    const endPos = doc.posFromIndex(targetIndex + patternLen);

                    this.activeTextMarker = doc.markText(startPos, endPos, {
                        className: 'cm-selected-xml-node'
                    });

                    this.cmInstance.scrollIntoView({ from: startPos, to: endPos }, 80);
                    this.cmInstance.setSelection(startPos, endPos);
                }
            }
        }
    };

    window.AgiScreenEditor = AgiScreenEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-screen-editor'] = AgiScreenEditor;

    const registerAgiScreenEditor = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            if (!window.moqui.webrootVueApp.component('agi-screen-editor')) {
                window.moqui.webrootVueApp.component('agi-screen-editor', AgiScreenEditor);
            }
        } else {
            setTimeout(registerAgiScreenEditor, 50);
        }
    };
    registerAgiScreenEditor();
})();