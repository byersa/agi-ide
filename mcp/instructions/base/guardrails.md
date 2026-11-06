# Critical Architectural Guardrails

## 1. Compliance & Security (HIPAA Enforcement)
- Any field storing Personally Identifiable Information (PII) or protected health data MUST declare `encrypt="true"`.
- Any sensitive medical, patient, or administrative entity MUST declare `enable-audit-log="true"`.
- Screens displaying sensitive data must declare `require-authentication="true"` and enforce view authorization.

## 2. UI Theme & Contrast Standards
- Quasar Utility Inversion: Never place light text (`text-white`, `text-slate-200`) inside elements lacking explicit dark backgrounds (`bg-slate-900`, `bg-black`, `bg-slate-950`).
- Menu & Dialog Portals: All dropdowns and popups appended to `body` must declare `menu-content-class="bg-slate-900 text-slate-100 shadow-8 border-slate-700"`.
- Active Buttons: Active/selected button presets must enforce pure black text on amber (`bg-amber-500 text-black text-weight-bolder`).

## 3. Tool Discovery & Verification
- Verify Entities Before Generating Code: If uncertain of an entity field name or relationship, call `find#Entities` before finalizing screen or service XML.
- Relative Paths: Use canonical `component://[component]/...` URIs for all file targets.

### Dynamic Text & Widget Bindings
- **DO NOT** embed Groovy/EL expressions like `${activeFacility?.facilityName}` directly inside `<label text="..."/>` attributes. In the Vue 3 / Quasar client renderer, `<label text="..."/>` is rendered as literal text.
- For dynamic text in navigation headers or screens:
  - Prepare the resolved string in the `<actions>` block first:
    `<set field="facilityDisplay" from="'Facility: ' + (activeFacility?.facilityName ?: 'Default')"/>`
  - Or use `<display text="..."/>` within form or field contexts.
  - Or use plain literal text in `<label text="..."/>` and delegate dynamic entity data to child subscreens, forms, or display widgets.