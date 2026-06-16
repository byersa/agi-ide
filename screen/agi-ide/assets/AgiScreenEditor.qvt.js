(function () {
    const AgiScreenEditor = {
        name: 'AgiScreenEditor',
        mixins: [window.AgiEditorShareMixin],
        template: `
            <div :class="['screen-editor-container fit column no-wrap q-pa-sm', activeHighlightedMariaId ? 'glow-active' : '']" style="height: 100%;">
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
        computed: {
            artifactLocation() {
                return this.screenPath;
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
            // 2. Listen for selection events broadcasting from the Visual Canvas
            this.contextBus.onmessage = (msg) => {
                if (msg.data && msg.data.event === 'element-selected-by-id') {
                    const selectedId = msg.data.mariaId; // e.g., "SampleForm#username"
                    this.highlightAndScrollToSourceElement(selectedId);
                }
            };

            // Fetch raw XML screen text definition
            fetch('/agi-ide/getRawXml?screenPath=' + encodeURIComponent(this.screenPath))
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
            },
            highlightAndScrollToSourceElement(mariaId) {
                // Extract the target widget name from the mariaId compound token
                const elementName = mariaId.split('#')[1]; // yields "username"
                if (!elementName) return;

                const textarea = this.$el.querySelector('.xml-textarea');
                if (!textarea) return;

                const textContent = textarea.value;
                // Search the text buffer for the field or container declaration string
                const targetSearchString = `name="${elementName}"`;
                const index = textContent.indexOf(targetSearchString);

                if (index !== -1) {
                    // Programmatically focus and highlight the text characters inside the source window
                    textarea.focus();
                    textarea.setSelectionRange(index, index + targetSearchString.length);

                    // Compute scroll offset to bring the code line into viewport focus
                    const numLines = textContent.substring(0, index).split('\n').length;
                    const lineHeight = 18; // Matches your custom CSS line-height rule
                    textarea.scrollTop = (numLines - 3) * lineHeight;
                }
            },
        }
    };

    window.AgiScreenEditor = AgiScreenEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-screen-editor'] = AgiScreenEditor;
})();