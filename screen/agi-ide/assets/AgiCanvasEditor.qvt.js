(function () {
    // 1. Recursive Layout Component
    const AgiCanvasNode = {
        name: 'AgiCanvasNode',
        props: {
            node: {
                type: Object,
                required: true
            },
            selectedMariaId: {
                type: String,
                default: ''
            }
        },
        emits: ['node-click'],
        template: `
        <component 
            :is="resolveQuasarTag(node.type)"
            :class="[getNodeClasses(node), node.mariaId === selectedMariaId ? 'selected-highlight' : '']"
            v-bind="mapNodeAttributes(node)"
            @click.stop="$emit('node-click', node)"
        >
            {{ node.text }}

            <agi-canvas-node 
                v-for="child in node.children" 
                :key="child.mariaId" 
                :node="child"
                :selected-maria-id="selectedMariaId"
                @node-click="$emit('node-click', $event)"
            />
        </component>
         `,
        methods: {
            resolveQuasarTag(type) {
                if (!type) return 'div';
                // FIXED: Normalize evaluation string and catch your actual backend widget types
                switch (type.toLowerCase()) {
                    case 'container':
                    case 'webroot': return 'div';
                    case 'form':
                    case 'formsingle': return 'q-form';
                    case 'field-row': return 'div';
                    case 'text-field':
                    case 'formfield': return 'q-input';
                    case 'submit':
                    case 'link': return 'q-btn';
                    case 'label': return 'div';
                    default: return 'div';
                }
            },
            hasInputs(type) {
                if (!type) return false;
                const t = type.toLowerCase();
                return t === 'formfield' || t === 'text-field';
            },
            getNodeClasses(node) {
                let baseClass = 'agi-canvas-element-wrapper ';
                if (!node.type) return baseClass;

                // Provide clear baseline styles matching the widget block characteristics
                switch (node.type.toLowerCase()) {
                    case 'formsingle':
                    case 'container': baseClass += 'q-pa-md q-my-sm bg-white rounded-borders shadow-1 full-width column q-gutter-y-sm'; break;
                    case 'formfield': baseClass += 'q-my-xs block full-width'; break;
                    case 'link': baseClass += 'q-mt-md block text-left'; break;
                    case 'label': baseClass += 'text-body2 text-grey-7 q-py-xs block'; break;
                    default: baseClass += 'q-pa-sm block';
                }
                return baseClass;
            },
            mapNodeAttributes(node) {
                if (!node.type) return {};
                const t = node.type.toLowerCase();

                // FIXED: Translate properties cleanly into attributes Quasar targets can parse
                if (t === 'formfield' || t === 'text-field') {
                    return {
                        label: node.text || node.name || 'Form Control',
                        outlined: true,
                        dense: true,
                        'model-value': '', // Default stub initialization to make input responsive
                        class: 'bg-white'
                    };
                }
                if (t === 'link' || t === 'submit') {
                    return {
                        label: node.text || 'Action Execute',
                        color: 'primary',
                        unelevated: true,
                        dense: false
                    };
                }
                return {};
            },
            onElementClick() {
                // Emit coordinates back up the rendering tree chain
                this.$emit('node-click', this.node);
            }
        }
    };

    window.AgiComponents['agi-canvas-node'] = AgiCanvasNode;

    // 2. Main Canvas Editor Component
    const AgiCanvasEditor = {
        name: 'AgiCanvasEditor',
        components: {
            AgiCanvasNode
        },
        template: `
            <q-scroll-area class="fit q-pa-md bg-blue-grey-1" style="height: 100%;">
                
                <div class="q-mb-md q-pa-sm bg-white rounded-borders shadow-1">
                    <div class="text-subtitle1 text-weight-bold text-grey-9">Visual Canvas Workspace</div>
                    <div class="text-caption text-grey-6 row items-center">
                        <q-icon name="folder" size="xs" class="q-mr-xs"/>
                        Active Path: <span class="text-weight-medium q-ml-xs text-primary">{{ screenPath }}</span>
                    </div>
                </div>

                <div class="column no-wrap items-stretch full-width">
                    <agi-canvas-node 
                        v-for="rootNode in blueprintTree" 
                        :key="rootNode.mariaId" 
                        :node="rootNode" 
                        :selected-maria-id="selectedMariaId"
                        @node-click="handleVisualNodeClick"
                    ></agi-canvas-node>
                </div>
            </q-scroll-area>
        `,
        props: {
            screenPath: {
                type: String,
                required: true
            }
        },
        data() {
            return {
                blueprintTree: [],
                selectedMariaId: '',
                contextBus: null
            };
        },
        mounted() {
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');

            this.contextBus.onmessage = (msg) => {
                if (msg.data && msg.data.event === 'element-selected-by-id') {
                    this.selectedMariaId = msg.data.mariaId;
                    this.scrollToNode(msg.data.mariaId);
                }
            };

            // Fetch compiled metadata JSON payload
            fetch('/agi-ide/getFormMetadata?screenPath=' + encodeURIComponent(this.screenPath), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            })
                .then(res => res.text()) // Grab raw response text buffer
                .then(rawText => {
                    let sanitizedText = rawText.trim();

                    // 1. SELF-HEALING: Stitch missing sibling object commas
                    sanitizedText = sanitizedText.replace(/\}\s*\{/g, '},{');

                    // 2. SELF-HEALING: Map json-ld "@type" tokens to flat standard "type" keys
                    sanitizedText = sanitizedText.replace(/"@type"/g, '"type"');

                    // Compile safe JSON structure map
                    const data = JSON.parse(sanitizedText);

                    // 3. STRUCTURAL NORMALIZATION: Map Moqui's root "widgets" array to "children"
                    if (data && data.widgets && !data.children) {
                        console.info("Mapping backend root 'widgets' payload array to 'children' schema.");
                        data.children = data.widgets;
                    }

                    // Normalize single object layout envelopes safely into the template array
                    if (data && !Array.isArray(data)) {
                        this.blueprintTree = [data];
                    } else {
                        this.blueprintTree = data || [];
                    }
                })
                .catch(err => {
                    console.warn("Telemetry processing circuit interrupted, utilizing fallbacks:", err);
                    this.blueprintTree = [
                        {
                            mariaId: "node_1",
                            type: "Container",
                            id: "main-layout",
                            screen: this.screenPath,
                            children: [
                                {
                                    mariaId: "node_2",
                                    type: "FormSingle",
                                    id: "SampleForm",
                                    screen: this.screenPath,
                                    children: [
                                        { mariaId: "node_3", type: "FormField", name: "username", text: "Username Input Field", screen: this.screenPath }
                                    ]
                                }
                            ]
                        }
                    ];
                });
        },
        beforeUnmount() {
            if (this.contextBus) {
                this.contextBus.close();
            }
        },
        methods: {
            handleVisualNodeClick(clickedNode) {
                this.selectedMariaId = clickedNode.mariaId;

                this.contextBus.postMessage({
                    event: 'element-selected-by-id',
                    mariaId: clickedNode.mariaId,
                    screen: clickedNode.screen
                });

                this.scrollToNode(clickedNode.mariaId);
            },
            scrollToNode(mariaId) {
                this.$nextTick(() => {
                    const el = this.$el.querySelector(`[mariaid="${mariaId}"]`) || document.querySelector(`[mariaid="${mariaId}"]`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        el.classList.add('pulse-highlight');
                        setTimeout(() => el.classList.remove('pulse-highlight'), 1000);
                    }
                });
            }
        }
    };

    window.AgiCanvasEditor = AgiCanvasEditor;
    if (!window.AgiComponents) window.AgiComponents = {};
    window.AgiComponents['agi-canvas-editor'] = AgiCanvasEditor;
})();