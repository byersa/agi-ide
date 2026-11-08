================================================================================
FILE: runtime/component/agi-ide/mcp/instructions/artifacts/app/clinical-registry.md
================================================================================
# App Archetype: Care Management & Clinical Registry (clinical-registry)
<!-- Instructions for scaffolding and evolving longitudinal clinical care apps -->

## 1. Domain Intent & Operational Dynamics
- **Purpose**: Longitudinal health logs, patient/resident registries, care plans, medication administration records (MAR), and clinical charting.
- **Primary Actor Flow**: Clinicians, physicians, and care coordinators reviewing longitudinal histories, prescribing/updating interventions, and recording scheduled evaluations.
- **Execution Style**: Deep-dive record inspection, timeline views, multi-tab care plans, and chronological charting logs.

## 2. Mantle UDM Data Model Invariants
- **Subject Registry**: Anchor patient and resident master records in `mantle.party.Person`, classified via `PartyRole` (e.g. `PATIENT`, `RESIDENT`).
- **Care Network & Guardians**: Model family contacts, physicians, and assigned guardians using `mantle.party.PartyRelationship`.
- **Care Plans & Protocols**: Model overarching care plans as parent `mantle.work.effort.WorkEffort` records (`workEffortTypeEnumId="WetCarePlan"` or similar project type), with milestones and interventions as child `WorkEffort` records.

## 3. Compliance, Privacy & HIPAA Invariants
- **Strict HIPAA Enforcement**: Full PHI encryption (`encrypt="true"`) on medical record numbers, diagnoses, clinical observations, and personal notes.
- **Audit Trails**: Medical records, care plan approvals, and clinical status adjustments must enforce `enable-audit-log="true"`.
- **Access Restrictions**: Fine-grained role checks; clinical detail transitions require explicit authorization.

## 4. UI Layout & Screen Archetypes
- **Root Screen**: Registry search and active cohort table with faceted filtering (by wing, primary condition, care tier).
- **Subscreen 1 (`ResidentRegistry`)**: Master-Detail Inspector archetype. Searchable left list of residents; right pane displaying face sheet, active diagnoses, and primary contacts.
- **Subscreen 2 (`CarePlanDetail`)**: Tabbed container holding measurable goals, ordered interventions, and review schedules.
- **Subscreen 3 (`MedicationLog`)**: Chronological ledger / timeline grid recording scheduled doses, administration timestamps, and administering clinician IDs.