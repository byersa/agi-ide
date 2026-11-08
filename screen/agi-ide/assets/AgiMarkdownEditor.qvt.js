(function () {
    const AgiMarkdownEditor = {
        name: 'AgiMarkdownEditor',
        props: {
            artifactUri: { type: String, default: '' },
            localScreenPath: { type: String, default: '' },
            targetComponentName: { type: String, default: 'nursinghome' },
            layoutTree: { type: [String, Object], default: '' },
            readOnly: { type: Boolean, default: false }
        },
        emits: ['trigger-save', 'content-changed', 'open-artifact'],
        data() {
            return {
                content: '',
                cmEditor: null,
                isDirty: false,
                previewMode: false,
                copyingOverride: false,
                contextBus: null,
                ignoredFrameworkComponents: ['agi-ide', 'agi-ai', 'moqui-usl', 'mantle-usl', 'webroot', 'tools']
            };
        },
        computed: {
            effectiveUri() {
                return this.artifactUri || this.localScreenPath || '';
            },
            fileName() {
                if (!this.effectiveUri) return 'untitled.md';
                return this.effectiveUri.split('/').pop();
            },
            isFrameworkFile() {
                const uri = this.effectiveUri;
                if (!uri) return false;
                return this.ignoredFrameworkComponents.some(comp =>
                    uri.startsWith(`component://${comp}/`) || uri.startsWith(`/${comp}/`)
                );
            },
            isEffectiveReadOnly() {
                return this.readOnly || this.isFrameworkFile;
            },
            renderedHtml() {
                if (!this.content) return '<span class="text-slate-500 italic">No content.</span>';
                if (window.showdown && typeof window.showdown.Converter === 'function') {
                    const converter = new window.showdown.Converter({ tables: true, strikethrough: true, tasklists: true });
                    return converter.makeHtml(this.content);
                }
                return this.content.replace(/\n/g, '<br/>');
            }
        },
        watch: {
            effectiveUri: {
                immediate: true,
                handler(newUri) {
                    if (newUri) {
                        this.loadFileContent(newUri);
                    }
                }
            },
            layoutTree: {
                immediate: true,
                handler(val) {
                    if (typeof val === 'string' && val !== this.content) {
                        this.content = val;
                        if (this.cmEditor && this.cmEditor.getValue() !== val) {
                            this.cmEditor.setValue(val);
                        }
                    }
                }
            },
            isEffectiveReadOnly: {
                immediate: true,
                handler(val) {
                    if (this.cmEditor) {
                        this.cmEditor.setOption('readOnly', val ? 'nocursor' : false);
                    }
                }
            }
        },
        mounted() {
            const vm = this;
            this.initCodeMirror();

            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = (event) => {
                if (!event.data) return;
                if (event.data.event === 'artifact-saved-to-disk' && event.data.artifactUri === vm.effectiveUri) {
                    vm.isDirty = false;
                }
            };
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },
        methods: {
            resolveCsrfToken() {
                return window.AGI_SERVER_CSRF_TOKEN
                    || (window.moqui && window.moqui.moquiSessionToken)
                    || "";
            },

            initCodeMirror() {
                this.$nextTick(() => {
                    const el = this.$refs.cmContainer;
                    if (!el || this.cmEditor) return;

                    const CodeMirrorFn = window.CodeMirror;
                    if (!CodeMirrorFn) {
                        setTimeout(() => this.initCodeMirror(), 100);
                        return;
                    }

                    this.cmEditor = CodeMirrorFn(el, {
                        value: this.content || '',
                        mode: 'markdown',
                        theme: 'darcula',
                        lineNumbers: true,
                        lineWrapping: true,
                        readOnly: this.isEffectiveReadOnly ? 'nocursor' : false,
                        extraKeys: {
                            'Ctrl-S': () => this.handleSave(),
                            'Cmd-S': () => this.handleSave()
                        }
                    });

                    this.cmEditor.on('change', () => {
                        const val = this.cmEditor.getValue();
                        if (val !== this.content) {
                            this.content = val;
                            if (!this.isEffectiveReadOnly) {
                                this.isDirty = true;
                                this.$emit('content-changed', { artifactUri: this.effectiveUri, content: val });
                                if (this.contextBus) {
                                    this.contextBus.postMessage({
                                        event: 'artifact-state-mutated',
                                        artifactUri: this.effectiveUri
                                    });
                                }
                            }
                        }
                    });
                });
            },

            async loadFileContent(uri) {
                if (!uri) return;
                try {
                    const resp = await axios.get(`/rest/s1/agi-ide/getWorkspaceBuffer`, {
                        params: {
                            artifactUri: uri,
                            userId: window.AGI_SERVER_USER_ID || 'system_ide_user'
                        },
                        headers: { 'moquiSessionToken': this.resolveCsrfToken() }
                    });

                    let text = '';
                    if (resp.data && resp.data.metaJsonBuffer) {
                        text = typeof resp.data.metaJsonBuffer === 'string'
                            ? resp.data.metaJsonBuffer
                            : JSON.stringify(resp.data.metaJsonBuffer, null, 2);
                    } else {
                        const fileResp = await axios.get(`/rest/s1/agi-ide/resource?artifactUri=${encodeURIComponent(uri)}`, {
                            headers: { 'moquiSessionToken': this.resolveCsrfToken() }
                        });
                        text = fileResp.data?.content || fileResp.data || '';
                    }

                    this.content = text;
                    this.isDirty = false;
                    if (this.cmEditor) {
                        this.cmEditor.setValue(text);
                        this.cmEditor.clearHistory();
                        this.cmEditor.setOption('readOnly', this.isEffectiveReadOnly ? 'nocursor' : false);
                    }
                } catch (e) {
                    console.warn(`Could not load content for ${uri}:`, e.message);
                }
            },

            handleSave() {
                if (this.isEffectiveReadOnly) {
                    this.$q?.notify({
                        type: 'warning',
                        icon: 'lock',
                        message: 'Read-Only Artifact',
                        caption: 'Framework platform defaults cannot be modified directly.',
                        timeout: 3500
                    });
                    return;
                }

                this.$emit('trigger-save', {
                    artifactUri: this.effectiveUri,
                    xmlContent: this.content,
                    layoutTree: this.content
                });
                this.isDirty = false;
            },

            async copyToOverride() {
                const targetComp = this.targetComponentName || 'nursinghome';
                if (!this.effectiveUri || !targetComp) return;

                this.copyingOverride = true;
                try {
                    const resp = await axios.post('/rest/s1/agi-ide/component/override', {
                        sourceArtifactUri: this.effectiveUri,
                        targetComponent: targetComp
                    }, {
                        headers: { 'moquiSessionToken': this.resolveCsrfToken() }
                    });

                    const targetUri = resp.data?.targetArtifactUri;
                    if (targetUri) {
                        this.$q?.notify({
                            type: 'positive',
                            icon: 'copy_all',
                            message: `Created override in ${targetComp}!`,
                            caption: targetUri,
                            timeout: 3500
                        });

                        // Notify Workspace & Studio to switch to the new editable file
                        if (this.contextBus) {
                            this.contextBus.postMessage({
                                event: 'open-screen-artifact',
                                artifactUri: targetUri,
                                targetComponent: targetComp
                            });
                        }
                        this.$emit('open-artifact', { artifactUri: targetUri });
                        await this.loadFileContent(targetUri);
                    } else {
                        throw new Error(resp.data?.message || 'Failed to create override copy.');
                    }
                } catch (err) {
                    const msg = err.response?.data?.errors || err.response?.data?.message || err.message;
                    this.$q?.notify({
                        type: 'negative',
                        icon: 'report_problem',
                        message: 'Override Creation Failed',
                        caption: msg,
                        timeout: 5000
                    });
                } finally {
                    this.copyingOverride = false;
                }
            }
        },
        template: `
            <div class="fit column no-wrap bg-slate-950 font-mono text-white overflow-hidden relative-position" style="height: 100%; min-height: 0;">
                
                <!-- EDITOR TOOLBAR (28px) -->
                <div class="row items-center justify-between q-px-sm bg-slate-900 border-bottom-dark" style="height: 28px; min-height: 28px; flex: 0 0 28px; border-bottom: 1px solid #334155;">
                    <div class="row items-center q-gutter-x-xs no-wrap ellipsis">
                        <q-icon name="description" size="13px" :color="isFrameworkFile ? 'cyan-4' : 'amber-4'" />
                        <span class="text-caption font-mono text-weight-bold ellipsis" :class="isFrameworkFile ? 'text-cyan-2' : 'text-slate-100'" style="font-size: 11px;">
                            {{ fileName }}
                        </span>

                        <!-- FRAMEWORK READ-ONLY BADGE -->
                        <q-badge 
                            v-if="isFrameworkFile" 
                            color="cyan-10" 
                            text-color="cyan-2" 
                            class="q-ml-xs text-weight-bold font-mono" 
                            style="border: 1px solid #0284c7; font-size: 9px;"
                        >
                            <q-icon name="lock" size="10px" class="q-mr-xs" /> Framework Default (Read-Only)
                        </q-badge>

                        <q-badge v-else-if="isDirty" color="amber-10" text-color="black" class="q-ml-xs text-weight-bolder" style="font-size: 9px;">
                            MODIFIED
                        </q-badge>
                    </div>

                    <div class="row items-center q-gutter-x-xs">
                        <!-- COPY TO OVERRIDE BUTTON: Visible only on read-only framework artifacts -->
                        <q-btn 
                            v-if="isFrameworkFile"
                            flat dense no-caps size="xs"
                            icon="copy_all"
                            :label="'Copy to ' + targetComponentName + ' to Override'"
                            color="amber-3"
                            class="q-px-xs rounded-borders bg-amber-10 text-weight-bolder font-mono"
                            style="border: 1px solid #d97706; font-size: 10px;"
                            :loading="copyingOverride"
                            @click="copyToOverride"
                        >
                            <q-tooltip>Copy this rule into {{ targetComponentName }} to customize it for this domain</q-tooltip>
                        </q-btn>

                        <!-- PREVIEW / RAW TOGGLE -->
                        <q-btn 
                            flat dense no-caps size="xs"
                            :icon="previewMode ? 'code' : 'preview'"
                            :label="previewMode ? 'Raw' : 'Preview'"
                            color="slate-300"
                            class="q-px-xs rounded-borders bg-slate-800"
                            style="border: 1px solid #475569;"
                            @click="previewMode = !previewMode"
                        >
                            <q-tooltip>{{ previewMode ? 'Switch to Raw Markdown' : 'Preview Rendered Markdown' }}</q-tooltip>
                        </q-btn>

                        <!-- SAVE BUTTON: Only visible if NOT a read-only framework file -->
                        <q-btn 
                            v-if="!isEffectiveReadOnly"
                            flat dense no-caps size="xs"
                            icon="save"
                            label="Save"
                            color="teal-3"
                            class="q-px-xs rounded-borders bg-teal-10 text-weight-bolder"
                            style="border: 1px solid #0d9488;"
                            :disabled="!isDirty"
                            @click="handleSave"
                        >
                            <q-tooltip>Save Markdown changes to disk (Ctrl+S)</q-tooltip>
                        </q-btn>
                    </div>
                </div>

                <!-- EDITOR BODY -->
                <div class="col full-width relative-position overflow-hidden" style="flex: 1 1 0%; min-height: 0;">
                    <!-- PREVIEW VIEW -->
                    <div 
                        v-show="previewMode" 
                        class="fit q-pa-md overflow-auto markdown-body font-mono text-caption text-slate-200" 
                        style="line-height: 1.6;"
                        v-html="renderedHtml"
                    ></div>

                    <!-- CODEMIRROR RAW VIEW -->
                    <div 
                        v-show="!previewMode" 
                        ref="cmContainer" 
                        class="fit font-mono text-caption"
                        style="height: 100%;"
                    ></div>
                </div>

            </div>
        `
    };

    window.AgiMarkdownEditor = AgiMarkdownEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['AgiMarkdownEditor'] = AgiMarkdownEditor;
    window.AgiComponents['agi-markdown-editor'] = AgiMarkdownEditor;

    const registerComp = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            window.moqui.webrootVueApp.component('agi-markdown-editor', AgiMarkdownEditor);
        } else {
            setTimeout(registerComp, 50);
        }
    };
    registerComp();
})();