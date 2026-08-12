package org.moqui.ai

import groovy.json.JsonOutput
import groovy.json.JsonSlurper

if (context.scriptFlags == null) context.scriptFlags = [:]

def ec = context.ec
String userPrompt = context.userPrompt
String targetComponent = context.targetComponent ?: "nursinghome"
String artifactUri = context.focusCoordinate ?: context.activeArtifactLocation ?: ""
String targetNodeId = context.targetMariaId ?: context.focusCoordinate ?: "root"
String userId = ec.user.getUserId() ?: "system_ide_user"

// 1. FETCH DYNAMIC MCP TOOLS AND CONVERT TO GEMINI FUNCTION DECLARATIONS
Map toolsResult = ec.service.sync().name("org.moqui.ai.AgiMcpBridgeServices.list#Tools").call()
List rawTools = toolsResult.tools ?: toolsResult.toolsList ?: []

List functionDeclarations = []
rawTools.each { tool ->
    Map properties = [:]
    if (tool.inputSchema?.properties) {
        tool.inputSchema.properties.each { pKey, pVal ->
            if (pVal.internal == true) return

            properties[pKey] = [
                type: (pVal.type ?: "string").toUpperCase(),
                description: pVal.description ?: ""
            ]
        }
    }

    List rawRequired = tool.inputSchema?.required ?: []
    List validRequired = rawRequired.findAll { properties.containsKey(it) }

    Map parametersMap = [
        type: "OBJECT",
        properties: properties
    ]
    if (validRequired) {
        parametersMap.required = validRequired
    }

    String geminiName = tool.name ?: tool.command?.replace("/", "")?.replace("-", "_")

    functionDeclarations.add([
        name: geminiName,
        description: tool.description ?: "",
        parameters: parametersMap
    ])
}

// 2. CONSTRUCT SYSTEM INSTRUCTIONS
String systemInstruction = """
You are the AI Orchestrator for the Moqui AI IDE System.
Your goal is to scaffold screens, refactor assets, or update UI components for the target component '${targetComponent}'.

CRITICAL RULES & CONVENTIONS:
- Top-level domain screens belong under screenPath '${targetComponent}/<ScreenName>' (e.g. '${targetComponent}/ManagePatients').
- When asked to create or scaffold a screen, call 'create_screen'.
- SUBSCREEN CREATION MANDATE: Whenever you bind subscreens to a parent screen using 'bind_subscreen', you MUST ALSO call 'create_screen' for each subscreen (e.g. screenPath: '${targetComponent}/ERP', screenPath: '${targetComponent}/PatientManagement') so that the physical subscreen XML files exist on disk.
- When asked to move or rename a screen, call 'move_artifact'. Pass 'sourceArtifactUri' and 'targetArtifactUri'.
- When asked to add or attach a custom Vue/QVT component script to a screen, call 'attach_qvt_asset'.
- When binding subscreens, pass 'artifactUri', 'subscreenName', and 'subscreenLocation'.
- Target component is '${targetComponent}'.
"""

String apiKey = System.getenv("GEMINI_API_KEY") ?: System.getProperty("GEMINI_API_KEY")
if (!apiKey) {
    context.completionText = JsonOutput.toJson([
        status: "error",
        error: "GEMINI_API_KEY is not configured in environment or system properties."
    ])
    return
}

// 3. CONSTRUCT INITIAL CONVERSATION HISTORY
List contents = [
    [ role: "user", parts: [[text: userPrompt]] ]
]

int currentTurn = 0
int MAX_TURNS = 3
String finalArtifactUri = null
String finalMessage = ""
boolean executionSuccess = false

