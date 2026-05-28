// runtime/component/agi-ide/script/AgiTerminalBootstrapper.groovy
import org.moqui.context.ExecutionContext

ExecutionContext ec = context.ec ?: org.moqui.Moqui.getExecutionContext()

if (context.footer_scripts == null) {
    context.footer_scripts = new ArrayList()
}

def addUniqueScript = { url ->
    def fs = context.footer_scripts ?: ec.context.get("footer_scripts")
    if (fs != null && !fs.contains(url)) fs.add(url)
}

ec.logger.info("In AgiTerminalBootstrapper.")
long scriptTs = context.get("ts") ?: System.currentTimeMillis()

// Only load the target asset definitions required for this specialized tool window
addUniqueScript("/agi-ide-assets/AgiAgentManagerActuator.js?v=${scriptTs}")

return context