// runtime/component/agi-ide/script/AgiBootstrapper.groovy

import org.moqui.context.ExecutionContext

ExecutionContext ec = context.ec

// 1. 🎨 HYDRATE CSS STYLESHEETS (Appended natively into the HTML <head> space)
def styles = context.html_stylesheets ?: ec.context.get("html_stylesheets")
if (styles != null) {
    styles.add('https://fonts.googleapis.com/css?family=Roboto:100,300,400,500,700,900|Material+Icons')
    styles.add('https://cdn.jsdelivr.net/npm/quasar@2.17.1/dist/quasar.css')
}

// 2. 📡 HYDRATE JAVASCRIPT LIBS (Appended sequentially via footer script queues)
def fs = context.footer_scripts ?: ec.context.get("footer_scripts")
if (fs != null) {
    // Group A: Third-Party Vendor Stack
    fs.add('https://code.jquery.com/jquery-3.6.0.min.js')
    fs.add('https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.js')
    fs.add('https://cdn.jsdelivr.net/npm/quasar@2.17.1/dist/quasar.umd.js')
    fs.add('https://unpkg.com/vue-demi')
    fs.add('https://unpkg.com/pinia@2.3.1')
    fs.add('https://cdn.jsdelivr.net/npm/axios@1.18.1/dist/axios.min.js')

    // Group B: Local Workspace Runtime Infrastructure
    fs.add('//agi-ai-assets/moqui-utils.js')
    fs.add('//agi-ai-assets/MoquiAiVueFunctions.js')
    fs.add('//agi-ai-assets/MoquiAiVue.qvt.js')
    fs.add('//agi-ai-assets/BlueprintClient.qvt.js')
    
    ec.logger.info("⚙️ [AGI BOOTSTRAP] Fully synchronized and prioritized style/script asset arrays via Groovy backend plane.")
}
    ec.logger.info("⚙️ [AGI BOOTSTRAP] context.footer_scripts: " + context.footer_scripts  )
    ec.logger.info('⚙️ [AGI BOOTSTRAP] ec.context.get("footer_scripts"): ' + ec.context.get("footer_scripts"))
return context //