try {
    while (currentTurn < MAX_TURNS && !executionSuccess) {
        currentTurn++
        ec.logger.info("📡 [AGI PROXY LOOP] Starting Turn ${currentTurn} of ${MAX_TURNS}...")

        Map geminiPayload = [
            system_instruction: [ parts: [[text: systemInstruction]] ],
            contents: contents
        ]

        if (functionDeclarations.size() > 0) {
            geminiPayload.tools = [ [ function_declarations: functionDeclarations ] ]
        }

        String endpointUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}"
        
        URL url = new URL(endpointUrl)
        HttpURLConnection conn = (HttpURLConnection) url.openConnection()
        conn.setRequestMethod("POST")
        conn.setRequestProperty("Content-Type", "application/json")
        conn.setDoOutput(true)
        
        conn.outputStream.withWriter("UTF-8") { writer ->
            writer.write(JsonOutput.toJson(geminiPayload))
        }

        int responseCode = conn.getResponseCode()
        String rawResponseBody = (responseCode == 200 ? conn.inputStream : conn.errorStream)?.text ?: ""

        if (responseCode != 200) {
            ec.logger.error("❌ Gemini API Call Failed (${responseCode}): ${rawResponseBody}")
            context.completionText = JsonOutput.toJson([
                status: "error",
                error: "Gemini API HTTP ${responseCode}: ${rawResponseBody}"
            ])
            return
        }

        Map apiResponse = new JsonSlurper().parseText(rawResponseBody)
        def candidateContent = apiResponse?.candidates?[0]?.content
        List parts = candidateContent?.parts ?: []

        if (candidateContent) {
            contents.add(candidateContent)
        }

        List functionCalls = parts.findAll { it.functionCall != null }

        if (functionCalls.size() > 0) {
            List functionResponseParts = []
            boolean turnHadErrors = false

            for (def part in functionCalls) {
                String calledName = part.functionCall.name
                Map toolArgs = part.functionCall.args ?: [:]

                ec.logger.info("🚀 [AGENT TOOL EXECUTION - Turn ${currentTurn}] Gemini called [${calledName}] with raw args: ${toolArgs}")

                def matchedTool = rawTools.find { t ->
                    t.name == calledName || 
                    (t.command && t.command.replace("/", "").replace("-", "_") == calledName)
                }

                if (!matchedTool || !matchedTool.serviceName) {
                    ec.logger.error("❌ Could not resolve dynamic serviceName for tool: ${calledName}")
                    turnHadErrors = true
                    functionResponseParts.add([
                        functionResponse: [
                            name: calledName,
                            response: [ error: "Service not found for tool name ${calledName}" ]
                        ]
                    ])
                    continue
                }

                String serviceName = matchedTool.serviceName
                if (!toolArgs.targetComponent) toolArgs.targetComponent = targetComponent

                // =====================================================================
                // 🎯 HARNESS PARAMETER NORMALIZATION (Translates LLM aliases)
                // =====================================================================
                // 1. Normalize Parent Screen URI
                if (!toolArgs.artifactUri) {
                    if (toolArgs.targetScreenUri) toolArgs.artifactUri = toolArgs.targetScreenUri
                    else if (toolArgs.screenPath) {
                        String sp = toolArgs.screenPath.toString().trim()
                        toolArgs.artifactUri = sp.startsWith("component://") ? sp : "component://${targetComponent}/screen/${sp.endsWith('.xml') ? sp : sp + '.xml'}"
                    } else if (artifactUri) {
                        toolArgs.artifactUri = artifactUri
                    }
                }

                // 2. Normalize Subscreen Location & Name if passed as raw paths or tab wrapper IDs
                if (calledName == "bind_subscreen") {
                    String subName = toolArgs.subscreenName ? toolArgs.subscreenName.toString() : ""
                    String rawLoc = toolArgs.subscreenLocation ? toolArgs.subscreenLocation.toString().trim() : ""

                    if (!subName && rawLoc) {
                        subName = rawLoc.substring(rawLoc.lastIndexOf('/') + 1).replace(".xml", "")
                        toolArgs.subscreenName = subName
                    }

                    // Prevent tab container IDs (e.g. 'subscreens-tabs') from overwriting file locations
                    if (!rawLoc || rawLoc.contains("subscreens-") || !rawLoc.endsWith(".xml")) {
                        toolArgs.subscreenLocation = "component://${targetComponent}/screen/${targetComponent}/${subName}.xml"
                    } else if (!rawLoc.startsWith("component://")) {
                        toolArgs.subscreenLocation = "component://${targetComponent}/screen/${targetComponent}/${rawLoc.endsWith('.xml') ? rawLoc : rawLoc + '.xml'}"
                    }

                    if (toolArgs.defaultSubscreen && !toolArgs.isDefault) {
                        String defSub = toolArgs.defaultSubscreen.toString()
                        if (subName && defSub.contains(subName)) {
                            toolArgs.isDefault = true
                        }
                    }
                }

                ec.logger.info("🔧 [HARNESS NORMALIZED ARGS] Calling ${serviceName} with: ${toolArgs}")

                // =====================================================================
                // 🎯 ISOLATED TRANSACTION EXECUTION (Prevents Poisoning Multi-Turn Loop)
                // =====================================================================
                Map toolResult = [:]
                boolean executionFailed = false

                try {
                    ec.transaction.runRequireNew(0, "Executing isolated agent tool ${calledName}", {
                        toolResult = ec.service.sync().name(serviceName).parameters(toolArgs).call()
                        if (ec.message.hasError()) {
                            executionFailed = true
                        }
                    })
                } catch (Exception ex) {
                    executionFailed = true
                    ec.logger.warn("⚠️ Exception during isolated tool execution: ${ex.message}")
                }

                // Check error status and prepare feedback turn
                if (executionFailed || ec.message.hasError()) {
                    String serviceErrors = ec.message.getErrorsString()
                    ec.message.clearAll()
                    turnHadErrors = true

                    ec.logger.warn("⚠️ [TOOL ERROR - Turn ${currentTurn}] ${serviceName} failed: ${serviceErrors}")

                    functionResponseParts.add([
                        functionResponse: [
                            name: calledName,
                            response: [ 
                                status: "error",
                                validationError: serviceErrors,
                                message: "Tool execution failed. Please pass required parameters strictly as defined in the schema."
                            ]
                        ]
                    ])
                } else {
                    if (toolResult?.artifactUri) finalArtifactUri = toolResult.artifactUri
                    ec.logger.info("✅ [TOOL SUCCESS - Turn ${currentTurn}] Executed ${serviceName}")

                    functionResponseParts.add([
                        functionResponse: [
                            name: calledName,
                            response: [ 
                                status: "success",
                                result: toolResult ?: [:]
                            ]
                        ]
                    ])
                }
            }

            contents.add([
                role: "user",
                parts: functionResponseParts
            ])

            if (!turnHadErrors) {
                executionSuccess = true
                finalMessage = "Successfully executed dynamic tool sequence."
            } else {
                ec.logger.info("🔄 [SELF-HEALING RE-PROMPT] Feeding error response back to Gemini for Turn ${currentTurn + 1}...")
            }

        } else {
            finalMessage = parts[0]?.text ?: "Prompt processed with no direct tool calls."
            executionSuccess = true
        }
    }

    if (executionSuccess) {
        // Fetch updated raw XML or AST for client auto-sync
        String updatedRawXml = ""
        if (finalArtifactUri) {
            try {
                def resRef = ec.resource.getLocationReference(finalArtifactUri)
                if (resRef && resRef.exists) updatedRawXml = resRef.getText()
            } catch (Exception ignored) {}
        }

        context.completionText = JsonOutput.toJson([
            status: "success",
            type: finalArtifactUri ? "MUTATION_EXECUTED" : "TEXT_RESPONSE",
            createdArtifactUri: finalArtifactUri,
            rawXmlContent: updatedRawXml,
            message: finalMessage
        ])
    } else {
        context.completionText = JsonOutput.toJson([
            status: "error",
            error: "Agent could not self-correct tool parameters after ${MAX_TURNS} attempts."
        ])
    }

} catch (Exception e) {
    ec.logger.error("❌ Agent Proxy Loop Execution Failed: " + e.getMessage(), e)
    context.completionText = JsonOutput.toJson([
        status: "error",
        error: "Agent Exception: ${e.getMessage()}"
    ])
}