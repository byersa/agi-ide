package org.moqui.ai

import groovy.json.JsonOutput
import groovy.json.JsonSlurper

// =====================================================================================
// STEP 0: CONTEXT & ENVIRONMENT INITIALIZATION
// =====================================================================================
// Ensure script-level execution flags map is initialized if missing.
if (context.scriptFlags == null) context.scriptFlags = [:]

// Extract Moqui execution context and parameters supplied by the client/service caller.
def ec = context.ec
String userPrompt = context.userPrompt
String targetComponent = context.targetComponent ?: "nursinghome"
String artifactUri = context.focusCoordinate ?: context.activeArtifactLocation ?: ""
String targetNodeId = context.targetMariaId ?: context.focusCoordinate ?: "root"
String userId = ec.user.getUserId() ?: "system_ide_user"

// =====================================================================================
// STEP 1: FETCH DYNAMIC MCP TOOLS & MAP TO GEMINI FUNCTION DECLARATIONS
// =====================================================================================
// Discover all available MCP tools dynamically registered within the Moqui framework.
Map toolsResult = ec.service.sync().name("org.moqui.ai.AgiMcpBridgeServices.list#Tools").call()
List rawTools = toolsResult.tools ?: toolsResult.toolsList ?: []

List functionDeclarations = []
rawTools.each { tool ->
    Map properties = [:]
    
    // Convert MCP tool inputSchema property definitions to Gemini JSON Schema format.
    if (tool.inputSchema?.properties) {
        tool.inputSchema.properties.each { pKey, pVal ->
            // Skip parameters flagged as internal/framework-managed
            if (pVal.internal == true) return

            properties[pKey] = [
                type: (pVal.type ?: "string").toUpperCase(),
                description: pVal.description ?: ""
            ]
        }
    }

    // Filter required parameters: ensure only properties exposed to the LLM are marked required.
    List rawRequired = tool.inputSchema?.required ?: []
    List validRequired = rawRequired.findAll { properties.containsKey(it) }

    Map parametersMap = [
        type: "OBJECT",
        properties: properties
    ]
    if (validRequired) {
        parametersMap.required = validRequired
    }

    // Standardize the tool identifier to match Gemini function declaration naming rules (alphanumeric/underscore).
    String geminiName = tool.name ?: tool.command?.replace("/", "")?.replace("-", "_")

    functionDeclarations.add([
        name: geminiName,
        description: tool.description ?: "",
        parameters: parametersMap
    ])
}

// =====================================================================================
// STEP 2: BUILD SYSTEM INSTRUCTIONS & VERIFY API CREDENTIALS
// =====================================================================================
// Define behavioral constraints, naming conventions, and file path expectations for the agent.
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

// Retrieve API key from environment variables or JVM system properties.
String apiKey = System.getenv("GEMINI_API_KEY") ?: System.getProperty("GEMINI_API_KEY")
if (!apiKey) {
    context.completionText = JsonOutput.toJson([
        status: "error",
        error: "GEMINI_API_KEY is not configured in environment or system properties."
    ])
    return
}

// =====================================================================================
// STEP 3: INITIALIZE MULTI-TURN CONVERSATION STATE
// =====================================================================================
// Seed conversation history with the initial user prompt.
List contents = [
    [ role: "user", parts: [[text: userPrompt]] ]
]

// Loop control variables for multi-turn function call / self-healing cycles.
int currentTurn = 0
int MAX_TURNS = 3
String finalArtifactUri = null
String finalMessage = ""
boolean executionSuccess = false

