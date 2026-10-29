(function () {
    const AgiMarkdownEditor = {
        name: 'AgiMarkdownEditor',
        template: `
            <div class="fit column no-wrap q-pa-xs font-mono text-white bg-slate-950 relative-position" style="height: 100%; min-height: 0; width: 100%;">
                
                <!-- Header Toolbar (Fixed 32px) -->
                <div class="row items-center justify-between q-px-sm q-py-xs bg-slate-900 rounded-borders q-mb-xs" style="border: 1px solid #334155; height: 32px; min-height: 32px; flex: 0 0 32px;">
                    <div class="row items-center q-gutter-x-sm">
                        <q-icon name="menu_book" color="cyan-3" size="14px" />
                        <span class="text-caption text-weight-bold text-cyan-2" style="font-size: 11px;">COMPONENT INSTRUCTIONS &amp; DIRECTIVES</span>
                        <span class="text-caption text-slate-400" style="font-size: 10px;">[{{ artifactLabel }}]</span>
                        <q-badge v-if="isDirty" color="amber-10" text-color="black" style="font-size: 9px;" class="text-weight-bold">UNSAVED</q-badge>
                    </div>
                    <div class="row items-center q-gutter-x-xs">
                        <q-btn flat dense no-caps icon="refresh" size="xs" color="slate-400" @click="fetchContent" label="Reload">
                            <q-tooltip>Reload from disk</q-tooltip>
                        </q-btn>
                        <q-btn flat dense no-caps icon="delete_sweep" size="xs" color="rose-4" @click="confirmClearContent" label="Clear">
                            <q-tooltip>Wipe component.md and clear working database buffer</q-tooltip>
                        </q-btn>
                        <q-btn icon="save" label="Save (Ctrl+S)" color="primary" dense size="xs" class="q-px-xs text-weight-bold font-mono" @click="saveContent" />
                    </div>
                </div>

                <!-- Textarea Editor Body (Direct Absolute Inset) -->
                <div class="col full-width relative-position rounded-borders overflow-hidden" style="border: 1px solid #334155; flex: 1 1 0%; min-height: 0; height: calc(100% - 36px);">
                    <textarea
                        ref="editorTextarea"
                        class="font-mono text-caption bg-slate-950 text-slate-100 no-outline q-pa-sm"
                        style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%; white-space: pre-wrap; word-break: break-word; resize: none; border: none; outline: none; line-height: 1.5; font-size: 12px; box-sizing: border-box; overflow-y: auto;"
                        v-model="editorText"
                        @input="onInput"
                        @keydown="handleKeyDown"
                        placeholder="Loading markdown directives..."
                        spellcheck="false"
                    ></textarea>
                </div>
            </div>
        `,
        props: {
            screenPath: { type: String, default: '' },
            layoutTree: { type: [Object, Array, String], default: () => '' }
        },
        data() {
            return {
                editorText: '',
                isDirty: false,
                currentUri: this.screenPath || '',
                contextBus: null
            };
        },
        computed: {
            artifactLabel() {
                if (!this.currentUri) return '';
                const parts = this.currentUri.split('/');
                return parts[parts.length - 1];
            }
        },
        watch: {
            screenPath: {
                immediate: true,
                handler(newPath) {
                    if (newPath) {
                        this.currentUri = newPath;
                        this.fetchContent();
                    }
                }
            }
        },
        mounted() {
            const vm = this;
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = (msg) => {
                if (!msg.data) return;

                if (msg.data.event === 'open-screen-artifact' && msg.data.artifactUri) {
                    if (msg.data.artifactUri.endsWith('.md') || msg.data.artifactUri.endsWith('.txt')) {
                        vm.currentUri = msg.data.artifactUri;
                        vm.fetchContent();
                    }
                    return;
                }

                if (msg.data.event === 'directives-updated' || msg.data.event === 'artifact-saved-to-disk') {
                    if (vm.currentUri && (vm.currentUri.endsWith('component.md') || msg.data.artifactUri === vm.currentUri)) {
                        vm.fetchContent();
                    }
                }
            };
            this.fetchContent();
        },
        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },
        methods: {
            resolveCsrfToken() {
                return window.AGI_SERVER_CSRF_TOKEN || (window.moqui && window.moqui.moquiSessionToken) || "";
            },
            onInput() {
                this.isDirty = true;
            },
            handleKeyDown(e) {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    this.saveContent();
                    return;
                }
                if (e.key === 'Tab') {
                    e.preventDefault();
                    const ta = this.$refs.editorTextarea;
                    const start = ta.selectionStart;
                    const end = ta.selectionEnd;
                    this.editorText = this.editorText.substring(0, start) + "    " + this.editorText.substring(end);
                    this.$nextTick(() => {
                        ta.selectionStart = ta.selectionEnd = start + 4;
                    });
                }
            },
            async fetchContent() {
                if (!this.currentUri) return;
                try {
                    const headers = { 'moquiSessionToken': this.resolveCsrfToken() };
                    const resp = await axios.get('/rest/s1/agi-ide/getRawXml', {
                        params: { artifactUri: this.currentUri },
                        headers
                    });
                    this.editorText = resp.data?.rawText || resp.data?.rawXml || '';
                    this.isDirty = false;
                } catch (err) {
                    console.error("Failed to load markdown text:", err);
                }
            },
            confirmClearContent() {
                this.$q.dialog({
                    title: 'Clear Instructions Directives?',
                    message: `Are you sure you want to completely clear ${this.artifactLabel}? This will erase the file on disk, the database workspace buffer, and the active discussion draft payload.`,
                    cancel: true,
                    persistent: true,
                    dark: true
                }).onOk(async () => {
                    const activeUser = window.AGI_SERVER_USER_ID || 'ANONYMOUS';
                    const headers = {
                        'moquiSessionToken': this.resolveCsrfToken(),
                        'Content-Type': 'application/json'
                    };

                    try {
                        // 1. Wipe the file on disk
                        await axios.post('/rest/s1/agi-ide/saveScreenXml', {
                            artifactUri: this.currentUri,
                            xmlText: '',
                            metaJsonBuffer: '',
                            verifyEntities: false,
                            autoCorrect: false,
                            autoStubSubscreens: false
                        }, { headers });

                        // 2. Clear DB workspace buffer record
                        await axios.post('/rest/s1/agi-ide/clearWorkspaceBuffer', {
                            artifactUri: this.currentUri,
                            userId: activeUser
                        }, { headers });

                        // 3. Clear the discussion draft AgiPayload record so pinning starts completely fresh
                        if (window.__agiCurrentDiscussionId || (this.$parent && this.$parent.activeDiscussionId)) {
                            const discId = window.__agiCurrentDiscussionId || this.$parent.activeDiscussionId;
                            await axios.post(`/rest/s1/agi-ai/discussions/${discId}/directives`, {
                                directivesText: '',
                                targetComponent: 'nursinghome'
                            }, { headers }).catch(() => { });
                        }

                        this.editorText = '';
                        this.isDirty = false;

                        this.$q.notify({
                            type: 'positive',
                            icon: 'delete_sweep',
                            message: `Cleared ${this.artifactLabel} and reset draft payload.`
                        });

                        if (this.contextBus) {
                            this.contextBus.postMessage({
                                event: 'artifact-saved-to-disk',
                                artifactUri: this.currentUri
                            });
                            this.contextBus.postMessage({
                                event: 'directives-updated',
                                targetComponent: 'nursinghome'
                            });
                        }
                    } catch (err) {
                        this.$q.notify({
                            type: 'negative',
                            icon: 'report_problem',
                            message: 'Clear failed: ' + (err.response?.data?.errors || err.message)
                        });
                    }
                });
            },
            async saveContent() {
                const activeUser = window.AGI_SERVER_USER_ID || 'ANONYMOUS';
                const headers = {
                    'moquiSessionToken': this.resolveCsrfToken(),
                    'Content-Type': 'application/json'
                };
                try {
                    await axios.post('/rest/s1/agi-ide/saveScreenXml', {
                        artifactUri: this.currentUri,
                        xmlText: this.editorText,
                        metaJsonBuffer: this.editorText,
                        verifyEntities: false,
                        autoCorrect: false,
                        autoStubSubscreens: false
                    }, { headers });

                    await axios.post('/rest/s1/agi-ide/storeWorkspaceBuffer', {
                        artifactUri: this.currentUri,
                        userId: activeUser,
                        metaJsonBuffer: this.editorText
                    }, { headers });

                    this.isDirty = false;
                    this.$q?.notify({
                        type: 'positive',
                        icon: 'save',
                        message: `Saved ${this.artifactLabel} to disk!`,
                        timeout: 2500
                    });

                    if (this.contextBus) {
                        this.contextBus.postMessage({
                            event: 'artifact-saved-to-disk',
                            artifactUri: this.currentUri
                        });
                        this.contextBus.postMessage({
                            event: 'directives-updated',
                            targetComponent: 'nursinghome'
                        });
                    }
                } catch (err) {
                    this.$q?.notify({
                        type: 'negative',
                        icon: 'report_problem',
                        message: 'Save failed: ' + (err.response?.data?.errors || err.message)
                    });
                }
            }
        }
    };

    window.AgiMarkdownEditor = AgiMarkdownEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['AgiMarkdownEditor'] = AgiMarkdownEditor;
    window.AgiComponents['agi-markdown-editor'] = AgiMarkdownEditor;

    const registerAgiMarkdownEditor = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            if (!window.moqui.webrootVueApp.component('agi-markdown-editor')) {
                window.moqui.webrootVueApp.component('agi-markdown-editor', AgiMarkdownEditor);
            }
        } else {
            setTimeout(registerAgiMarkdownEditor, 50);
        }
    };
    registerAgiMarkdownEditor();
})();