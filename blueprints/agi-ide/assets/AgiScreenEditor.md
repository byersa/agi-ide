# SCREEN/COMPONENT: AgiScreenEditor
# SUBTITLE: Pure client-side declarative XML screen editor instance

## 🛡️ CORE METADATA & RULE BOUNDARIES
* **Target Output Files:**
  * Frontend: `runtime/component/agi-ide/screen/agi-ide/assets/AgiScreenEditor.qvt.js`
* **App Identity:** "Moqui IDE"
* **Security & HIPAA Enforcement:**
  * Sensitive Fields: None specified
  * Audit Logging: False

## 📝 DESCRIPTION
A pure client-side editor component tasked with managing raw Moqui XML screen definitions. It facilitates editing via a dedicated text field buffer, coordinates localized content updates with other panels, and dynamically responds to visual selections performed on the accompanying layout canvas.

### Subscreens
None specified.

### Subcomponents
* None specified (Operates alongside sister editors within the main layout workspace).

## 🛰️ INTER-COMPONENT BUS (BROADCASTCHANNEL)
* **Channel Name:** `agi-ide-context-bus`

### Outbound Broadcast Events:
* `peer-communication`: Broadcaster for peer-to-peer status adjustments, cursor focus tracking, and immediate synchronization signals targeting other layout cells.
* `xml-source-mutated`: Fired instantly on textarea input keystroke changes to broadcast the raw layout modifications down the line.
  * **Payload Schema:** `{ rawXmlText: String }`

### Inbound Event Listeners:
* `peer-communication`: Intercepts state configurations and synchronized layout markers broadcast by other active cells.
* `canvas-element-selected`: Listens for interactive widget selections originating from the visual canvas. 
  * **Payload Schema:** `{ componentName: String, screenPath: String, elementId: String, elementType: String }`
  * **Behavior:** Triggers an isolated regex lookup targeting `name="[elementId]"` or `id="[elementId]"`, calculates the row position, programmatically scrolls the text viewport to that exact line index, and triggers a temporary CSS border highlight flash effect.

## 📥 INPUT PARAMETERS & PROPS
* **Moqui Screen Parameters:** None specified.

### Vue Component Props:
* `inputArtifactState` (Object): A reactive state object containing initial path specifications and configuration attributes for the chosen XML artifact file.

## 💾 INSTANCE STATE & DATA VARIABLES
### Reactive UI Keys:
* `artifactState` (Object): The local source code buffer holding the real-time modifications of the active XML file.

## 🔄 LIFECYCLE & ALWAYS-ACTIONS
### Server Side:
* `<always-actions>` / `<pre-actions>`
  * None specified (Runs exclusively as an on-demand JavaScript context asset).

### Client Side:
* Vue `mounted()` / `unmounted()` hooks
  * Establishes the channel bindings for `xml-source-mutated` and `canvas-element-selected`, initializing immediate telemetry listeners and ensuring systematic teardown on removal.

## ⚙️ BEHAVIORS & BACKEND DATA CONTRACTS
### Transitions / API Routes:
* `ReceiveArtifactStatus`: Action path to fetch compilation or processing telemetry for the current XML artifact.
* `SetArtifact`: Action path to re-bind or switch the active target file within this editor window.
* `SetArtifactStatus`: Action path to submit layout metadata updates back to the backend service manager.
* `GetArtifactSavedStatus`: Action path to query if the file context on disk matches the active client memory space.
* `SaveArtifact`: Primary API route called to persist the raw XML editor block text back to the Moqui application tree.
* `AddArtifactFeature`: Action path to programmatically stub new component widgets or tags into the file structure.

### Vue Internal Methods:
* None specified.

## 🎨 VISUAL CONFIGURATION / WIDGETS
### Declarative Layout Tree:
The user interface features a clean, full-height text-editing pane centered around a reactive input window. It is decorated with code line numbers and custom styles to enable localized highlighting flashes when responding to canvas interactions.

## 💾 ENTITY DATA MODELS
* **Extended Mantle UDM Entities:** None specified.

## 🔍 VERIFICATION STEPS (MANUAL TESTING)
1. Verify that typing inside the text field triggers the `xml-source-mutated` event with the full raw string payload.
2. Verify that broadcasting a mock `canvas-element-selected` event containing a valid element ID successfully forces the textarea view to scroll directly to the matching code declaration.