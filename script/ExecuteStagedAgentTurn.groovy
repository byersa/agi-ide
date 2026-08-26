import groovy.json.JsonSlurper
import groovy.json.JsonOutput

// =============================================================================
// Helper: Recursive In-Place AST Node Mutation
// =============================================================================
def mutateNodeInTree(Map root, String targetName, Map newAttributes) {
    if (!root) return false

    // Check if current node matches target name or mariaId
    if (root.attributes?.name == targetName || root.name == targetName || root.mariaId?.endsWith(targetName)) {
        if (!root.attributes) root.attributes = [:]
        root.attributes.putAll(newAttributes)
        return true
    }

    // Recurse into children / widgets
    List children = root.children ?: root.widgets
    if (children instanceof List) {
        for (def child : children) {
            if (child instanceof Map) {
                boolean updated = mutateNodeInTree(child, targetName, newAttributes)
                if (updated) return true
            }
        }
    }
    return false
}

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

// 4. Assemble composite proxy payload (Preserve focused target coordinate!)
Map proxyParams = [
    userPrompt          : effectivePrompt,
    targetComponent     : targetComponent ?: 'nursinghome',
    focusCoordinate     : focusCoordinate ?: artifactUri,
    focusCoordinateArray: focusCoordinateArray ?: [],
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
            ec.service.sync().name("org.moqui.ide.AgiIdeServices.store#WorkspaceBuffer").parameters([
                artifactUri     : fileUri,
                rawXmlContent   : fileContent,
                userId          : ec.user?.userId ?: 'ANONYMOUS'
            ]).call()
            filesGenerated.add([artifactUri: fileUri, status: "BUFFERED_DRAFT"])
        }
    }
    context.status = "SUCCESS"
    context.isDraft = true
    context.message = "Successfully staged ${filesGenerated.size()} artifact files in buffer."
    context.createdArtifactUri = artifactUri
} 
// 8. Handle Single Artifact Creation / Mutation
else {
    String finalUri = parsed?.createdArtifactUri ?: proxyResult.createdArtifactUri ?: artifactUri
    String finalXml = parsed?.rawXmlContent ?: proxyResult.rawXmlContent
    def finalAstTree = parsed?.astTree ?: null

    // If the completion returned an updated AST tree instead of raw XML, apply targeted mutation if present
    if (!finalXml && finalAstTree instanceof Map) {
        String targetElemName = focusCoordinate ? focusCoordinate.split('#').last() : null
        if (targetElemName && parsed.nodeMutation instanceof Map) {
            mutateNodeInTree(finalAstTree as Map, targetElemName, parsed.nodeMutation as Map)
        }
    }

    String bufferJson = finalAstTree ? (finalAstTree instanceof String ? finalAstTree : JsonOutput.toJson(finalAstTree)) : null

    // Write directly to WorkspaceBuffer (Database / Memory Draft) rather than physical disk
    if (finalUri && (finalXml || bufferJson)) {
        ec.service.sync().name("org.moqui.ide.AgiIdeServices.store#WorkspaceBuffer").parameters([
            artifactUri     : finalUri,
            metaJsonBuffer  : bufferJson,
            rawXmlContent   : finalXml,
            userId          : ec.user?.userId ?: 'ANONYMOUS'
        ]).call()
        filesGenerated.add([artifactUri: finalUri, status: "BUFFERED_DRAFT"])
    }

    context.createdArtifactUri = finalUri
    context.rawXmlContent      = finalXml
    context.mutatedTree        = finalAstTree
    context.isDraft            = true
    context.status             = "SUCCESS"
    context.message            = parsed?.message ?: proxyResult.message ?: "Staged turn applied to workspace buffer (Unsaved Draft)."
}

context.filesGenerated = filesGenerated