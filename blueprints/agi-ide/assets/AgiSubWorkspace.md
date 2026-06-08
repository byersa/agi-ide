# SCREEN/COMPONENT: AgiSubWorkspace
# SUBTITLE: Layout cell and peer mediator for the active workspace

## 🛡️ CORE METADATA & RULE BOUNDARIES
* **Target Output Files:**
  * Frontend: `runtime/component/agi-ide/screen/agi-ide/assets/IdeWorkspaceComponent.qvt.js`
* **App Identity:** "Moqui IDE"
* **Security & HIPAA Enforcement:**
  * Sensitive Fields: None specified
  * Audit Logging: False

## 📝 DESCRIPTION
SubWorkspace components house the individual code, template, and visual editors that perform the core development tasks. They are responsible for managing the local layout state of the active workspace cell and coordinating peer-to-peer state synchronization directly with other workspace cell instances.

### Subscreens
None specified.

### Subcomponents
* AgiCanvasEditor
* AgiComponentEditor
* AgiScreenEditor

## 🛰️ INTER-COMPONENT BUS (BROADCASTCHANNEL)
* **Channel Name:** `agi-ide-context-bus`

### Outbound Broadcast Events:
* `peer-communication`: Broadcaster used to propagate local panel focus, execution context updates, and synchronization signals directly to other concurrent AgiSubWorkspace instances.

### Inbound Event Listeners:
* `peer-communication`: Global listener that intercepts incoming telemetry and status hooks from sibling panels to seamlessly align layout or metadata states on the client.

## 📥 INPUT PARAMETERS & PROPS
* **Moqui Screen Parameters:** None specified.

### Vue Component Props:
* `inputArtifactState` (Object): A reactive state object encapsulating the configuration parameters, path identity, and structural properties required to fully initialize and control the targeted artifact.

## 💾 INSTANCE STATE & DATA VARIABLES
### Reactive UI Keys:
* `artifactState` (Object): The localized, isolated state buffer representing the active artifact currently being modified inside this cell's child editors.

## 🔄 LIFECYCLE & ALWAYS-ACTIONS
### Server Side:
* `<always-actions>` / `<pre-actions>`
  * None specified (Lifecycle and rendering loops run entirely on the client).

### Client Side:
* Vue `mounted()` / `unmounted()` hooks
  * Initializes communication listeners on the `agi-ide-context-bus` channel and registers local teardown hooks to properly dispose of peer event subscriptions when the sub-workspace cell is deactivated or unmounted.

## ⚙️ BEHAVIORS & BACKEND DATA CONTRACTS
### Transitions / API Routes:
* `ReceiveArtifactStatus`: Endpoint used to fetch the real-time execution or processing status of the assigned artifact.
* `SetArtifact`: Endpoint target to assign or bind a new file/entity node into the active workspace focus window.
* `SetArtifactStatus`: Endpoint route to push manual status updates or tag modifications back to the server registry.
* `GetArtifactSavedStatus`: Endpoint used to check whether the server-side filesystem state matches the active client memory buffer.
* `SaveArtifact`: Core persistence API called to write modified artifact contents back to the Moqui component directories.
* `AddArtifactFeature`: Specialized API to dynamically inject a new structural feature pattern or stub implementation into the active data layer.

### Vue Internal Methods:
* None specified.

## 🎨 VISUAL CONFIGURATION / WIDGETS
### Declarative Layout Tree:
The visual architecture of an AgiSubWorkspace cell is dynamically determined by assembling its three core subcomponent editors (AgiScreenEditor, AgiComponentEditor, and AgiCanvasEditor) into an interactive workspace viewport split-pane.

## 💾 ENTITY DATA MODELS
* **Extended Mantle UDM Entities:** None specified.

## 🔍 VERIFICATION STEPS (MANUAL TESTING)
1. Verify that mounting an instance of `IdeWorkspaceComponent.qvt.js` successfully triggers independent tracking of its `artifactState` without bleeding properties into adjacent workspace cells.
2. Verify that changes to the editor states invoke local state updates and successfully talk across the `peer-communication` event listeners.