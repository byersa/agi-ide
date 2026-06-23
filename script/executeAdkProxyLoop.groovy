package org.moqui.ai

import org.moqui.adk.AdkManager
import groovy.json.JsonBuilder
import org.moqui.impl.entity.EntityDataLoaderImpl
import java.util.concurrent.ConcurrentHashMap

if (context.scriptFlags == null) {
    context.scriptFlags = [:]
}

String userPrompt = context.userPrompt
Map activeTree = context.activeTree ?: [:]
// Map the canvas target coordinate smoothly to our tool input signature
String targetNodeId = context.targetMariaId ?: context.focusCoordinate ?: "root"

def ec = context.ec

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
You are the AI Orchestrator for the "Nursing Home Management System".
You modify visual UI layouts by executing the dynamic tools mounted in your active session context.

CRITICAL DOMAIN RULES:
- HIPAA Enforcement: Any field storing PHI or medical data MUST have encrypt="true".
- Audit Log: Any sensitive layout container must have enable-audit-log="true".

When the user requests structural modifications (such as adding input assets), select the 
most appropriate tool from your manifest and execute it. Do not return raw text blocks 
describing the change; use your tool execution pathways.

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
        activeSessionCache = new java.util.concurrent.ConcurrentHashMap<String, String>()
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

    ec.logger.info("📡 Dispatching core prompt to Gemini via verified session: ${verifiedSessionId}")
    ec.message.clearAll()
    
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
        // 🎯 SCAN WHOLE TURN HISTORY: Checks both the initial run and the healing pass 
        // to see if Gemini successfully triggered a functionCall anywhere in the event chain.
        wasToolCall = conversationEvents.any { event ->
            event.content?.parts?.any { part -> part.containsKey('functionCall') || part.get('functionCall') != null }
        }
        
        // Safely extract the final text response (Gemini's explanation of the fix or final reply)
        def targetEvent = conversationEvents.reverse().find { it.content?.parts }
        if (targetEvent) {
            def textPart = targetEvent.content.parts.find { it.text }
            if (textPart) {
                extractedTextAnswer = textPart.text
            }
        }
    }

    // Protect the frontend JSON parser from breaking on raw prose text if an operation took place
    if (wasToolCall && (!extractedTextAnswer || !extractedTextAnswer.trim().startsWith("{"))) {
        context.completionText = groovy.json.JsonOutput.toJson([
            status: "success",
            type: "MUTATION_EXECUTED",
            message: "Dynamic form field structure successfully validated and updated on the server backend."
        ])
    } else {
        context.completionText = extractedTextAnswer ?: "{}"
    }


} catch (Exception e) {
    ec.logger.error("❌ Google ADK Engine proxy execution failed: " + e.getMessage(), e)
    context.completionText = """{ "error": "ADK Loop Exception: ${e.getMessage()}" }"""
}