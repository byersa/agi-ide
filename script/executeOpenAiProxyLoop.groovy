package org.moqui.ai

import groovy.json.JsonOutput
import groovy.json.JsonSlurper

// =====================================================================================
// STEP 0: CONTEXT & ENVIRONMENT RESOLUTION
// =====================================================================================
if (context.scriptFlags == null) context.scriptFlags = [:]

def ec = context.ec
String userPrompt = context.userPrompt
String activeRagContext = context.activeRagContext ?: ""
String targetComponent = context.targetComponent ?: "nursinghome"
String artifactUri = context.focusCoordinate ?: context.activeArtifactLocation ?: ""
String targetNodeId = context.targetMariaId ?: context.focusCoordinate ?: "root"
String userId = ec.user.getUserId() ?: "system_ide_user"

// Dynamic Provider Configuration
String apiKey = context.aiApiKey ?: System.getProperty("AI_API_KEY") ?: System.getenv("AI_API_KEY") ?: System.getenv("GEMINI_API_KEY") ?: "ollama"
String endpointUrl = context.aiEndpointUrl ?: System.getProperty("AI_ENDPOINT_URL") ?: System.getenv("AI_ENDPOINT_URL") ?: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
String modelName = context.aiModelName ?: System.getProperty("AI_MODEL_NAME") ?: System.getenv("AI_MODEL_NAME") ?: "gemini-3.7-flash"

ec.logger.info("🔍 [PROXY LOOP INIT] model: ${modelName}, endpoint: ${endpointUrl}, targetComponent: ${targetComponent}, artifactUri: ${artifactUri}")

// =====================================================================================
// STEP 1: FETCH MCP TOOLS & FORMAT FOR OPENAI FUNCTION SPECIFICATION
// =====================================================================================
Map toolsResult = ec.service.sync().name("org.moqui.ai.AgiMcpBridgeServices.list#Tools").call()
List rawTools = toolsResult.tools ?: toolsResult.toolsList ?: []

List openAiTools = []
rawTools.each { tool ->
    Map properties = [:]
    if (tool.inputSchema?.properties) {
        tool.inputSchema.properties.each { pKey, pVal ->
            if (pVal.internal == true) return
            
            // 🎯 FIXED: Support nested maps, arrays, and proper primitives instead of forcing "string"
            String explicitType = (pVal.type ?: "string").toLowerCase()
            Map propMap = [
                type: explicitType,
                description: pVal.description ?: ""
            ]
            
            if (explicitType == "object" && pVal.properties) {
                propMap.properties = pVal.properties
            } else if (explicitType == "array" && pVal.items) {
                propMap.items = pVal.items
            }
            
            properties[pKey] = propMap
        }
    }

    List rawRequired = tool.inputSchema?.required ?: []
    List validRequired = rawRequired.findAll { properties.containsKey(it) }
    String funcName = tool.name ?: tool.command?.replace("/", "")?.replace("-", "_")

    openAiTools.add([
        type: "function",
        function: [
            name: funcName,
            description: tool.description ?: "",
            parameters: [
                type: "object",
                properties: properties,
                required: validRequired
            ]
        ]
    ])
}
ec.logger.info("🔧 [PROXY LOOP TOOLS] Registered ${openAiTools.size()} active tool specs.")

// =====================================================================================
// STEP 2: CONSTRUCT SYSTEM INSTRUCTIONS & INITIAL MESSAGES
// =====================================================================================
String systemInstruction = """You are the AI Orchestrator for the Moqui AI IDE System.
Your goal is to scaffold screens, refactor assets, or update UI components for the target component '${targetComponent}'.

CRITICAL RULES & TOOL CONTRACT:
- Top-level domain screens belong under screenPath '${targetComponent}/<ScreenName>'.
- Subscreens belong under their parent directory (e.g. '${targetComponent}/PatientManagement/AddPatient').
- When asked to 'Fill in', 'Build', or 'Update' a screen, call 'modify_blueprint' with BOTH required arguments:
    1. 'artifactUri': The full target URI (e.g. 'component://${targetComponent}/screen/${targetComponent}/PatientManagement/AddPatient.xml')
    2. 'metaJsonData': A valid JSON string containing the complete AST tree object:
       {
         "name": "screen",
         "attributes": {
           "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
           "xsi:noNamespaceSchemaLocation": "http://moqui.org/xsd/xml-screen-3.xsd",
           "default-menu-title": "<Title>"
         },
         "children": [ ... ]
       }
- NEVER call 'modify_blueprint' with empty or null arguments.
- Sibling field schemas and compliance rules in the staged context must be directly incorporated into the AST.
"""

StringBuilder userPromptBuilder = new StringBuilder()
if (activeRagContext && activeRagContext.trim()) {
    userPromptBuilder.append("=== ACTIVE CONTEXT & TARGET ARTIFACT ===\n")
    userPromptBuilder.append(activeRagContext.trim()).append("\n\n")
}
userPromptBuilder.append("=== USER REQUEST ===\n")
userPromptBuilder.append(userPrompt)