try {
    // =================================================================================
    // STEP 4: MULTI-TURN ORCHESTRATION LOOP (Self-Healing Tool Execution)
    // =================================================================================
    while (currentTurn < MAX_TURNS && !executionSuccess) {
        currentTurn++
        ec.logger.info("📡 [AGI PROXY LOOP] Starting Turn ${currentTurn} of ${MAX_TURNS}...")

        // 4.1 Assemble current request payload including system instructions, history, and available tools
        Map geminiPayload = [
            system_instruction: [ parts: [[text: systemInstruction]] ],
            contents: contents
        ]

        if (functionDeclarations.size() > 0) {
            geminiPayload.tools = [ [ function_declarations: functionDeclarations ] ]
        }

        // 4.2 Dispatch HTTP POST request to Google Gemini REST endpoint
        String endpointUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}"
        
        URL url = new URL(endpointUrl)
        HttpURLConnection conn = (HttpURLConnection) url.openConnection()
        conn.setRequestMethod("POST")
        conn.setRequestProperty("Content-Type", "application/json")
        conn.setDoOutput(true)
        
        conn.outputStream.withWriter("UTF-8") { writer ->
            writer.write(JsonOutput.toJson(geminiPayload))
        }

        // 4.3 Read and validate the raw HTTP response
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

        // 4.4 Parse LLM response and append model's turn (candidate content) to conversation history
        Map apiResponse = new JsonSlurper().parseText(rawResponseBody)
        def candidateContent = apiResponse?.candidates?[0]?.content
        List parts = candidateContent?.parts ?: []

        if (candidateContent) {
            contents.add(candidateContent)
        }

        // 4.5 Inspect model output for tool / function call invocations
        List functionCalls = parts.findAll { it.functionCall != null }

        if (functionCalls.size() > 0) {
            // Model emitted one or more function calls; execute them sequentially
            List functionResponseParts = []
            boolean turnHadErrors = false

            for (def part in functionCalls) {
                String calledName = part.functionCall.name
                Map toolArgs = part.functionCall.args ?: [:]

                ec.logger.info("🚀 [AGENT TOOL EXECUTION - Turn ${currentTurn}] Gemini called [${calledName}] with raw args: ${toolArgs}")

                // Resolve tool metadata and backing Moqui service
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
                // 4.6 HARNESS PARAMETER NORMALIZATION (Translates LLM parameter drift)
                // =====================================================================
                // (a) Resolve artifact URI from alternative parameter aliases
                if (!toolArgs.artifactUri) {
                    if (toolArgs.targetScreenUri) toolArgs.artifactUri = toolArgs.targetScreenUri
                    else if (toolArgs.screenPath) {
                        String sp = toolArgs.screenPath.toString().trim()
                        toolArgs.artifactUri = sp.startsWith("component://") ? sp : "component://${targetComponent}/screen/${sp.endsWith('.xml') ? sp : sp + '.xml'}"
                    } else if (artifactUri) {
                        toolArgs.artifactUri = artifactUri
                    }
                }

                // (b) Normalize subscreen parameters for bind_subscreen
                if (calledName == "bind_subscreen") {
                    String subName = toolArgs.subscreenName ? toolArgs.subscreenName.toString() : ""
                    String rawLoc = toolArgs.subscreenLocation ? toolArgs.subscreenLocation.toString().trim() : ""

                    // Extract base screen name from subscreen path if name was omitted
                    if (!subName && rawLoc) {
                        subName = rawLoc.substring(rawLoc.lastIndexOf('/') + 1).replace(".xml", "")
                        toolArgs.subscreenName = subName
                    }

                    // Guard against container IDs being supplied instead of physical file locations
                    if (!rawLoc || rawLoc.contains("subscreens-") || !rawLoc.endsWith(".xml")) {
                        toolArgs.subscreenLocation = "component://${targetComponent}/screen/${targetComponent}/${subName}.xml"
                    } else if (!rawLoc.startsWith("component://")) {
                        toolArgs.subscreenLocation = "component://${targetComponent}/screen/${targetComponent}/${rawLoc.endsWith('.xml') ? rawLoc : rawLoc + '.xml'}"
                    }

                    // Handle boolean defaultSubscreen flag mapping
                    if (toolArgs.defaultSubscreen && !toolArgs.isDefault) {
                        String defSub = toolArgs.defaultSubscreen.toString()
                        if (subName && defSub.contains(subName)) {
                            toolArgs.isDefault = true
                        }
                    }
                }

                ec.logger.info("🔧 [HARNESS NORMALIZED ARGS] Calling ${serviceName} with: ${toolArgs}")

                // =====================================================================
                // 4.7 ISOLATED TRANSACTION EXECUTION
                // =====================================================================
                // Run tool in an isolated sub-transaction (requires-new) to prevent rollback of the parent thread
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

                // =====================================================================
                // 4.8 CAPTURE TOOL OUTPUT & BUILD FUNCTION RESPONSE PART
                // =====================================================================
                if (executionFailed || ec.message.hasError()) {
                    String serviceErrors = ec.message.getErrorsString()
                    ec.message.clearAll() // Clear error messages so parent execution can continue/re-prompt
                    turnHadErrors = true

                    ec.logger.warn("⚠️ [TOOL ERROR - Turn ${currentTurn}] ${serviceName} failed: ${serviceErrors}")

                    // Format error feedback part to let Gemini self-correct in the next turn
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

                    // Format successful execution part
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

            // 4.9 Append all tool execution results as a user turn into the conversation history
            contents.add([
                role: "user",
                parts: functionResponseParts
            ])

            // If all tool calls succeeded, mark execution complete; otherwise loop for self-healing
            if (!turnHadErrors) {
                executionSuccess = true
                finalMessage = "Successfully executed dynamic tool sequence."
            } else {
                ec.logger.info("🔄 [SELF-HEALING RE-PROMPT] Feeding error response back to Gemini for Turn ${currentTurn + 1}...")
            }

        } else {
            // Model returned a direct text response without function calls
            finalMessage = parts[0]?.text ?: "Prompt processed with no direct tool calls."
            executionSuccess = true
        }
    }

    // =================================================================================
    // STEP 5: FINALIZE RESPONSE & SYNC ARTIFACT STATE
    // =================================================================================
    if (executionSuccess) {
        // If a file artifact was created or modified, load the updated XML text off disk
        String updatedRawXml = ""
        if (finalArtifactUri) {
            try {
                def resRef = ec.resource.getLocationReference(finalArtifactUri)
                if (resRef && resRef.exists) updatedRawXml = resRef.getText()
            } catch (Exception ignored) {}
        }

        // Return standard success payload to caller
        context.completionText = JsonOutput.toJson([
            status: "success",
            type: finalArtifactUri ? "MUTATION_EXECUTED" : "TEXT_RESPONSE",
            createdArtifactUri: finalArtifactUri,
            rawXmlContent: updatedRawXml,
            message: finalMessage
        ])
    } else {
        // Return failure payload if maximum retry turns were exceeded without resolution
        context.completionText = JsonOutput.toJson([
            status: "error",
            error: "Agent could not self-correct tool parameters after ${MAX_TURNS} attempts."
        ])
    }

} catch (Exception e) {
    // Catch-all block for unhandled networking, serialization, or engine exceptions
    ec.logger.error("❌ Agent Proxy Loop Execution Failed: " + e.getMessage(), e)
    context.completionText = JsonOutput.toJson([
        status: "error",
        error: "Agent Exception: ${e.getMessage()}"
    ])
}