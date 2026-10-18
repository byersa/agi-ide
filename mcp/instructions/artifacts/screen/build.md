### Mandatory Protocol for Screen Build Mode:
- Schema Version: Adhere strictly to `xml-screen-3.xsd`.
- Tag Sequencing: Element order under `<screen>` MUST follow: `<parameter>`, `<transition>`, `<subscreens>`, `<actions>`, `<widgets>`.
- Parameter Tags: `<parameter>` tags MUST be direct children of `<screen>`, placed before `<actions>` and `<widgets>`.
- Forms: Use `<form-single>` for detail/edit views and `<form-list>` with `list="..."` and `skip-form="true"` for tabular data.
- Return the full screen XML in `rawXmlContent` inside the standard Build response envelope.

### Moqui 4.0 / Quasar Runtime Syntax Constraints:
- Root Attributes:
  - Root tag MUST be `<screen xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://moqui.org/xsd/xml-screen-3.xsd" require-authentication="true">`.
  - NEVER declare `standalone="true"` unless an explicit standalone HTML/decorator shell is requested.
  - When subscreens exist, declare `default-subscreen="<FirstSubscreenName>"` on the root `<screen>` tag.
- Subscreens & Navigation:
  - The `<subscreens>` element MUST include `default-item="<FirstSubscreenName>"`.
  - Use `<subscreens-menu id="<screenId>-nav-tabs" type="tab"/>` for tabbed subscreen navigation.
  - Use `<subscreens-active id="<screenId>-body-viewport"/>` to render the selected subscreen.
  - FORBIDDEN: Never emit `<subscreens-tabs>`. It is deprecated and outputs an unrendered placeholder macro.
- Responsive Layout (Quasar Flex):
  - FORBIDDEN: Never emit `<container-row>` or `<container-col>`.
  - Row container: `<container style="row q-col-gutter-md">` (add utility classes like `q-mt-sm` as needed).
  - Column containers: Use explicit Quasar column sizing, e.g. `<container style="col-12 col-md-4">` or `<container style="col-12 col-md-8">`.
- Form Fields & Section Structure:
  - FORBIDDEN: Never emit `<container name="display"/>` inside field definitions.
  - In `<default-field>`, always use valid leaf display or input widgets: `<display/>`, `<display format="..."/>`, `<link text="..." url="..."/>`, `<text-line/>`, or `<drop-down/>`.
  - If a `<section name="...">` is used, all inner elements MUST be wrapped in a direct child `<widgets>` tag.
- Entity Queries & Auth Bypasses:
  - On read-only `<entity-find>` or `<entity-find-one>` operations against core Mantle UDM entities (`mantle.party.Person`, `mantle.party.Party`, `mantle.facility.Facility`, `mantle.work.effort.WorkEffort`), ALWAYS include `authorize-skip="view"`.
  - For HIPAA PHI / sensitive fields (e.g. `birthDate`, medical data), include `encrypt="true"` on the field.