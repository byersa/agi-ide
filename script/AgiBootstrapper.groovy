// agi-ide/script/AgiBootstrapper.groovy
import org.moqui.context.ExecutionContext

ExecutionContext ec = context.ec ?: org.moqui.Moqui.getExecutionContext()
ec.logger.info("⚡ [AGI WORKSPACE BOOTSTRAP] Applying workspace overrides and asset mappings.")

// Safe helper to inject unique scripts into footer_scripts if available
def addUniqueScript = { url ->
    def fs = context.footer_scripts ?: ec.context.get("footer_scripts")
    if (fs != null && !fs.contains(url)) fs.add(url)
}

long scriptTs = context.get("ts") ?: System.currentTimeMillis()

// 1. Inherit and extend properties from base script context
String currentChannel = context.get("defaultChannel") ?: "facility-alerts"
context.put("connectionChannel", "workspace-canvas") // Tailor channel specifically for the IDE
context.put("designModeActive", "Y")
context.put("workspacePermission", "ADMIN")

// 1. Inject our dedicated clean utility configuration objects
ec.web.addScript("/agi-ide/assets/AgiWorkspaceApp.js")

// 2. Inject the runtime spark script to execute the mounting loop
ec.web.addScript("/agi-ide/assets/AgiBootstrapper.js")

log.info("📊 [AGI-IDE BACKEND] Modular script assets cleanly appended to web context stream.")

// 2. Inject specific workspace canvas editor scripts to load right after the core engines
//addUniqueScript("/agi-ide/assets/MceShell.qvt.js?v=${scriptTs}")
addUniqueScript("/agi-ide/assets/MoquiCanvasEditor.qvt.js?v=${scriptTs}")
addUniqueScript("/agi-ide/assets/BlueprintClient.js?v=${scriptTs}")

// 3. Perform backend heartbeat warning check to standard server logs
def sidecarPort = 4797
boolean isNodeUp = false
try {
    new java.net.Socket("127.0.0.1", sidecarPort).withCloseable { isNodeUp = true }
} catch (Exception e) {}

if (!isNodeUp) {
    ec.logger.warn("⚠️ AGI Shell: Local WebMCP Node server (4797) is offline. Start it manually with start-sidecar.sh.")
} else {
    ec.logger.info("✅ AGI Shell: WebMCP Node Server detected on port 4797.")
}

return context