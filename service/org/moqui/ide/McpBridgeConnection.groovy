package org.moqui.ide.service.org.moqui.ide

import org.moqui.context.ExecutionContext
import jakarta.websocket.*
import java.net.URI
import groovy.json.JsonBuilder

ExecutionContext ec = context.ec
String proxyBaseUrl = "ws://localhost:4797"
String registerUrl = "${proxyBaseUrl}/register"

ec.logger.info("🔌 [AGI-IDE MCP BRIDGE] Initiating background handshake connection to sidecar proxy: ${registerUrl}")

// Resolve the dynamic verification token path using the component location mapping
String activeToken = "816554a337e2d73431bd2903642f993b" // Fallback dev default
String componentBaseDir = ec.factory.getComponentBaseLocations().get("agi-ide")

if (componentBaseDir) {
    String cleanPath = componentBaseDir.startsWith("file:") ? componentBaseDir.substring(5) : componentBaseDir
    File agiIdeDir = new File(cleanPath)
    File runtimeDir = agiIdeDir.getParentFile().getParentFile()
    File tokenFile = new File(runtimeDir, "tmp/webmcp.token")

    if (tokenFile.exists()) {
        try {
            activeToken = tokenFile.getText("UTF-8").trim()
            ec.logger.info("🔑 [AGI-IDE MCP BRIDGE] Dynamic token successfully loaded from disk: ${activeToken.substring(0, 6)}...")
        } catch (Exception e) {
            ec.logger.warn("⚠️ [AGI-IDE MCP BRIDGE] Failed to read token file, using dev default: " + e.getMessage())
        }
    } else {
        ec.logger.warn("⚠️ [AGI-IDE MCP BRIDGE] webmcp.token file not found at ${tokenFile.absolutePath}. Using default developer token profile.")
    }
}
final String finalToken = activeToken

// ==========================================
// STAGE 2: LONG-RUNNING ACTIVE CHANNEL CONNECTOR
// ==========================================
@ClientEndpoint
class McpChannelActiveListener {
    private ExecutionContext ec

    McpChannelActiveListener(ExecutionContext ec) {
        this.ec = ec
    }

    @OnOpen
    void onOpen(Session session) {
        ec.logger.info("🟢 [AGI-IDE MCP TUNNEL] Permanent channel tunnel opened. Moqui is officially ONLINE for tool execution.")
    }

    @OnMessage
    void onMessage(String message, Session session) {
        // Intercepts tool execution invocations routed from agi-host through the sidecar
        def slurper = new groovy.json.JsonSlurper()
        def request = null
        try {
            request = slurper.parseText(message)
        } catch (Exception e) {
            return
        }

        if (request?.type == "callTool" && request?.tool == "get_artifact") {
            ec.logger.info("⚡ [AGI-IDE MCP TUNNEL] Inbound tool execution triggered: get_artifact (Request ID: ${request.id})")
            
            def args = request.arguments
            
            // Execute our live framework rendering pass
            def serviceResult = ec.service.sync().name("org.moqui.ide.AgiMcpServices.get#XmlArtifactBlueprint")
                .parameters([targetComponent: args.targetComponent, artifactPath: args.artifactPath])
                .call()
                
            // Compile response map payload targeting the proxy relay handler
            Map responseFrame = [
                id: request.id,
                type: "toolResponse",
                result: [
                    content: [
                        [
                            type: "text",
                            text: new JsonBuilder(serviceResult.blueprintJson).toPrettyString()
                        ]
                    ]
                ]
            ]
            session.getBasicRemote().sendText(new JsonBuilder(responseFrame).toString())
            ec.logger.info("🎯 [AGI-IDE MCP TUNNEL] Execution layout results transmitted back to proxy channel.")
        }
    }

    @OnClose
    void onClose(Session session, CloseReason reason) {
        ec.logger.warn("🛑 [AGI-IDE MCP TUNNEL] Active tool bridge channel disconnected. Reason: ${reason.getReasonPhrase()}")
    }

    @OnError
    void onError(Session session, Throwable throwable) {
        ec.logger.error("❌ [AGI-IDE MCP TUNNEL ERROR] Exception thrown inside active loop: " + throwable.getMessage())
    }
}

// ==========================================
// STAGE 1: REGISTRATION GATE HANDSHAKE
// ==========================================
@ClientEndpoint
class McpProxyClientListener {
    private ExecutionContext ec
    private String registrationToken
    private String proxyBaseUrl
    
    McpProxyClientListener(ExecutionContext ec, String token, String baseUrl) {
        this.ec = ec
        this.registrationToken = token
        this.proxyBaseUrl = baseUrl
    }

    @OnOpen
    void onOpen(Session session) {
        ec.logger.info("🚀 [AGI-IDE MCP BRIDGE] WebSocket connection securely established with proxy switchboard.")
        
        Map registrationPayload = [
            host: "localhost",
            token: this.registrationToken
        ]
        
        String jsonText = new JsonBuilder(registrationPayload).toString()
        String base64EncodedFrame = jsonText.getBytes("UTF-8").encodeBase64().toString()
        
        try {
            session.getBasicRemote().sendText(base64EncodedFrame)
            ec.logger.info("Doc [AGI-IDE MCP BRIDGE] Handshake registration payload successfully sent via Base64.")
        } catch (Exception e) {
            ec.logger.error("❌ [AGI-IDE MCP BRIDGE] Exception during registration transmission: " + e.getMessage(), e)
        }
    }

    @OnMessage
    void onMessage(String message, Session session) {
        def slurper = new groovy.json.JsonSlurper()
        try {
            def payload = slurper.parseText(message)
            if (payload?.type == "registerSuccess") {
                ec.logger.info("✨ [AGI-IDE MCP BRIDGE] Handshake confirmed! Assigned Channel: ${payload.channel}")
                
                // LAUNCH STAGE 2: Connect out to the assigned permanent channel path using the session token
                String permanentChannelUrl = "${this.proxyBaseUrl}${payload.channel}?token=${payload.token}"
                ec.logger.info("🔗 [AGI-IDE MCP BRIDGE] Spin-up Stage 2 active tunnel path: ${permanentChannelUrl}")
                
                WebSocketContainer container = ContainerProvider.getWebSocketContainer()
                container.connectToServer(new McpChannelActiveListener(this.ec), new URI(permanentChannelUrl))
            }
        } catch (Exception e) {
            ec.logger.error("❌ [AGI-IDE MCP BRIDGE] Error processing verification response: " + e.getMessage(), e)
        }
    }

    @OnClose
    void onClose(Session session, CloseReason reason) {
        ec.logger.info("📥 [AGI-IDE MCP BRIDGE] Registration gate connection disconnected cleanly. (${reason.getReasonPhrase()})")
    }

    @OnError
    void onError(Session session, Throwable throwable) {
        ec.logger.error("❌ [AGI-IDE MCP BRIDGE] Error encountered inside registration gate: " + throwable.getMessage())
    }
}

WebSocketContainer container = ContainerProvider.getWebSocketContainer()
try {
    container.connectToServer(new McpProxyClientListener(ec, finalToken, proxyBaseUrl), new URI(registerUrl))
} catch (Exception e) {
    ec.logger.error("❌ [AGI-IDE MCP BRIDGE INITIALIZATION FAILED] " + e.getMessage(), e)
}