package org.moqui.ai

import org.moqui.adk.AdkManager
import groovy.json.JsonBuilder
import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import org.moqui.impl.entity.EntityDataLoaderImpl
import java.util.concurrent.ConcurrentHashMap

if (context.scriptFlags == null) {
    context.scriptFlags = [:]
}

String userPrompt = context.userPrompt
// Map the canvas target coordinate smoothly to our tool input signature
String targetNodeId = context.targetMariaId ?: context.focusCoordinate ?: "root"
String artifactUri = context.focusCoordinate ?: context.activeArtifactLocation ?: ""

if (!artifactUri || artifactUri.trim() == "") {
    // Collect incoming key signatures to see what the frontend palette actually transmitted
    def incomingKeys = context.keySet()
    ec.logger.error("❌ [CONTEXT FAULT] executeAdkProxyLoop failed to extract an operational layout file path.")
    ec.logger.error("👉 Available parameters passed to script thread context: ${incomingKeys}")
    ec.logger.error("👉 userPrompt: '${userPrompt}', focusCoordinate: '${context.focusCoordinate}'")
    
    // Instead of hiding the issue with SandboxForm, return a descriptive error map back to the UI palette
    context.completionText = JsonOutput.toJson([
        error: "CONTEXT_ERROR",
        message: "The AGI palette lost track of the active file pathway context. Please select an element on the canvas workspace and try again."
    ])
    return // Halt execution cleanly right here
}

def ec = context.ec
def userId = ec.user.getUserId()
ec.logger.info("In executeAdkProxyLoop, userId: " + userId)

// 🎯 CENTRALIZED STATE HYDRATION: Pull from the server-side database cache
Map getBufferResult = ec.service.sync()
    .name("org.moqui.ai.AgiWorkspaceServices.get#WorkspaceBuffer")
    .parameter("artifactUri", artifactUri)
    .parameter("userId", userId)
    .call()

String activeLayoutBufferId = getBufferResult.workspaceBufferId
String currentMetaJsonStr = getBufferResult.metaJsonBuffer

// Push these identifiers into the thread context so tools (like add#FormField) can mutate the real row buffer
ec.context.put("activeLayoutBufferId", activeLayoutBufferId)
ec.context.put("activeLayoutBuffer", currentMetaJsonStr)
ec.logger.info("In executeAdkProxyLoop, activeLayoutBufferId : " + activeLayoutBufferId )
ec.logger.info("In executeAdkProxyLoop, currentMetaJsonStr: " + currentMetaJsonStr)

// Parse the text string into a native map to construct the system prompt downstream
Map activeTree = new JsonSlurper().parseText(currentMetaJsonStr)

// =========================================================================
// REAL NATIVE IDEMPOTENCY BOOTSTRAPPER GUARD
// =========================================================================
var existingUser = ec.entity.find("moqui.security.UserAccount").condition("userId", "SystemSupport").one()
if (existingUser == null || !existingUser.currentPassword?.startsWith("\$")) {
    ec.logger.info("⏳ SystemSupport account missing or unhashed. Running surgical setup load...")
    
    String filePath = "runtime/component/agi-ai/data/AgiMcpSecurityData.xml"
    File xmlFile = new File(filePath)
    
    if (xmlFile.exists()) {
        EntityDataLoaderImpl loader = (EntityDataLoaderImpl) ec.entity.makeDataLoader()
        loader.xmlText(xmlFile.text)
        loader.dataTypes(new HashSet(["setup"]))
        long loaded = loader.load()
        ec.logger.info("🎯 Setup complete. Loaded ${loaded} security records cleanly.")
    } else {
        ec.logger.error("❌ Critical: Missing setup file at ${filePath}")
    }
}

String activeUserId = ec.user.getUserId() ?: "system_ide_user"

if (!AdkManager.isInitialized()) {
    ec.logger.info("⚠️ AdkManager registry is empty. Triggering native lazyInit...")
    AdkManager.initSessionService(ec.factory)
    AdkManager.lazyInit(ec.factory)
}

