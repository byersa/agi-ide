import org.moqui.impl.entity.EntityDefinition

contextItems = []
String cleanPrompt = (prompt ?: "").toLowerCase()

// 1. Compliance Rule Detection
if (cleanPrompt.contains('patient') || cleanPrompt.contains('health') || cleanPrompt.contains('medical') || cleanPrompt.contains('ssn')) {
    contextItems.add([
        category: 'HIPAA COMPLIANCE',
        title: 'PHI Data Encryption & Audit Logging',
        type: 'rule',
        snippet: 'Any field storing PHI MUST declare encrypt="true". Sensitive domain entities MUST declare enable-audit-log="true".',
        enabled: true
    ])
}

// 2. Tokenize prompt into search terms
Set<String> promptTokens = cleanPrompt.replaceAll(/[^a-zA-Z0-9\s]/, ' ')
    .split(/\s+/)
    .findAll { it.length() > 2 } as Set<String>

// Safe entity name retrieval without casting issues
List allEntityNames = new ArrayList(ec.entity.getAllEntityNames())

String targetComp = targetComponent ?: 'nursinghome'
List candidateEntities = allEntityNames.findAll { name ->
    String sName = name.toString()
    sName.startsWith("mantle.") || (targetComp && sName.startsWith(targetComp + "."))
}

Set<String> matchedEntities = new LinkedHashSet<>()

for (Object entObj in candidateEntities) {
    String entityName = entObj.toString()
    String shortName = entityName.substring(entityName.lastIndexOf('.') + 1).toLowerCase()
    String pkgName = entityName.toLowerCase()

    for (String token in promptTokens) {
        if (shortName.contains(token) || token.contains(shortName) || pkgName.contains(token)) {
            matchedEntities.add(entityName)
            break
        }
    }
}

// Default Party anchor
if (candidateEntities.contains("mantle.party.Party")) {
    matchedEntities.add("mantle.party.Party")
}

// Build dynamic RAG tiles (limit to top 10)
for (String entityName in matchedEntities.take(10)) {
    try {
        EntityDefinition ed = ec.entity.getEntityDefinition(entityName)
        if (ed != null) {
            String pks = ed.getPkFieldNames().join(', ')
            String nonPkFields = ed.getFieldNames().findAll { !ed.isPkField(it) }.take(8).join(', ')
            String rels = ed.getRelationshipNames().take(4).join(', ')

            contextItems.add([
                category: 'UDM ENTITY',
                title: entityName,
                type: 'entity',
                entityName: entityName,
                snippet: "PK: [${pks}] | Fields: ${nonPkFields}... | Rels: [${rels}]",
                enabled: true
            ])
        }
    } catch (Exception e) {
        // Skip unresolvable entity names
    }
}

// 3. Declarative Screen Standards
contextItems.add([
    category: 'MOQUI MACRO',
    title: 'Moqui Declarative Screen Standards (xml-screen-3.xsd)',
    type: 'convention',
    snippet: 'Use declarative forms (<form-single>, <form-list>) and subscreens navigation (<subscreens-tabs>, <subscreens-active>). Avoid custom Vue script implementations where declarative XML suffices.',
    enabled: true
])

context.contextItems = contextItems