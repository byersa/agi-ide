// agi-ide/script/AgiBootstrapper.groovy
import org.moqui.context.ExecutionContext

ExecutionContext ec = context.ec ?: org.moqui.Moqui.getExecutionContext()

def addUniqueScript = { url ->
    def fs = context.footer_scripts ?: ec.context.get("footer_scripts")
    if (fs != null && !fs.contains(url)) fs.add(url)
}

ec.logger.info("In AgiBootstrapper.")
long scriptTs = context.get("ts") ?: System.currentTimeMillis()

// Boundary 1: Inject the global component macros owned by the core agi-ai engine
addUniqueScript("/agi-ai-assets/AgiComponentLibrary.js?v=${scriptTs}")

// Boundary 2: Inject the developer workspace definition owned by agi-ide
addUniqueScript("/agi-ide-assets/IdeWorkspaceComponent.qvt.js?v=${scriptTs}")
addUniqueScript("/agi-ide-assets/AgiWorkspaceApp.js?v=${scriptTs}")
addUniqueScript("/agi-ide-assets/MoquiCanvasEditor.qvt.js?v=${scriptTs}")
addUniqueScript("/agi-ide-assets/BlueprintClient.js?v=${scriptTs}")
addUniqueScript("/agi-ide-assets/AgiIdeStore.js?v=${scriptTs}")

addUniqueScript("/agi-ide-assets/AgiWorkspaceAppDefinition.js?v=${scriptTs}")
// Boundary 3: Execute the final renamed runtime thread mounting driver
addUniqueScript("/agi-ide-assets/AgiRuntimeDriver.js?v=${scriptTs}")

return context