// 🎯 REFINED: System payload converted to support native function calls
String contextPayload = """
[SYSTEM DIRECTIVE]: 
You are the AI Orchestrator for the "Moqui AI IDE System".
You modify visual UI layouts by executing the dynamic tools mounted in your active session context.

CRITICAL DOMAIN RULES:
- HIPAA Enforcement: Any field storing PHI or medical data MUST have encrypt="true".
- Audit Log: Any sensitive layout container must have enable-audit-log="true".

When the user requests structural modifications (such as adding input assets), select the 
most appropriate tool from your manifest and execute it. Do not return raw text blocks 
describing the change; use your tool execution pathways.

CRITICAL TOOL RULES:
- When calling add#FormField, you MUST provide an explicit machine-readable field 'name' 
  (e.g., 'med_hist_39') in addition to the human-readable 'label' (e.g., 'Medical History 39').
- Never leave 'name' blank or null.

INTENT COMPILATION INSTRUCTIONS:
If the user's prompt starts with "COMPILATION INTENT REQUEST:", analyze the provided plain-text intent.
Your job is to parse it, map it to our AGI Schema standard, and update the target node's attributes 
using the correct tool execution pathway (e.g., updating 'v-if', 'v-data', or 'class' properties).

[ACTIVE CANVAS STATE]:
${new JsonBuilder(activeTree).toPrettyString()}

[ACTIVE FOCUS TARGET NODE ID]: 
${targetNodeId}

[USER REQUEST]: 
${userPrompt}
"""

List<Map> conversationEvents = []

