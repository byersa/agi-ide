### Mandatory Protocol for Screen Plan Mode:
1. Upstream Contract Adherence: If the prompt contains an "Upstream Context Contract" detailing approved modules, entities, or architectural summaries, your plan MUST strictly adopt those modules and entities. Do NOT substitute generic default names (e.g. ERP, StaffMeetings) when specific upstream modules (e.g. standupAndHuddles, residentCare) were approved.
2. Entity Schema Verification: You MUST verify all entities proposed in 'suggestedEntities' and 'entityFieldBindings' against actual Mantle UDM and Moqui entity definitions[cite: 16]. Never hallucinate, invent, or truncate entity names (e.g., use `mantle.work.effort.WorkEffortPartyAssignment`, NEVER `WorkEffortPartyPrp`). If an entity's existence is uncertain, verify it via discovery/schema inspection before finalizing the plan.
3. Archetype Discovery: You MUST examine available canonical archetypes using discovery tools before formulating a plan[cite: 16].
4. Verified Bindings: 'recommendedArchetype' and 'recommendedArchetypeUri' MUST match an exact archetype name and URI discovered on disk (e.g., master-detail, lookup-modal, etc.)[cite: 16]. Do not invent archetype names[cite: 16].
5. Output Contract: Return your final response as a single, valid JSON completion object matching this exact schema[cite: 16]:

{
  "status": "PLANNED",
  "cleanArtifactUri": "component://${targetComponent}/screen/${targetComponent}/[CleanSubdirectory]/[ScreenName].xml",
  "recommendedArchetype": "[exact archetype name from discovery]",
  "recommendedArchetypeUri": "[exact mcp:// uri from discovery]",
  "suggestedEntities": [
    "mantle.party.Party",
    "mantle.party.Person"
  ],
  "screenContract": {
    "requiredParameters": ["partyId"],
    "optionalParameters": [],
    "requiredPermissions": ["PATIENT_VIEW"],
    "transitions": [
      { "name": "updatePatient", "service": "mantle.party.PartyServices.update#Person" }
    ]
  },
  "entityFieldBindings": [
    {
      "entity": "mantle.party.Person",
      "fields": ["partyId", "firstName", "lastName", "birthDate"],
      "targetWidget": "ResidentSummaryCard"
    }
  ],
  "securityAndHipaaRules": [
    "PHI display masking must be configured on sensitive fields",
    "Clinical operations must run under audit-logged entities"
  ],
  "architectureSummary": "Detailed architectural rationale, UDM extensions, and layout rules...",
  "formulationSteps": [
    "1. Declare screen parameters directly under <screen> adhering to xml-screen-3.xsd sequencing...",
    "2. Prepare screen <actions> querying Person and related clinical records...",
    "3. Structure master summary card widget...",
    "4. Add detail sublists for active clinical entries..."
  ]
}
Ensure 'cleanArtifactUri' contains NO repeated 'screen/screen' path segments[cite: 16].