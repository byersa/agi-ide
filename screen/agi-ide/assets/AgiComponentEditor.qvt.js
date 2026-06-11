(function () {
    const AgiComponentEditor = {
        name: 'AgiComponentEditor',
        template: `
            <div :class="['component-editor-container fit column no-wrap q-pa-sm', activeHighlightedMariaId ? 'glow-active' : '']" style="height: 100%;">
                <div class="q-mb-sm row items-center justify-between">
                    <div class="text-subtitle2 text-grey-8">XML Component Editor</div>
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
            // 2. Listen for selection events broadcasting from the Visual Canvas
            this.contextBus.onmessage = (msg) => {
                if (msg.data && msg.data.event === 'element-selected-by-id') {
                    const selectedId = msg.data.mariaId; // e.g., "SampleForm#username"
                    this.highlightAndScrollToSourceElement(selectedId);
                }
            };

            // Fetch raw XML component text definition
            fetch('/agi-ide/getRawXml?screenPath=' + encodeURIComponent(this.screenPath))
                .then(res => res.text())
                .then(text => {
                    this.rawXmlSource = text;
                })
                .catch(err => {
                    console.warn("Failed fetching component XML, loading fallback blueprint code structure", err);
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
                if (!mariaId) return;

                // 1. Extract the raw name/id after the '#' divider token safely
                // Works for "SampleForm#admission_hull" or "path/to/file.xml#fullName"
                const elementId = mariaId.split('#')[1];
                if (!elementId) return;

                // 2. Target your local text wrapper layout container
                const textarea = this.$el.querySelector('textarea') || document.querySelector('.xml-textarea');
                if (!textarea) return;

                const textContent = textarea.value;

                // 3. DEFENSIVE PATTERN MATCH: Scan for name="id" OR id="id" inside the XML layout markup
                let targetString = `name="${elementId}"`;
                let index = textContent.indexOf(targetString);

                if (index === -1) {
                    targetString = `id="${elementId}"`;
                    index = textContent.indexOf(targetString);
                }

                // 4. If located inside the text buffer, execute the viewport jump
                if (index !== -1) {
                    textarea.focus();

                    // Highlight the target text block markers
                    textarea.setSelectionRange(index, index + targetString.length);

                    // Compute exact line heights scroll coordinates programmatically
                    const linesUpToMatch = textContent.substring(0, index).split('\n').length;
                    const baselineLineHeight = 20; // Adjust slightly to match your panel CSS

                    // Center the found line inside the panel viewport area
                    textarea.scrollTop = (linesUpToMatch - 4) * baselineLineHeight;
                    console.info(`🎯 Text editor synchronized cursor to line ${linesUpToMatch} for element: ${elementId}`);
                }
            },
        }
    };

    window.AgiComponentEditor = AgiComponentEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-component-editor'] = AgiComponentEditor;
})();