try {
    String incomingSessionToken = context.moquiSessionToken ?: java.util.UUID.randomUUID().toString()
    String browserTokenKey = incomingSessionToken

    var servletContext = ec.web?.servletContext
    var activeSessionCache = servletContext?.getAttribute("AGI_ACTIVE_SESSIONS")
    if (activeSessionCache == null) {
        activeSessionCache = new ConcurrentHashMap<String, String>()
        servletContext?.setAttribute("AGI_ACTIVE_SESSIONS", activeSessionCache)
    }

    String verifiedSessionId = activeSessionCache.get(browserTokenKey)

    if (verifiedSessionId == null) {
        ec.logger.info("🧠 [HARNESS] Thread Session Warm-Up: Generating fresh ADK context for Token: ${browserTokenKey}")
        
        Map initialState = [
            userId          : activeUserId,
            username        : ec.user.getUsername() ?: "Guest",
            userFullName    : ec.user.getUsername() ?: "System User",
            organizationName: "Automation Groups International",
            companyPseudoId : "NHMS_IDE",
            tenantId        : "DEFAULT",
            timeZone        : ec.user.getTimeZone()?.getID() ?: "UTC",
            locale          : ec.user.getLocale()?.toString() ?: "en_US",
            screenCatalog   : "[]"
        ]
        
        Map adkSessionWrapper = AdkManager.createSession(activeUserId, initialState)
        verifiedSessionId = adkSessionWrapper.id as String
        activeSessionCache.put(browserTokenKey, verifiedSessionId)

        ec.logger.info("🎯 [HARNESS] Token [${browserTokenKey}] securely mapped to Native ADK Session ID: [${verifiedSessionId}]")
    } else {
        ec.logger.info("🔄 [HARNESS] Continuous Turn: Re-attaching to existing native session [${verifiedSessionId}] via token [${browserTokenKey}]")
    }

    // Inside executeAdkProxyLoop.groovy, right before AdkManager.runAgent(...)
    def runner = org.moqui.adk.AdkManager.runnerForSession(verifiedSessionId)
    def sessionService = runner.sessionService()
    def adkSession = sessionService.getSession("moqui-adk", activeUserId, verifiedSessionId, java.util.Optional.empty()).blockingGet()

    if (adkSession == null) {
        throw new IllegalStateException("ADK Session could not be verified for ID: ${verifiedSessionId}")
    }

    // 🎯 Save the buffers directly into the ADK Session State!
    adkSession.state().put("activeLayoutBufferId", activeLayoutBufferId)
    adkSession.state().put("activeLayoutBuffer", currentMetaJsonStr)

    ec.logger.info("📡 adkSession.state, activeLayoutBufferId: ${adkSession.state().get('activeLayoutBufferId')}")
    ec.logger.info("📡 adkSession.state, activeLayoutBuffer: ${adkSession.state().get('activeLayoutBuffer')}")
    ec.logger.info("📡 Dispatching core prompt to Gemini via verified session: ${verifiedSessionId}")
    ec.message.clearAll()
    
    ec.context.put("sessionId", verifiedSessionId)
    context.sessionId = verifiedSessionId

    // AI call happens here
    conversationEvents = AdkManager.runAgent(activeUserId, verifiedSessionId, contextPayload)
    
    if (ec.message.hasError()) {
        String validationErrors = ec.message.getErrorsString()
        ec.logger.warn("⚠️ [SANDBOX CRITIQUE] Validation failed during tool run: ${validationErrors}")
        ec.message.clearAll()
        
        String correctionCritiquePayload = """
        [SYSTEM EXCEPTION INTERCEPT]: 
        Your last tool execution failed rigid enterprise data validation matrices.
        
        CRITICAL ERROR(S):
        ${validationErrors}
        
        REMEDIATION INSTRUCTION:
        Review your tool arguments immediately. You must adjust your inputs to ensure that any 
        sensitive fields include encrypt="true" and are wrapped inside an audited container 
        (enable-audit-log="true") to satisfy our domain rules. Re-execute the tool call with corrected arguments.
        """.stripIndent()
        
        ec.logger.info("🔄 [SANDBOX HEALING] Re-prompting Gemini with explicit failure parameters...")
        conversationEvents = AdkManager.runAgent(activeUserId, verifiedSessionId, correctionCritiquePayload)
    }

String extractedTextAnswer = ""
    boolean wasToolCall = false

    if (conversationEvents) {
        // 🎯 1. ADK TOOL CALL DETECTION
        boolean hasMultiTurnEvents = conversationEvents.size() > 1
        boolean hasToolPartSignature = conversationEvents.any { event ->
            try {
                if (event.content?.parts) {
                    return event.content.parts.any { part ->
                        (part instanceof Map && part.isEmpty()) ||
                        (part.functionCall != null) || (part.functionResponse != null)
                    }
                }
            } catch (Exception ignore) {}
            return false
        }

        wasToolCall = hasMultiTurnEvents || hasToolPartSignature

        // 🎯 2. EXTRACT FINAL TEXT RESPONSE
        def targetEvent = conversationEvents.reverse().find { event ->
            try {
                if (event.content?.parts) {
                    return event.content.parts.any { part -> 
                        (part.text && part.text.trim() != "") || 
                        (part instanceof Map && part.text && part.text.trim() != "") 
                    }
                }
            } catch (Exception ignore) {}
            return false
        }

        if (targetEvent) {
            try {
                def textPart = targetEvent.content.parts.find { it.text || (it instanceof Map && it.text) }
                if (textPart) extractedTextAnswer = textPart.text ?: ""
            } catch (Exception ignore) {}
        }
    }

    ec.logger.info("📡 [AGI PROXY] evaluated wasToolCall: ${wasToolCall}, extractedTextAnswer: ${extractedTextAnswer}")

    // =========================================================================
    // 🎯 SINGLE, UNIFIED REST RETURN PAYLOAD
    // Parse metaJsonBuffer back to a native Map/List before JsonOutput to avoid double escaping!
    // =========================================================================
    // Clear validation messages so Moqui doesn't mark the transaction rollback-only
    if (ec.message.hasError()) {
        ec.logger.warn("⚠️ Clearing error messages prior to response return: ${ec.message.getErrorsString()}")
        ec.message.clearAll()
    }

    // =========================================================================
    if (wasToolCall) {
        // 1. Read directly from ADK session memory
        String updatedJsonStr = adkSession.state().get("activeLayoutBuffer") as String

        // 2. Fallback: Query live database record
        if (!updatedJsonStr || updatedJsonStr.trim() == "" || !updatedJsonStr.contains("med_hist")) {
            def bufferList = ec.entity.find("org.moqui.ai.WorkspaceBuffer")
                                           .condition("artifactUri", artifactUri)
                                           .condition("userId", userId)
                                           .orderBy("-lastUpdatedStamp")
                                           .useCache(false)
                                           .list()
            def bufferRow = bufferList ? bufferList[0] : null
            if (bufferRow?.metaJsonBuffer) {
                updatedJsonStr = bufferRow.metaJsonBuffer
            }
        }

        Object parsedTree = new JsonSlurper().parseText(updatedJsonStr ?: "{}")

        context.completionText = JsonOutput.toJson([
            status: "success",
            type: "MUTATION_EXECUTED",
            metaJsonBuffer: parsedTree,
            message: extractedTextAnswer ?: "Canvas layout successfully updated."
        ])
        ec.logger.info("[AGI PROXY RETURN] Fresh metaJsonBuffer returned successfully.")
    } else {
        context.completionText = JsonOutput.toJson([
            status: "success",
            type: "TEXT_RESPONSE",
            message: extractedTextAnswer ?: "No response generated."
        ])
    }

} catch (Exception e) {
    ec.logger.error("❌ Google ADK Engine proxy execution failed: " + e.getMessage(), e)
    context.completionText = JsonOutput.toJson([
        status: "error",
        error: "ADK Loop Exception: ${e.getMessage()}"
    ])
}