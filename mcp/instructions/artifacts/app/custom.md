================================================================================
FILE: runtime/component/agi-ide/mcp/instructions/artifacts/app/custom.md
================================================================================
# App Archetype: Custom Domain (custom)
<!-- Instructions for unconstrained green-field Moqui component architectures -->

## 1. Domain Intent & Operational Dynamics
- **Purpose**: Bespoke enterprise application architectures that synthesize multiple domain patterns or introduce non-standard workflows.
- **Primary Actor Flow**: Variable depending on specified domain narrative.
- **Execution Style**: Modally consistent master-detail, tabbed navigation, or dashboard setups aligned with user-declared intent.

## 2. Mantle UDM Data Model Invariants
- **Reuse First**: Always inspect Mantle UDM before designing custom entities.
  - Parties & Roles: `mantle.party.*`
  - Products & Inventory: `mantle.product.*`
  - Orders & Invoices: `mantle.order.*` and `mantle.account.invoice.*`
  - Tasks, Projects & Events: `mantle.work.effort.*`
  - Facilities & Assets: `mantle.facility.*` and `mantle.product.asset.*`
- **Extension Convention**: If new attributes are necessary, extend Mantle entities using `<extend-entity>` or create a satellite entity linked via a 1-to-1 foreign key.

## 3. Compliance, Privacy & HIPAA Invariants
- Evaluate domain context: if medical, resident, or financial data is involved, enforce `encrypt="true"` on sensitive fields and `enable-audit-log="true"` on transactional entities.

## 4. UI Layout & Screen Archetypes
- Scaffold a clean root screen (`${componentName}.xml`) mounting a default overview dashboard.
- Scaffold initial subscreens as defined in the elicitation wizard, referencing the standard screen archetypes (Master-Detail, Form-Single, or Data-Grid).