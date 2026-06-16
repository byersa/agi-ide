(function () {
    window.AgiEditorShareMixin = {
        data() {
            return {
                contextBus: null
            };
        },
        created() {
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');
        },
        mounted() {
            if (this.$el) {
                // Focus tracking: when the container is clicked or receives focus, broadcast focus event
                this.$el.addEventListener('click', this.broadcastEditorFocus);
                this.$el.addEventListener('focusin', this.broadcastEditorFocus);
            }
        },
        beforeUnmount() {
            if (this.$el) {
                this.$el.removeEventListener('click', this.broadcastEditorFocus);
                this.$el.removeEventListener('focusin', this.broadcastEditorFocus);
            }
            if (this.contextBus) {
                this.contextBus.close();
            }
        },
        methods: {
            broadcastEditorFocus() {
                const name = this.$options.name;
                const path = name === 'AgiCanvasEditor' ? this.screenPath : this.artifactLocation;
                if (this.contextBus && name) {
                    this.contextBus.postMessage({
                        event: 'panel-focused',
                        panelName: name,
                        artifactLocation: path
                    });
                }
            }
        }
    };
})();
