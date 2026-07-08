<#--
    =========================================================================
    DefaultScreenMacros.qmeta.ftl
    =========================================================================
    Unified Meta-JSON Layout Compiler
    Derived Natively from moqui-mcp-2 Core Semantic Architecture.
    =========================================================================
-->

<#-- 1. EXTEND MOQUI-MCP-2 CAPABILITIES THROUGH EXPLICIT RESOURCE PASSING -->
<#include "component://moqui-mcp-2/screen/macro/DefaultScreenMacros.mcp.ftl"/>

<#-- INITIALIZE A BULLETPROOF GLOBAL RUNTIME ELEMENT COUNTER -->
<#global qmetaElementCounter = 0>

<#function getCleanPath>
    <#local loc = sri.getActiveScreenDef().getLocation()>
    <#-- e.g., transforms "component://agi-ide/screen/agi-ide.xml" into "agi-ide" -->
    <#return loc?replace("^component://[^/]+/screen/", "", "r")?replace(".xml$", "", "r")>
</#function>

<#-- 2. CORE SCREEN INTERCEPTORS AND PAYLOAD ENVELOPE STRUCTURING -->
<#macro screen>
{
  "screen": "${getCleanPath()}",
  "location": "${sri.getActiveScreenDef().getLocation()}",
  "mariaId": "${getCleanPath()}#root",
  "widgets": <#recurse>
}
</#macro>

<#macro widgets>[<#recurse>]</#macro>
<#macro "fail-widgets">[<#recurse>]</#macro>

<#-- ================ 3. LAYOUT & CONTAINER PRIMITIVES ================ -->
<#macro "container">
{
  "@type": "Container",
  "id": "${.node['@id']!}",
  "style": "${.node['@style']!}",
  <#-- CLEAN: Outputs "agi-ide#agi-ide-header" -->
  "mariaId": "${getCleanPath()}#${.node['@id']!'container-' + qmetaElementCounter}",
  "children": [
    <#list .node?children as childNode>
      <#recurse childNode><#if childNode?has_next>,</#if>
    </#list>
  ]
}
</#macro>

<#macro "container-box">
{
  "@type": "ContainerBox",
  "id": "${.node['@id']!}",
  "title": "${.node['box-header'][0]['@title']!}",
  "mariaId": "${sri.getActiveScreenDef().getLocation()}#${.node['@id']!''}",
  "children": [
    <#list .node?children as childNode>
      <#recurse childNode><#if childNode?has_next>,</#if>
    </#list>
  ]
}
</#macro>

<#-- ================ 4. HIGH-FIDELITY FORM CORE MAPPINGS ================ -->
<#macro "form-single">
{
  "@type": "FormSingle",
  "name": "${.node['@name']!}",
  "transition": "${.node['@transition']!}",
  "action": "${sri.buildUrl(.node['@transition']!).getTarget()!}",
  "mariaId": "${sri.getActiveScreenDef().getLocation()}#${.node['@name']!}",
  "children": [
    <#list .node?children as childNode>
      <#recurse childNode><#if childNode?has_next>,</#if>
    </#list>
  ]
}
</#macro>

<#macro "field">
{
  "@type": "FormField",
  "name": "${.node['@name']!}",
  "title": "${.node['@title']!((.node['@name']?replace('^[a-z]', '', 'r'))?cap_first)}",
  "mariaId": "${sri.getActiveScreenDef().getLocation()}#${.node['@name']!}",
  "children": [
    <#list .node?children as childNode>
      <#recurse childNode><#if childNode?has_next>,</#if>
    </#list>
  ]
}
</#macro>

<#-- ================ 5. FIELD LEVEL INPUT WIDGETS PRIMITIVES ================ -->
<#macro "text-line">
{ 
  "@type": "m-text-line", 
  "attributes": { 
    "placeholder": "${.node['@placeholder']!}",
    "disabled": "${.node['@disabled']!'false'}"
  } 
}
</#macro>

<#macro "drop-down">
{ 
  "@type": "m-drop-down", 
  "attributes": { 
    "allow-empty": "${.node['@allow-empty']!'true'}",
    "value": ""
  } 
}
</#macro>

<#macro "submit">
{
  "@type": "submit",
  "attributes": {
    "text": "${.node['@text']!'Submit'}"
  }
}
</#macro>

<#-- ================ 6. FALLBACK BEHAVIORS FOR COMPLEX CORE TAGS ================ -->
<#macro "link">
<#global qmetaElementCounter = qmetaElementCounter + 1>
{
  "@type": "Link",
  "text": "${.node['@text']!}",
  "url": "${sri.buildUrl(.node['@url']!'.').getUrl()!}",
  <#-- CLEAN: Outputs "agi-ide#link-2" -->
  "mariaId": "${getCleanPath()}#link-${qmetaElementCounter}"
}
</#macro>

<#macro "label">
<#global qmetaElementCounter = qmetaElementCounter + 1>
{
  "@type": "Label",
  "text": "${.node['@text']!}",
  "style": "${.node['@style']!}",
  <#-- CLEAN: Outputs "agi-ide#label-1" -->
  "mariaId": "${getCleanPath()}#label-${qmetaElementCounter}"
}
</#macro>

<#macro "screen-text-output">
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>AGI Agentic Workspace IDE</title>
</head>
<body class="bg-grey-1">

    <div id="q-app" class="window-height full-width">
        <m-screen-layout>
            <m-screen-content>
                ${sri.renderSubscreen()}
            </m-screen-content>
        </m-screen-layout>
    </div>

    <script type="text/javascript">
    window.AGI_SERVER_CSRF_TOKEN = "${ec.web.sessionToken}";

    (function() {
        function instantiateMasterQmetaApp() {
            if (typeof Vue === 'undefined' || typeof Quasar === 'undefined' || !window.AgiComponents || !window.AgiVueAppFunctionList) {
                return false; 
            }

            try {
                console.info("📡 All style, vendor, and library dependencies verified. Rendering application layout...");

                const appOptions = {
                    data() {
                        return {
                            notifyHistoryList: [],
                            moquiSessionToken: "${ec.web.sessionToken}",
                            reLoginShow: false
                        }
                    },
                    created() {
                        if (window.moqui) {
                            window.moqui.webrootVue = this;
                        }
                    },
                    mounted() {},
                    methods: {}
                };
            
                Object.keys(window.AgiVueAppFunctionList).forEach(functionName => {
                    appOptions.methods[functionName] = window.AgiVueAppFunctionList[functionName];
                });
            
                const app = Vue.createApp(appOptions);
            
                Object.keys(window.AgiComponents).forEach(tagName => {
                    app.component(tagName, window.AgiComponents[tagName]);
                });
            
                app.mount('#q-app');
                console.info("🚀 [AGI QMETA] Core application successfully mounted onto #q-app.");
                return true;
            } catch (err) {
                console.error("❌ Critical exception during master qmeta compilation loop:", err);
                return true;
            }
        }
    
        const networkPoll = setInterval(() => {
            if (instantiateMasterQmetaApp()) {
                clearInterval(networkPoll);
            }
        }, 20);
        setTimeout(() => clearInterval(networkPoll), 5000);
    })();
    </script>
</body>
</html>
</#macro>