================================================================================
FILE: runtime/component/agi-ide/mcp/instructions/artifacts/app/service-case.md
================================================================================
# App Archetype: Service & Case Intake (service-case)
<!-- Instructions for scaffolding and evolving inbound service and complaint workflows -->

## 1. Domain Intent & Operational Dynamics
- **Purpose**: Inbound issue intake, family complaints, ombudsman grievances, service inquiries, and resolution handoffs.
- **Primary Actor Flow**: Intake coordinators, case managers, and administrators triaging inbound submissions, gathering documentation, coordinating investigations, and communicating resolutions.
- **Execution Style**: Multi-step intake wizards, priority-sorted queues, resolution timelines, and correspondence logs.

## 2. Mantle UDM Data Model Invariants
- **Case / Ticket Records**: Model inbound grievances and service cases as `mantle.request.Request` (`requestTypeEnumId="RqtSupport"` or `"RqtGrievance"`).
- **Case Inquirer & Subject**: Link the person filing the case and the subject of the case to the `Request` using `mantle.request.RequestParty`.
- **Action Plans & Investigation**: Model resolution steps and investigative interviews as child `mantle.work.effort.WorkEffort` tasks linked to the parent `Request`.

## 3. Compliance, Privacy & HIPAA Invariants
- **Confidentiality Rules**: Grievance notes and investigative interviews must allow restricted visibility flags (`confidential="true"`).
- **Resolution Immutability**: Closed grievance findings must enforce immutable timestamps and manager sign-off audits (`enable-audit-log="true"`).

## 4. UI Layout & Screen Archetypes
- **Root Screen**: Triage queue highlighting unresolved tickets grouped by urgency (Urgent, High, Normal) and SLA timer.
- **Subscreen 1 (`IncidentIntakeWizard`)**: Multi-step wizard archetype: Reporter Info -> Incident Details -> Initial Severity Assessment -> Review & Submit.
- **Subscreen 2 (`ActiveCaseQueue`)**: Filterable data table with SLA countdown chips, assigned investigator avatar, and quick-status change actions.
- **Subscreen 3 (`ResolutionReport`)**: Read-only print/export view containing the full incident chronology, statements, corrective actions taken, and final outcome.