List messages = [
    [ role: "system", content: systemInstruction ],
    [ role: "user",   content: userPromptBuilder.toString() ]
]

// =====================================================================================
// STEP 3: MULTI-TURN ORCHESTRATION LOOP
// =====================================================================================
int currentTurn = 0
int MAX_TURNS = 6
String finalArtifactUri = null
String finalMessage = ""
boolean executionSuccess = false

// Set of read-only tool names that require follow-up execution turn
Set<String> readOnlyTools = ["get_raw_xml", 
                             "get_artifact_palette", 
                             "get_workspace_buffer", 
                             "get_screen_archetype",
                             "get_form_metadata"] as Set

try {
    while (currentTurn < MAX_TURNS && !executionSuccess) {
        currentTurn++
        ec.logger.info("📡 [AGI PROXY LOOP] Starting Turn ${currentTurn} of ${MAX_TURNS} (Model: ${modelName})...")

        Map requestPayload = [
            model: modelName,
            messages: messages,
            temperature: 0.2
        ]
        if (openAiTools.size() > 0) {
            requestPayload.tools = openAiTools
            requestPayload.tool_choice = "auto"
        }

        // 3.1 HTTP POST to Model Endpoint
        URL url = new URL(endpointUrl)
        HttpURLConnection conn = (HttpURLConnection) url.openConnection()
        conn.setRequestMethod("POST")
        conn.setRequestProperty("Content-Type", "application/json")
        if (apiKey && apiKey != "ollama") {
            conn.setRequestProperty("Authorization", "Bearer ${apiKey}")
        }
        conn.setConnectTimeout(60000)
        conn.setReadTimeout(120000)
        conn.setDoOutput(true)

        String jsonPayload = JsonOutput.toJson(requestPayload)
        conn.outputStream.withWriter("UTF-8") { writer -> writer.write(jsonPayload) }

        int responseCode = conn.getResponseCode()
        String rawResponseBody = (responseCode == 200 ? conn.inputStream : conn.errorStream)?.text ?: ""

        if (responseCode != 200) {
            ec.logger.error("❌ LLM API Call Failed (${responseCode}): ${rawResponseBody}")
            context.completionText = JsonOutput.toJson([
                status: "error",
                error: "LLM API HTTP ${responseCode}: ${rawResponseBody}"
            ])
            return
        }

        Map apiResponse = new JsonSlurper().parseText(rawResponseBody)
        def choice = apiResponse?.choices?[0]
        def assistantMessage = choice?.message

        if (!assistantMessage) {
            ec.logger.error("❌ Empty message returned by LLM: ${rawResponseBody}")
            context.completionText = JsonOutput.toJson([
                status: "error",
                error: "Empty message choice in response."
            ])
            return
        }

        messages.add(assistantMessage)
        List toolCalls = assistantMessage.tool_calls ?: []

        if (toolCalls.size() > 0) {
            boolean turnHadErrors = false
            boolean onlyReadOnlyTools = true

            for (def call in toolCalls) {
                String toolCallId = call.id ?: "call_${System.currentTimeMillis()}"
                String calledName = call.function?.name
                String rawArgsStr = call.function?.arguments ?: "{}"
                Map toolArgs = [:]
                
                try {
                    toolArgs = new JsonSlurper().parseText(rawArgsStr) as Map
                } catch (Exception parseEx) {
                    ec.logger.warn("⚠️ Could not parse tool arguments JSON: ${rawArgsStr}")
                }

                // 🔍 DEBUG LOG: Inspect exactly what the LLM generated for this tool call
                ec.logger.info("""🛠️ [AGI PROXY LOOP DEBUG Turn: ${currentTurn}] 
                  - Called Function Name: ${calledName}
                  - Raw Arguments String from LLM: ${rawArgsStr}
                  - Parsed Map Arguments size: ${toolArgs?.size()}
                  - Argument Keys Present: ${toolArgs?.keySet()}
                  - metaJsonData value preview: ${toolArgs?.metaJsonData ? toolArgs.metaJsonData.toString().take(200) + '...' : 'NULL/MISSING'}
                """)

                if (!readOnlyTools.contains(calledName)) {
                    onlyReadOnlyTools = false
                }

                ec.logger.info("🚀 [AGENT TOOL EXECUTION - Turn ${currentTurn}] Model called [${calledName}] with args: ${toolArgs}")

                def matchedTool = rawTools.find { t ->
                    t.name == calledName || 
                    (t.command && t.command.replace("/", "").replace("-", "_") == calledName)
                }

                if (!matchedTool || !matchedTool.serviceName) {
                    ec.logger.error("❌ Could not resolve dynamic serviceName for tool: ${calledName}")
                    turnHadErrors = true
                    messages.add([
                        role: "tool",
                        tool_call_id: toolCallId,
                        name: calledName,
                        content: JsonOutput.toJson([ error: "Service not found for tool name ${calledName}" ])
                    ])
                    continue
                }

                String serviceName = matchedTool.serviceName
                if (!toolArgs.targetComponent) toolArgs.targetComponent = targetComponent

                // Path normalization
                if (!toolArgs.artifactUri) {
                    if (toolArgs.targetScreenUri) {
                        toolArgs.artifactUri = toolArgs.targetScreenUri
                    } else if (toolArgs.screenPath) {
                        String sp = toolArgs.screenPath.toString().trim()
                        if (sp.startsWith("component://")) {
                            toolArgs.artifactUri = sp.endsWith(".xml") ? sp : sp + ".xml"
                        } else {
                            if (sp.endsWith(".xml")) sp = sp.substring(0, sp.length() - 4)
                            if (sp.startsWith("/")) sp = sp.substring(1)

                            String compPrefix = "${targetComponent}/"
                            if (sp.startsWith(compPrefix)) {
                                toolArgs.artifactUri = "component://${targetComponent}/screen/${sp}.xml"
                            } else {
                                toolArgs.artifactUri = "component://${targetComponent}/screen/${targetComponent}/${sp}.xml"
                            }
                        }
                    } else if (artifactUri) {
                        toolArgs.artifactUri = artifactUri
                    }
                }

                if (serviceName == "McpServices.mcp#ToolsCall") {
                    toolArgs.name = calledName
                }
                ec.logger.info("🔧 [HARNESS CALL] Invoking ${serviceName} with: ${toolArgs}")

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
                    ec.logger.warn("⚠️ Exception during isolated tool execution: ${ex.message}", ex)
                }

                if (executionFailed || ec.message.hasError()) {
                    String serviceErrors = ec.message.getErrorsString()
                    ec.message.clearAll()
                    turnHadErrors = true

                    ec.logger.warn("⚠️ [TOOL ERROR - Turn ${currentTurn}] ${serviceName} failed: ${serviceErrors}")

                    messages.add([
                        role: "tool",
                        tool_call_id: toolCallId,
                        name: calledName,
                        content: JsonOutput.toJson([
                            status: "error",
                            validationError: serviceErrors,
                            message: "Tool execution failed. Please correct parameters and retry."
                        ])
                    ])
                } else {
                    if (toolResult?.artifactUri) {
                        finalArtifactUri = toolResult.artifactUri
                    } else if (toolArgs.artifactUri && !readOnlyTools.contains(calledName)) {
                        finalArtifactUri = toolArgs.artifactUri
                    }

                    ec.logger.info("✅ [TOOL SUCCESS - Turn ${currentTurn}] ${serviceName} returned: ${toolResult?.keySet()}")

                    messages.add([
                        role: "tool",
                        tool_call_id: toolCallId,
                        name: calledName,
                        content: JsonOutput.toJson([
                            status: "success",
                            result: toolResult ?: [:]
                        ])
                    ])
                }
            }

            // Only complete the loop if mutations occurred without errors; if read-only, loop for next turn
            if (!turnHadErrors && !onlyReadOnlyTools) {
                executionSuccess = true
                finalMessage = "Successfully executed dynamic tool sequence."
            } else if (onlyReadOnlyTools && !turnHadErrors) {
                ec.logger.info("🔄 [CONTINUING MULTI-TURN] Turn ${currentTurn} was read-only (${toolCalls*.function?.name}). Requesting follow-up mutation turn from model...")
            } else {
                ec.logger.info("🔄 [SELF-HEALING RE-PROMPT] Feeding error response back to Model for Turn ${currentTurn + 1}...")
            }

        } else {
            finalMessage = assistantMessage.content ?: "Prompt processed with no direct tool calls."
            executionSuccess = true
        }
    }

    // =================================================================================
    // STEP 4: FINALIZE RESPONSE & SYNC ARTIFACT STATE
    // =================================================================================
    if (executionSuccess) {
        String targetUri = finalArtifactUri ?: artifactUri
        Map bufferData = [:]
    
        if (targetUri) {
            Map bufRes = ec.service.sync().name("org.moqui.ide.AgiWorkspaceServices.get#WorkspaceBuffer")
                .parameters([artifactUri: targetUri, userId: userId])
                .call()
            if (bufRes?.metaJsonBuffer) {
                bufferData = [
                    workspaceBufferId: bufRes.workspaceBufferId,
                    metaJsonBuffer   : bufRes.metaJsonBuffer
                ]
            }
        }
    
        ec.logger.info("🏁 [PROXY LOOP COMPLETE] Target URI: ${targetUri}, Buffer present: ${!bufferData.isEmpty()}")
    
        context.completionText = JsonOutput.toJson([
            status            : "success",
            type              : targetUri ? "MUTATION_EXECUTED" : "TEXT_RESPONSE",
            targetArtifactUri : targetUri,
            workspaceBuffer   : bufferData,
            message           : finalMessage
        ])
    } else {
        context.completionText = JsonOutput.toJson([
            status: "error",
            error: "Agent could not complete required mutations after ${MAX_TURNS} attempts."
        ])
    }

} catch (Exception e) {
    ec.logger.error("❌ Agent Proxy Loop Execution Failed: " + e.getMessage(), e)
    context.completionText = JsonOutput.toJson([
        status: "error",
        error: "Agent Exception: ${e.getMessage()}"
    ])
}