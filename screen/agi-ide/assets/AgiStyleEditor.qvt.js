(function () {
    const AgiStyleEditor = {
        name: 'AgiStyleEditor',
        mixins: [window.AgiEditorShareMixin].filter(m => m !== undefined),
        template: `
            <div id="style-editor-root" class="fit column no-wrap q-pa-sm bg-grey-10 text-white" style="height: 100%;">
                
                <!-- 1. Header Toolbar -->
                <div class="q-mb-xs row items-center justify-between bg-black q-pa-xs rounded-borders" style="border: 1px solid #334155;">
                    <div class="row items-center q-gutter-x-sm">
                        <q-icon name="palette" color="purple-4" size="20px" />
                        <span class="text-subtitle2 text-weight-bold font-mono text-purple-3">Style & CSS Inspector</span>
                    </div>

                    <div class="row items-center q-gutter-x-xs">
                        <q-tabs v-model="activeTab" dense active-color="purple-3" indicator-color="purple-4" class="text-grey-4">
                            <q-tab name="computed" icon="visibility" label="Computed & Hierarchy" no-caps />
                            <q-tab name="theme" icon="style" label="Theme Tokens" no-caps />
                            <q-tab name="css" icon="code" label="Custom CSS" no-caps />
                        </q-tabs>
                    </div>
                </div>

                <!-- 2. TAB 1: COMPUTED CSS & INHERITANCE PATH -->
                <div v-if="activeTab === 'computed'" class="col column no-wrap overflow-hidden">
                    
                    <!-- Selected Target Badge & Contrast Card -->
                    <div v-if="selectedNodeInspection" class="q-mb-xs q-pa-sm bg-grey-9 rounded-borders" style="border: 1px solid #455a64;">
                        <div class="row items-center justify-between q-mb-xs">
                            <div class="row items-center q-gutter-x-xs font-mono text-caption text-weight-bold text-cyan-4">
                                <q-icon name="gps_fixed" size="xs" />
                                <span>&lt;{{ selectedNodeInspection.tagName }}&gt; ({{ selectedNodeInspection.mariaId }})</span>
                            </div>
                            <q-badge :color="selectedNodeInspection.contrastPass ? 'positive' : 'negative'" class="font-mono text-caption text-weight-bold">
                                WCAG: {{ selectedNodeInspection.contrastRatio }}:1 ({{ selectedNodeInspection.contrastPass ? 'PASS' : 'FAIL' }})
                            </q-badge>
                        </div>

                        <!-- Color Swatches Row -->
                        <div class="row items-center justify-between text-caption font-mono text-grey-1">
                            <div class="row items-center q-gutter-x-md">
                                <div class="row items-center q-gutter-x-xs">
                                    <span class="text-weight-medium text-grey-4">Text color:</span>
                                    <div class="rounded-borders" :style="{ width: '14px', height: '14px', backgroundColor: selectedNodeInspection.computedColor, border: '1px solid #94a3b8' }"></div>
                                    <span class="font-mono text-weight-bold text-white">{{ selectedNodeInspection.computedColor }}</span>
                                </div>
                                <div class="row items-center q-gutter-x-xs">
                                    <span class="text-weight-medium text-grey-4">Background:</span>
                                    <div class="rounded-borders" :style="{ width: '14px', height: '14px', backgroundColor: selectedNodeInspection.computedBg, border: '1px solid #94a3b8' }"></div>
                                    <span class="font-mono text-weight-bold text-white">{{ selectedNodeInspection.computedBg }}</span>
                                </div>
                            </div>
                            <q-btn 
                                v-if="!selectedNodeInspection.contrastPass"
                                icon="auto_fix_high" 
                                label="Fix Contrast in AI" 
                                color="deep-purple-7" 
                                dense no-caps size="xs" 
                                class="q-px-sm"
                                @click="sendContrastFixToPrompt(selectedNodeInspection)"
                            />
                        </div>
                    </div>

                    <div v-else class="q-pa-md text-center text-grey-4 font-mono text-caption bg-grey-9 rounded-borders q-mb-xs">
                        Click any element in Canvas Editor to inspect its computed cascade and inheritance path.
                    </div>

                    <!-- Computed CSS Rules Hierarchy View -->
                    <div class="col overflow-auto bg-black rounded-borders q-pa-sm" style="border: 1px solid #334155;">
                        <div class="text-caption text-weight-bold text-cyan-4 font-mono q-mb-xs row items-center">
                            <q-icon name="account_tree" size="xs" class="q-mr-xs" /> MATCHED CSS SELECTORS & CASCADE
                        </div>
                        
                        <q-list dense separator v-if="selectedNodeInspection && selectedNodeInspection.matchedRules.length > 0">
                            <q-item v-for="(rule, rIdx) in selectedNodeInspection.matchedRules" :key="rIdx" class="q-pa-xs column">
                                <div class="row items-center justify-between text-caption font-mono text-purple-3 text-weight-bold">
                                    <span>{{ rule.selector }}</span>
                                    <span class="text-grey-4" style="font-size: 10px;">{{ rule.source || 'stylesheet' }}</span>
                                </div>
                                <div class="q-pl-sm font-mono text-caption text-slate-200" style="font-size: 11px;">
                                    <div v-for="(val, prop) in rule.declarations" :key="prop" class="row">
                                        <span class="text-cyan-3">{{ prop }}:</span>&nbsp;<span>{{ val }};</span>
                                    </div>
                                </div>
                            </q-item>
                        </q-list>

                        <div v-else class="text-caption text-grey-4 italic q-pa-sm">
                            {{ selectedNodeInspection ? 'No direct external rule matches found (element relies on inherited browser defaults).' : 'Awaiting element selection.' }}
                        </div>
                    </div>
                </div>

                <!-- 3. TAB 2: DECLARATIVE THEME TOKENS -->
                <div v-else-if="activeTab === 'theme'" class="col column no-wrap overflow-hidden">
                    <div class="q-mb-xs q-pa-xs row items-center justify-between text-caption font-mono bg-grey-9 rounded-borders text-slate-200">
                        <span>Artifact: <span class="text-purple-3">{{ themeArtifactUri }}</span></span>
                        <q-btn icon="save" label="Save Theme" dense flat color="purple-4" size="xs" @click="executeThemeSave" />
                    </div>

                    <div class="col overflow-auto">
                        <q-list dense separator class="bg-black rounded-borders" style="border: 1px solid #334155;">
                            <q-expansion-item 
                                v-for="(group, groupKey) in tokenCategories" 
                                :key="groupKey"
                                default-opened dense
                                header-class="bg-grey-9 text-purple-3 text-weight-bold font-mono text-caption"
                                :icon="group.icon"
                                :label="group.label"
                            >
                                <div class="q-pa-xs q-gutter-y-xs">
                                    <div v-for="tokenKey in group.keys" :key="tokenKey" class="row items-center justify-between q-py-xs" :data-token="tokenKey">
                                        <div class="col-6 column">
                                            <span class="text-caption font-mono text-slate-200">{{ tokenKey }}</span>
                                            <span class="text-caption text-slate-400" style="font-size: 10px;">{{ getTokenDescription(tokenKey) }}</span>
                                        </div>
                                        <div class="col-6 row items-center justify-end q-gutter-x-xs">
                                            <template v-if="isColorToken(tokenKey)">
                                                <div class="cursor-pointer rounded-borders shadow-1" :style="{ width: '22px', height: '22px', backgroundColor: activeTokens[tokenKey], border: '1px solid #64748b' }">
                                                    <q-popup-proxy cover><q-color v-model="activeTokens[tokenKey]" @update:model-value="(val) => onTokenMutated(tokenKey, val)" /></q-popup-proxy>
                                                </div>
                                                <q-input v-model="activeTokens[tokenKey]" dense outlined dark input-class="font-mono text-caption q-pa-none text-center text-white" style="width: 90px;" @update:model-value="(val) => onTokenMutated(tokenKey, val)" />
                                            </template>
                                            <template v-else>
                                                <q-input v-model="activeTokens[tokenKey]" dense outlined dark input-class="font-mono text-caption q-pa-none text-center text-white" style="width: 110px;" @update:model-value="(val) => onTokenMutated(tokenKey, val)" />
                                            </template>
                                        </div>
                                    </div>
                                </div>
                            </q-expansion-item>
                        </q-list>
                    </div>
                </div>

                <!-- 4. TAB 3: CUSTOM STYLESHEET EDITOR -->
                <div v-else-if="activeTab === 'css'" class="col column no-wrap overflow-hidden">
                    <div class="q-mb-xs q-pa-xs row items-center justify-between text-caption font-mono bg-grey-9 rounded-borders text-slate-200">
                        <span>Live Stylesheet: <span class="text-cyan-3">agi-custom.css</span></span>
                        <q-btn icon="bolt" label="Apply In-Memory" dense flat color="cyan-4" size="xs" @click="applyLiveCustomCss" />
                    </div>
                    <textarea 
                        v-model="customCssBuffer"
                        class="col full-width font-mono text-caption q-pa-sm rounded-borders"
                        style="background-color: #020617; color: #f8fafc; border: 1px solid #334155; resize: none; font-size: 12px; line-height: 16px;"
                        placeholder="/* Enter custom CSS rules to inject directly into canvas */"
                        @input="applyLiveCustomCss"
                    ></textarea>
                </div>

            </div>
        `,

        props: {
            themeUri: {
                type: String,
                default: 'component://nursinghome/theme/default.theme.json'
            },
            initialTokens: {
                type: Object,
                default: () => null
            }
        },

        data() {
            return {
                activeTab: 'computed',
                contextBus: null,
                themeArtifactUri: this.themeUri,
                selectedNodeInspection: null,
                customCssBuffer: '/* Custom runtime overrides */\n.moqui-field-wrapper {\n    margin-bottom: 6px;\n}',
                activeTokens: {
                    '--agi-brand-primary': '#1976D2',
                    '--agi-brand-secondary': '#455A64',
                    '--agi-brand-accent': '#00897B',
                    '--agi-surface-ground': '#F8FAFC',
                    '--agi-surface-panel': '#FFFFFF',
                    '--agi-surface-header': '#F1F5F9',
                    '--agi-text-main': '#0F172A',
                    '--agi-text-muted': '#64748B',
                    '--agi-border-subtle': '#CBD5E1',
                    '--agi-state-positive': '#21BA45',
                    '--agi-state-warning': '#F2C037',
                    '--agi-state-negative': '#C10015',
                    '--agi-state-info': '#31CCEC',
                    '--agi-radius-panel': '6px',
                    '--agi-radius-control': '4px'
                },
                tokenCategories: {
                    brand: { label: 'Brand & Accents', icon: 'brush', keys: ['--agi-brand-primary', '--agi-brand-secondary', '--agi-brand-accent'] },
                    surfaces: { label: 'Surfaces & Backgrounds', icon: 'layers', keys: ['--agi-surface-ground', '--agi-surface-panel', '--agi-surface-header'] },
                    typography: { label: 'Typography & Borders', icon: 'title', keys: ['--agi-text-main', '--agi-text-muted', '--agi-border-subtle'] },
                    states: { label: 'Feedback States', icon: 'traffic', keys: ['--agi-state-positive', '--agi-state-warning', '--agi-state-negative', '--agi-state-info'] },
                    geometry: { label: 'Geometry & Spacing', icon: 'crop_free', keys: ['--agi-radius-panel', '--agi-radius-control'] }
                }
            };
        },

        mounted() {
            if (this.initialTokens && Object.keys(this.initialTokens).length > 0) {
                this.activeTokens = { ...this.activeTokens, ...this.initialTokens };
            }

            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            this.contextBus.onmessage = (msg) => {
                if (msg.data?.event === 'element-selected-by-id') {
                    this.focusTokenForNode(msg.data.node);
                    this.inspectComputedNode(msg.data.mariaId);
                }
            };

            this.loadThemeArtifact();
            this.applyTokensToDocument(this.activeTokens);
            this.applyLiveCustomCss();
        },

        beforeUnmount() {
            if (this.contextBus) this.contextBus.close();
        },

        methods: {
            async loadThemeArtifact() {
                if (!this.themeArtifactUri) return;
                try {
                    const resp = await axios.get(`/rest/s1/agi-ide/getThemeJson?artifactUri=${encodeURIComponent(this.themeArtifactUri)}`);
                    const data = resp.data?.themeData;
                    if (data && data.tokens) {
                        this.activeTokens = { ...this.activeTokens, ...data.tokens };
                        this.applyTokensToDocument(this.activeTokens);
                        console.info(`🎨 [AgiStyleEditor] Loaded theme tokens from ${this.themeArtifactUri}`);
                    }
                } catch (err) {
                    console.warn("⚠️ Could not load remote theme artifact, using local defaults.", err);
                    this.applyTokensToDocument(this.activeTokens);
                }
            },

            isColorToken(key) {
                return !key.includes('radius') && !key.includes('spacing') && !key.includes('width');
            },

            getTokenDescription(key) {
                const descs = {
                    '--agi-brand-primary': 'Main buttons and primary highlights',
                    '--agi-brand-secondary': 'Secondary toolbars, tabs, and badges',
                    '--agi-brand-accent': 'Focus rings, callout badges, accents',
                    '--agi-surface-ground': 'Outer viewport background tone',
                    '--agi-surface-panel': 'Form cards, boxes, and modal surfaces',
                    '--agi-surface-header': 'Box headers and panel title bars',
                    '--agi-text-main': 'Main high-contrast body and label text',
                    '--agi-text-muted': 'Helper labels, placeholders, subtitles',
                    '--agi-border-subtle': 'Panel boundaries and input outlines',
                    '--agi-state-positive': 'Success confirmations and active status',
                    '--agi-state-warning': 'Pending alerts and warning badges',
                    '--agi-state-negative': 'Validation errors and destructive actions',
                    '--agi-state-info': 'Informational chips and system notices',
                    '--agi-radius-panel': 'Corner radius for cards and container boxes',
                    '--agi-radius-control': 'Corner radius for inputs, selects, buttons'
                };
                return descs[key] || 'CSS Theme Variable';
            },

            onTokenMutated(tokenKey, val) {
                if (!val) return;
                document.documentElement.style.setProperty(tokenKey, val);
                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'theme-token-mutated',
                        tokenKey: tokenKey,
                        value: val,
                        tokens: { ...this.activeTokens }
                    });
                }
            },

            applyTokensToDocument(tokens) {
                if (!tokens) return;
                Object.entries(tokens).forEach(([k, v]) => {
                    document.documentElement.style.setProperty(k, v);
                });
            },

            applyLiveCustomCss() {
                let styleEl = document.getElementById('agi-injected-custom-css');
                if (!styleEl) {
                    styleEl = document.createElement('style');
                    styleEl.id = 'agi-injected-custom-css';
                    document.head.appendChild(styleEl);
                }
                styleEl.innerHTML = this.customCssBuffer;
            },

            inspectComputedNode(mariaId) {
                if (!mariaId) return;
                this.$nextTick(() => {
                    const el = document.querySelector(`[data-maria-id="${mariaId}"]`)
                        || document.querySelector(`[mariaid="${mariaId}"]`);
                    if (!el) return;

                    const computed = window.getComputedStyle(el);
                    const bgColor = computed.backgroundColor;
                    const textColor = computed.color;
                    const contrast = this.calculateContrastRatio(textColor, bgColor);

                    const matchedRules = [];
                    try {
                        for (const sheet of document.styleSheets) {
                            try {
                                const rules = sheet.cssRules || sheet.rules;
                                for (const r of rules) {
                                    if (r instanceof CSSStyleRule && el.matches(r.selectorText)) {
                                        const decls = {};
                                        for (let i = 0; i < r.style.length; i++) {
                                            const prop = r.style[i];
                                            decls[prop] = r.style.getPropertyValue(prop);
                                        }
                                        matchedRules.push({
                                            selector: r.selectorText,
                                            source: sheet.href ? sheet.href.split('/').pop() : 'inline',
                                            declarations: decls
                                        });
                                    }
                                }
                            } catch (e) { }
                        }
                    } catch (e) { }

                    this.selectedNodeInspection = {
                        mariaId: mariaId,
                        tagName: el.tagName.toLowerCase(),
                        computedColor: textColor,
                        computedBg: bgColor,
                        contrastRatio: contrast.ratio,
                        contrastPass: contrast.ratio >= 4.5,
                        matchedRules: matchedRules.slice(-5)
                    };
                });
            },

            calculateContrastRatio(fg, bg) {
                const getLuminance = (rgbStr) => {
                    const rgb = (rgbStr.match(/\d+/g) || [0, 0, 0]).map(Number);
                    const a = rgb.map(v => {
                        v /= 255;
                        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
                    });
                    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
                };

                const l1 = getLuminance(fg) + 0.05;
                const l2 = getLuminance(bg) + 0.05;
                const ratio = l1 > l2 ? l1 / l2 : l2 / l1;
                return { ratio: parseFloat(ratio.toFixed(2)) };
            },

            sendContrastFixToPrompt(inspection) {
                const payload = {
                    event: 'open-prompt-editor',
                    focusCoordinate: inspection.mariaId,
                    targetComponent: 'nursinghome',
                    adHocPrompt: `Fix text/background color clash on [${inspection.mariaId}]. Computed text is ${inspection.computedColor} on background ${inspection.computedBg} (Contrast ratio ${inspection.contrastRatio}:1). Reconcile using standard --agi-* theme variables.`
                };
                if (window.__agiContextBus) window.__agiContextBus.postMessage(payload);
                window.dispatchEvent(new CustomEvent('open-prompt-editor', { detail: payload }));
            },

            focusTokenForNode(node) {
                if (!node) return;
                const tag = (node._moquiTag || node.name || '').toLowerCase();
                if (['submit', 'q-btn', 'link'].includes(tag)) {
                    this.highlightCategory('brand', '--agi-brand-primary');
                } else if (['container-box', 'box-body', 'form-single'].includes(tag)) {
                    this.highlightCategory('surfaces', '--agi-surface-panel');
                } else if (['box-header', 'screen-header'].includes(tag)) {
                    this.highlightCategory('surfaces', '--agi-surface-header');
                } else if (['field', 'default-field', 'label'].includes(tag)) {
                    this.highlightCategory('typography', '--agi-text-main');
                } else if (['text-line', 'drop-down', 'date-time'].includes(tag)) {
                    this.highlightCategory('geometry', '--agi-radius-control');
                }
            },

            highlightCategory(categoryKey, tokenKey) {
                this.$nextTick(() => {
                    const el = this.$el.querySelector(`[data-token="${tokenKey}"]`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                });
            },

            resetToDefaults() {
                this.activeTokens = {
                    '--agi-brand-primary': '#1976D2',
                    '--agi-brand-secondary': '#455A64',
                    '--agi-brand-accent': '#00897B',
                    '--agi-surface-ground': '#F8FAFC',
                    '--agi-surface-panel': '#FFFFFF',
                    '--agi-surface-header': '#F1F5F9',
                    '--agi-text-main': '#0F172A',
                    '--agi-text-muted': '#64748B',
                    '--agi-border-subtle': '#CBD5E1',
                    '--agi-state-positive': '#21BA45',
                    '--agi-state-warning': '#F2C037',
                    '--agi-state-negative': '#C10015',
                    '--agi-state-info': '#31CCEC',
                    '--agi-radius-panel': '6px',
                    '--agi-radius-control': '4px'
                };
                this.applyTokensToDocument(this.activeTokens);
            },

            executeThemeSave() {
                const payload = {
                    themeUri: this.themeArtifactUri,
                    tokens: this.activeTokens
                };
                this.$emit('trigger-save', payload);
                if (this.contextBus) {
                    this.contextBus.postMessage({
                        event: 'theme-save-requested',
                        payload: payload
                    });
                }
            }
        }
    };

    window.AgiStyleEditor = AgiStyleEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-style-editor'] = AgiStyleEditor;

    const registerAgiStyleEditor = () => {
        if (window.moqui && window.moqui.webrootVueApp) {
            if (!window.moqui.webrootVueApp.component('agi-style-editor')) {
                window.moqui.webrootVueApp.component('agi-style-editor', AgiStyleEditor);
            }
        } else {
            setTimeout(registerAgiStyleEditor, 50);
        }
    };
    registerAgiStyleEditor();
})();