================================================================================
FILE: runtime/component/agi-ide/mcp/instructions/artifacts/app/facility-asset.md
================================================================================
# App Archetype: Asset & Facility Management (facility-asset)
<!-- Instructions for scaffolding and evolving physical maintenance and equipment apps -->

## 1. Domain Intent & Operational Dynamics
- **Purpose**: Equipment maintenance, physical space inspection, bed/room turnover, work order dispatch, and equipment servicing schedules.
- **Primary Actor Flow**: Maintenance supervisors, facilities personnel, and environmental services (EVS) staff logging repair tickets, executing room sanitization, and certifying mechanical equipment.
- **Execution Style**: State-driven lists, ticket dispatch kanbans, location drilldowns, and status checklists.

## 2. Mantle UDM Data Model Invariants
- **Facilities & Spaces**: Use `mantle.facility.Facility` for buildings and floors; use `mantle.facility.FacilityLocation` for specific rooms, bays, and mechanical closets.
- **Assets & Equipment**: Model durable machinery, medical devices, and beds using `mantle.product.asset.Asset`.
- **Work Orders & Maintenance Tasks**: Model preventative maintenance schedules and active repair orders using `mantle.work.effort.WorkEffort` (`workEffortTypeEnumId="WetMaintenance"`). Tie assets to work orders via `WorkEffortAssetProduced` or `WorkEffortAssetAssign`.

## 3. Compliance, Privacy & HIPAA Invariants
- **Operational Auditing**: Regulatory inspections, bio-hazard sanitization certificates, and equipment maintenance sign-offs require `enable-audit-log="true"`.
- **Role Verification**: High-voltage or medical device repairs require qualified technician role verification.

## 4. UI Layout & Screen Archetypes
- **Root Screen**: Facility floorplan or summary status grid highlighting open repair tickets and room availability.
- **Subscreen 1 (`FacilityFloorplan`)**: Visual or grouped hierarchy of buildings -> floors -> rooms with real-time status badges (Clean, Occupied, Maintenance Required).
- **Subscreen 2 (`RoomTurnover`)**: Checklist / wizard archetype walking staff through terminal room sanitization and readiness verification.
- **Subscreen 3 (`MaintenanceWorkOrders`)**: Status Kanban or Sortable Data Grid showing triage stages: New -> Assigned -> In Progress -> Certified Complete.