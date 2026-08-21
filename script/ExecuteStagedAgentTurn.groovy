import groovy.json.JsonSlurper
import groovy.json.JsonOutput
import org.moqui.resource.ResourceReference

// 1. Normalize and resolve the prompt text
String effectivePrompt = userPrompt ?: originalPrompt ?: ""
if (adHocPrompt && adHocPrompt.trim()) {
    effectivePrompt += "\n\n### AD-HOC DIRECTIVES & CONSTRAINTS:\n" + adHocPrompt.trim()
}

// 2. Parse and format selected RAG Context items
List resolvedRagItems = []
if (ragContext != null) {
    resolvedRagItems = ragContext
} else if (contextPayloadJson) {
    try {
        resolvedRagItems = new JsonSlurper().parseText(contextPayloadJson) as List
    } catch (Exception e) {
        ec.logger.warn("Could not parse contextPayloadJson: ${e.message}")
    }
}

StringBuilder ragBuilder = new StringBuilder()
if (resolvedRagItems) {
    ragBuilder.append("\n### STAGED RAG CONTEXT & DOMAIN KNOWLEDGE:\n")
    for (item in resolvedRagItems) {
        if (item instanceof Map && (item.enabled == null || item.enabled == true)) {
            ragBuilder.append("- [${item.category ?: 'GENERAL'}] ${item.title ?: ''}: ${item.snippet ?: ''}\n")
        }
    }
}

// 3. Append Selected Intent Node IDs if present
if (selectedIntents) {
    ragBuilder.append("\n### ATTACHED INTENT WORK EFFORTS:\n")
    for (intentId in selectedIntents) {
        ragBuilder.append("- Intent Reference ID: ${intentId}\n")
    }
}

// 4. Assemble composite proxy payload
Map proxyParams = [
    userPrompt          : effectivePrompt,
    targetComponent     : targetComponent ?: 'nursinghome',
    focusCoordinate     : artifactUri,
    activeRagContext    : (activeRagContext ?: "") + ragBuilder.toString(),
    moquiSessionToken   : ec.web?.sessionToken ?: ""
]
ec.logger.info("In ExecuteStagedAgentTurn, proxyParams: ${proxyParams}")

// 5. Invoke Gemini AI Proxy Service
Map proxyResult = ec.service.sync().name("org.moqui.ide.AgiMcpServices.run#OpenAiProxy").parameters(proxyParams).call()
ec.logger.info("In ExecuteStagedAgentTurn, proxyResult: ${proxyResult}")

if (proxyResult.error || proxyResult.status == "error") {
    context.status = "error"
    context.message = proxyResult.error ?: proxyResult.message ?: "AI Gateway execution error"
    return
}

// 6. Slurp result payload (supporting single artifact or batch files manifest)
def completion = proxyResult.completionText
def parsed = null
if (completion instanceof String) {
    try {
        parsed = new JsonSlurper().parseText(completion)
    } catch (Exception e) {
        parsed = [rawXmlContent: completion]
    }
} else if (completion instanceof Map) {
    parsed = completion
} else {
    parsed = proxyResult
}

List filesGenerated = []

// 7. Handle Batch File Manifest: { "files": [ { "artifactUri": "...", "content": "..." } ] }
if (parsed?.files instanceof List) {
    for (fileItem in parsed.files) {
        String fileUri = fileItem.artifactUri ?: fileItem.location
        String fileContent = fileItem.content ?: fileItem.rawXmlContent
        if (fileUri && fileContent != null) {
            ResourceReference rr = ec.resource.getLocationReference(fileUri)
            rr.putText(fileContent) // 🎯 Changed from writeText to putText
            filesGenerated.add([artifactUri: fileUri, status: "WRITTEN"])
        }
    }
    context.status = "SUCCESS"
    context.message = "Successfully generated ${filesGenerated.size()} artifact files."
    context.createdArtifactUri = artifactUri
} 
// 8. Handle Single Artifact Creation / Mutation
else {
    String finalUri = parsed?.createdArtifactUri ?: proxyResult.createdArtifactUri ?: artifactUri
    String finalXml = parsed?.rawXmlContent ?: proxyResult.rawXmlContent

    if (finalUri && finalXml) {
        ResourceReference rr = ec.resource.getLocationReference(finalUri)
        rr.putText(finalXml) // 🎯 Changed from writeText to putText
        filesGenerated.add([artifactUri: finalUri, status: "WRITTEN"])
    }

    context.createdArtifactUri = finalUri
    context.rawXmlContent = finalXml
    context.status = "SUCCESS"
    context.message = parsed?.message ?: proxyResult.message ?: "Staged turn executed and applied successfully."
}

context.filesGenerated = filesGenerated