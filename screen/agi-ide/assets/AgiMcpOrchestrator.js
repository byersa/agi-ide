(function () {
    class AgiMcpOrchestrator {
        constructor() {
            // The central in-memory tool map registry
            this.registry = new Map();
            this.contextBus = new BroadcastChannel('agi-ide-context-bus');

            console.info("⚡ AgiMcpOrchestrator initialized as global functional unit.");
        }

        /**
         * Register or hot-reload a tool into the live engine registry
         */
        registerTool(toolDefinition) {
            if (!toolDefinition || !toolDefinition.command) return;

            this.registry.set(toolDefinition.command, {
                command: toolDefinition.command,
                description: toolDefinition.description || '',
                scope: toolDefinition.scope || 'Global',
                // Expects a pure functional execution script
                execute: toolDefinition.execute
            });

            console.info(`📦 Tool Registered/Updated in active registry: ${toolDefinition.command}`);
        }

        /**
         * Execute a tool surgically outside of Vue's core boundaries
         */
        executeTool(command, currentTree, targetMariaId) {
            const tool = this.registry.get(command);
            if (!tool) {
                console.warn(`Execution rejected: Tool ${command} not found in registry.`);
                return;
            }

            try {
                console.group(`🛠️ Executing Registry Action: ${command}`);

                // 1. Run the pure mutation function against the data tree object
                const updatedTree = tool.execute(currentTree, targetMariaId);

                // 2. Universal Broadcast: Notify passive editors to re-render the fresh layout state
                this.contextBus.postMessage({
                    event: 'artifact-state-mutated',
                    panelName: tool.scope, // e.g., 'AgiCanvasEditor'
                    mutatedTree: updatedTree
                });

                console.groupEnd();
            } catch (error) {
                console.error(`Execution failed inside tool logic block [${command}]:`, error);
                console.groupEnd();
            }
        }

        /**
         * Return registered tools filtered by active viewport focus context
         */
        getToolsForContext(panelName) {
            const activeTools = [];
            this.registry.forEach(tool => {
                if (tool.scope === 'Global' || tool.scope === panelName) {
                    activeTools.push({
                        command: tool.command,
                        description: tool.description,
                        scope: tool.scope
                    });
                }
            });
            return activeTools;
        }
    }

    // Bind to the window layer as a single, global runtime instance
    window.AgiMcpEngine = new AgiMcpOrchestrator();
})();