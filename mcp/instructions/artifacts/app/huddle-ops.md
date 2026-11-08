================================================================================
FILE: runtime/component/agi-ide/mcp/instructions/artifacts/app/huddle-ops.md
================================================================================
# App Archetype: Shift / Huddle Operations (huddle-ops)
<!-- Instructions for scaffolding and evolving shift-based operational coordination apps -->

## 1. Domain Intent & Operational Dynamics
- **Purpose**: Fast-paced, time-sensitive operational coordination, standup checklists, census adjustments, acuity spikes, and shift turnover.
- **Primary Actor Flow**: Charge nurses, floor supervisors, and shift leads running 10–15 minute daily/shift huddles to inspect unit state, review exceptions, and hand off responsibilities.
- **Execution Style**: Dense summary views, quick-action toggle buttons, real-time status indicators, and minimal nested navigation during active shift turnover.

## 2. Mantle UDM Data Model Invariants
- **Facilities & Locations**: Anchor all room, bed, and unit tracking in `mantle.facility.Facility` and `mantle.facility.FacilityLocation`. Never invent a standalone `Room` or `Bed` table.
- **Parties & Staffing**: Model staff (CNAs, RNs, supervisors) and residents/clients through `mantle.party.Party`, `mantle.party.Person`, and `mantle.party.PartyRole`.
- **Shift Tasks & Checklists**: Model shift assignments, standups, and turnover reviews as `mantle.work.effort.WorkEffort` (types: `WetTask`, `WetEvent`) with `WorkEffortPartyAssignment`.

## 3. Compliance, Privacy & HIPAA Invariants
- **PHI Masking & Encryption**: Any field storing clinical observations, acuity notes, or vital metrics must specify `encrypt="true"`.
- **Shift Turnover Audit**: All shift turnover sign-offs, census overrides, and assignment transfers must have `enable-audit-log="true"` on the underlying entity.

## 4. UI Layout & Screen Archetypes
- **Root Screen**: Dashboard layout hosting quick KPIs (Occupancy %, Acuity Level, Pending Handoffs).
- **Subscreen 1 (`DailyStandupHuddle`)**: Real-Time Huddle archetype. Split-pane or list with quick attendance check, exception callouts, and shift-goal checklist.
- **Subscreen 2 (`ResidentCensus`)**: Status Kanban or Data Grid. Fast bed-to-resident assignment view with quick-edit status flags (admit, transfer, discharge, hospital stay).
- **Subscreen 3 (`ShiftAssignment`)**: Master-Detail or matrix view pairing staff members with assigned wings, rooms, or residents.