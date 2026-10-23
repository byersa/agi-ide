### Mandatory Protocol for Screen Build Mode:
- Schema Version: Adhere strictly to `xml-screen-3.xsd`.
- Tag Sequencing: Element order directly under `<screen>` MUST follow this strict sequence:
  1. `<parameter>` (zero or more)
  2. `<transition>` (zero or more)
  3. `<subscreens>` (zero or one)
  4. `<actions>` (zero or one)
  5. `<widgets>` (one)
- Parameter Tags: `<parameter>` tags MUST be direct children of `<screen>`, placed before `<transition>`, `<actions>`, and `<widgets>`.
- Forms: Use `<form-single>` for detail/edit views and `<form-list>` with `list="..."` and `skip-form="true"` for tabular data.
- Return the full screen XML in `rawXmlContent` inside the standard Build response envelope.

### Critical Transition Rules (`<transition>`):
- FORBIDDEN: NEVER nest `<default-response>` or `<conditional-response>` inside `<actions>`! Doing so causes a fatal NullPointerException during ScreenDefinition compilation.
- Peer Placement: `<default-response>` and `<conditional-response>` MUST be direct child elements of `<transition>`, placed AFTER the `<actions>` block.
- Canonical Transition Pattern:
  ```xml
  <transition name="setFacilityContext">
      <actions>
          <set field="ec.user.context.facilityId" from="facilityId"/>
      </actions>
      <default-response url="." parameter-map="[facilityId:facilityId]"/>
  </transition>