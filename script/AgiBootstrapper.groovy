// agi-ide/script/AgiBootstrapper.groovy
import org.moqui.context.ExecutionContext

ExecutionContext ec = context.ec ?: org.moqui.Moqui.getExecutionContext()

def addUniqueScript = { url ->
    def fs = context.footer_scripts ?: ec.context.get("footer_scripts")
    if (fs != null && !fs.contains(url)) fs.add(url)
}

ec.logger.info("In AgiBootstrapper.")
long scriptTs = context.get("ts") ?: System.currentTimeMillis()

// The Pure Client-Side Editors (.qvt.js)
addUniqueScript("/agi-ide-assets/AgiCanvasEditor.qvt.js?v=${scriptTs}")
addUniqueScript("/agi-ide-assets/AgiScreenEditor.qvt.js?v=${scriptTs}")
addUniqueScript("/agi-ide-assets/AgiComponentEditor.qvt.js?v=${scriptTs}")
addUniqueScript("/agi-ide-assets/AgiSubWorkspace.qvt.js?v=${scriptTs}")
addUniqueScript("/agi-ide-assets/AgiWorkspace.qvt.js?v=${scriptTs}")

return context