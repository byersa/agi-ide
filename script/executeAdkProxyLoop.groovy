package org.moqui.ai

import org.moqui.adk.AdkManager
import groovy.json.JsonBuilder
import org.moqui.impl.entity.EntityDataLoaderImpl
import java.util.concurrent.ConcurrentHashMap

// 🎯 NATIVE MEMORY ANCHOR: Tracks initialized ADK sessions statelessly right inside script class definition memory
if (context.scriptFlags == null) {
    context.scriptFlags = [:]
}

String userPrompt = context.userPrompt
Map activeTree = context.activeTree ?: [:]
String focusCoordinate = context.focusCoordinate ?: ""

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

// Lightweight native initialization guard
if (!AdkManager.isInitialized()) {
    ec.logger.info("⚠️ AdkManager registry is empty. Triggering native lazyInit...")
    AdkManager.initSessionService(ec.factory)
    AdkManager.lazyInit(ec.factory)
}

String contextPayload = """
[SYSTEM DIRECTIVE]: 
You are the AI Orchestrator for the "Automation Groups International".
You modify visual UI layouts by outputting structured commands that match our registry tools.

CRITICAL DOMAIN RULES:
- HIPAA Enforcement: Any field storing PHI or medical data MUST have encrypt="true".
- Audit Log: Any sensitive layout container must have enable-audit-log="true".

You must respond EXCLUSIVELY with a valid JSON object matching this schema:
{ "command": "/add-mock-field", "arguments": { "label": "Text" } }
Do not output markdown text or formatting wrappers outside of the object.

[ACTIVE CANVAS STATE]:
${new JsonBuilder(activeTree).toPrettyString()}

[FOCUS AREA COORD]: 
${focusCoordinate}

[USER REQUEST]: 
${userPrompt}
"""

List<Map> conversationEvents = []

try {
    // 1. Capture the persistent browser session token passed from the client frontend
    String incomingSessionToken = context.moquiSessionToken ?: java.util.UUID.randomUUID().toString()
    String browserTokenKey = incomingSessionToken

    // 2. Safely resolve our persistent session cache out of the servlet runtime memory bucket
    var servletContext = ec.web?.servletContext
    var activeSessionCache = servletContext?.getAttribute("AGI_ACTIVE_SESSIONS")
    if (activeSessionCache == null) {
        activeSessionCache = new java.util.concurrent.ConcurrentHashMap<String, String>()
        servletContext?.setAttribute("AGI_ACTIVE_SESSIONS", activeSessionCache)
    }

    // 3. Look up if this browser token already maps to an active SDK session string
    String verifiedSessionId = activeSessionCache.get(browserTokenKey)

    // STATEFUL CHECK: If no mapping exists, run a native warm-up sequence to create it
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
        
        // 🎯 CALL PERFECT MATCH: Pass the real activeUserId. It returns a Map containing the SDK's native generated ID.
        Map adkSessionWrapper = AdkManager.createSession(activeUserId, initialState)
        
        // Extract the true generated ID string and cache it against our persistent browser token
        verifiedSessionId = adkSessionWrapper.id as String
        activeSessionCache.put(browserTokenKey, verifiedSessionId)
        
        ec.logger.info("🎯 [HARNESS] Token [${browserTokenKey}] securely mapped to Native ADK Session ID: [${verifiedSessionId}]")
    } else {
        ec.logger.info("🔄 [HARNESS] Continuous Turn: Re-attaching to existing native session [${verifiedSessionId}] via token [${browserTokenKey}]")
    }

    // 4. Dispatch the execution pass into the verified, matching session loop channel
    ec.logger.info("📡 Dispatching core prompt to Gemini via verified session: ${verifiedSessionId}")
    conversationEvents = AdkManager.runAgent(activeUserId, verifiedSessionId, contextPayload)
    
    String extractedTextAnswer = ""
    if (conversationEvents) {
        def targetEvent = conversationEvents.reverse().find { it.content?.parts }
        if (targetEvent) {
            def textPart = targetEvent.content.parts.find { it.text }
            if (textPart) {
                extractedTextAnswer = textPart.text
            }
        }
    }

    context.completionText = extractedTextAnswer ?: "{}"

} catch (Exception e) {
    ec.logger.error("❌ Google ADK Engine proxy execution failed: " + e.getMessage(), e)
    context.completionText = """{ "error": "ADK Loop Exception: ${e.getMessage()}" }"""
}