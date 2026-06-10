(function() {
    const AgiScreenEditor = {
        name: 'AgiScreenEditor',
        template: `
            <div :class="['screen-editor-container fit column no-wrap q-pa-sm', activeHighlightedMariaId ? 'glow-active' : '']" style="height: 100%;">
                <style>
                    .screen-editor-container {
                        transition: border-color 0.5s ease, box-shadow 0.5s ease;
                        border: 2px solid transparent;
                        height: 100%;
                    }
                    .glow-active {
                        border-color: #3b82f6 !important;
                        box-shadow: 0 0 12px rgba(59, 130, 246, 0.7);
                        animation: borderFlash 1.5s ease;
                    }
                    @keyframes borderFlash {
                        0% { border-color: #3b82f6; }
                        50% { border-color: #60a5fa; }
                        100% { border-color: #3b82f6; }
                    }
                    .xml-textarea {
                        width: 100%;
                        height: 100%;
                        font-family: 'Courier New', Courier, monospace;
                        font-size: 14px;
                        line-height: 18px;
                        color: #1e293b;
                        background-color: #f8fafc;
                        border: 1px solid #cbd5e1;
                        border-radius: 4px;
                        resize: none;
                        outline: none;
                        padding: 8px;
                    }
                </style>
                <div class="q-mb-sm row items-center justify-between">
                    <div class="text-subtitle2 text-grey-8">XML Screen Editor</div>
                    <q-chip v-if="activeHighlightedMariaId" color="primary" text-color="white" icon="gps_fixed" dense size="sm" @click="clearHighlight" clickable>
                        Synced: {{ activeHighlightedMariaId.split('#')[1] || activeHighlightedMariaId }}
                    </q-chip>
                </div>
                <div class="col col-stretch relative-position">
                    <textarea 
                        ref="xmlTextArea"
                        class="xml-textarea fit"
                        :value="rawXmlSource"
                        @input="onTextareaInput"
                    ></textarea>
                </div>
            </div>
        `,
        props: {
            screenPath: {
                type: String,
                required: true
            }
        },
        data() {
            return {
                rawXmlSource: '',
                contextBus: null,
                activeHighlightedMariaId: ''
            };
        },
        mounted() {
            // Initialize cross-window communication channel
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
            
            // Configure message event listener
            this.contextBus.onmessage = (msg) => {
                if (msg.data && msg.data.event === 'element-selected-by-id') {
                    this.highlightCodeLineByMariaId(msg.data.mariaId);
                }
            };

            // Fetch raw XML screen text definition
            fetch('/apps/agi-ide/AgiWorkspace/getRawXml?screenPath=' + encodeURIComponent(this.screenPath))
                .then(res => res.text())
                .then(text => {
                    this.rawXmlSource = text;
                })
                .catch(err => {
                    console.warn("Failed fetching screen XML, loading fallback blueprint code structure", err);
                    this.rawXmlSource = `<?xml version="1.0" encoding="UTF-8"?>
<screen xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" require-authentication="true">
    <widgets>
        <container id="main-layout">
            <form-single name="SampleForm">
                <field name="username">
                    <default-field><text-line/></default-field>
                </field>
                <field name="email">
                    <default-field><text-line/></default-field>
                </field>
            </form-single>
            <link url="submit" text="Submit Action Link" id="submit-btn"/>
            <label text="System Footer Notice"/>
        </container>
    </widgets>
</screen>`;
                });
        },
        beforeUnmount() {
            if (this.contextBus) {
                this.contextBus.close();
            }
        },
        methods: {
            onTextareaInput(event) {
                this.rawXmlSource = event.target.value;
                // Broadcast changes to update layout preview
                this.contextBus.postMessage({
                    event: 'xml-source-mutated',
                    rawXmlText: this.rawXmlSource
                });
            },
            highlightCodeLineByMariaId(mariaId) {
                const elementToken = mariaId.includes('#') ? mariaId.split('#')[1] : mariaId;
                if (!elementToken) return;

                let index = this.rawXmlSource.indexOf('id="' + elementToken + '"');
                if (index === -1) {
                    index = this.rawXmlSource.indexOf('name="' + elementToken + '"');
                }

                let matchIndex = -1;
                if (index === -1 && (elementToken.startsWith('link-') || elementToken.startsWith('label-'))) {
                    const parts = elementToken.split('-');
                    const tagType = parts[0];
                    const targetOccur = parseInt(parts[1], 10);
                    
                    const regex = new RegExp('<' + tagType + '\\b', 'g');
                    let match;
                    let count = 0;
                    while ((match = regex.exec(this.rawXmlSource)) !== null) {
                        if (count === targetOccur) {
                            matchIndex = match.index;
                            break;
                        }
                        count++;
                    }
                }

                const targetIdx = index !== -1 ? index : matchIndex;
                if (targetIdx !== -1) {
                    this.activeHighlightedMariaId = mariaId;
                    const textarea = this.$refs.xmlTextArea;
                    if (textarea) {
                        textarea.focus();
                        textarea.setSelectionRange(targetIdx, targetIdx + elementToken.length + 8);
                        
                        const textBefore = this.rawXmlSource.substring(0, targetIdx);
                        const lineCount = (textBefore.match(/\n/g) || []).length;
                        textarea.scrollTop = lineCount * 18;
                    }
                }
            },
            clearHighlight() {
                this.activeHighlightedMariaId = '';
            }
        }
    };

    window.AgiScreenEditor = AgiScreenEditor;
})();