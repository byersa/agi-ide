# SCREEN/COMPONENT: AgiComponentEditor
# SUBTITLE: Pure client-side component code editor instance

## 🛡️ CORE METADATA & RULE BOUNDARIES
* **Target Output Files:**
  * Frontend: `runtime/component/agi-ide/screen/agi-ide/assets/AgiComponentEditor.qvt.js`
* **App Identity:** "Moqui IDE"
* **Security & HIPAA Enforcement:**
  * Sensitive Fields: None specified
  * Audit Logging: False

## 📝 DESCRIPTION
A pure client-side editor component dedicated to modifying raw JavaScript template definitions and custom Vue properties. It operates symmetrically alongside the XML screen editor within the workspace cell, managing the client-side controller logic of your application components.

### Subscreens
None specified.

### Subcomponents
* None specified.

## 🛰️ INTER-COMPONENT BUS (BROADCASTCHANNEL)
* **Channel Name:** `agi-ide-context-bus`

### Outbound Broadcast Events:
* `peer-communication`: Broadcaster for peer-to-peer execution states, focus tracking, and cell validation updates.
* `xml-source-mutated`: Fired on textarea input keystroke changes when modifying embedded template definitions to announce raw source adjustments.
  * **Payload Schema:** `{ rawXmlText: String }`

### Inbound Event Listeners:
* `peer-communication`: Intercepts environment configurations and sync states broadcast by sibling blocks.
* `canvas-element-selected`: Listens for interactive widget selections originating from the visual canvas.
  * **Payload Schema:** `{ componentName: String, screenPath: String, elementId: String, elementType: String }`
  * **Behavior:** Triggers a regex search matching the component's internal property bindings or tag references, shifts the focus, scrolls the text area viewport to the correct line index, and applies a temporary CSS border highlight flash effect.

## 📥 INPUT PARAMETERS & PROPS
* **Moqui Screen Parameters:** None specified.

### Vue Component Props:
* `inputArtifactState` (Object): A reactive state object providing the path identifiers and script context details for the targeted JavaScript/Vue asset file.

## 💾 INSTANCE STATE & DATA VARIABLES
### Reactive UI Keys:
* `artifactState` (Object): The local code state buffer holding the active working text of the component script.

## 🔄 LIFECYCLE & ALWAYS-ACTIONS
### Server Side:
* `<always-actions>` / `<pre-actions>`
  * None specified.

### Client Side:
* Vue `mounted()` / `unmounted()` hooks
  * Hooks up message listeners for template mutations and cross-talk selections, ensuring absolute cleanup when the layout cell is destroyed.

## ⚙️ BEHAVIORS & BACKEND DATA CONTRACTS
### Transitions / API Routes:
* `ReceiveArtifactStatus`: Action path to verify syntax correctness or compilation state of the active component code.
* `SetArtifact`: Action path to bind a different script file into the current editor canvas.
* `SetArtifactStatus`: Action path to update component tracking configurations on the backend repository service.
* `GetArtifactSavedStatus`: Action path to query if the file context on disk matches the active client memory space.
* `SaveArtifact`: Primary API route called to save the raw code text back to the server directory tree.
* `AddArtifactFeature`: Action path to programmatically inject property stubs, methods, or lifecycle hooks into the text tree.

### Vue Internal Methods:
* None specified.

## 🎨 VISUAL CONFIGURATION / WIDGETS
### Declarative Layout Tree:
The user interface features a clean, full-height script-editing layout context with line numbers, syntax alignment styling, and short CSS animation triggers to handle flash highlights when synchronized with visual canvas operations.

## 💾 ENTITY DATA MODELS
* **Extended Mantle UDM Entities:** None specified.

## 🔍 VERIFICATION STEPS (MANUAL TESTING)
1. Verify that modifying text in the code buffer fires the standard `xml-source-mutated` tracking payload safely over the bus.
2. Verify that receiving a simulated `canvas-element-selected` tracking event highlights and navigates to the targeted block index seamlessly without refreshing the view.