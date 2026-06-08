# SCREEN/COMPONENT: AgiInstructions
# SUBTITLE: Context-sensitive agentic tutoring and documentation dashboard

## 🛡️ CORE METADATA & RULE BOUNDARIES
* **Target Output Files:**
  * Backend: `runtime/component/agi-ide/screen/agi-ide/AgiInstructions.xml`
  * Frontend: None (Handled natively via declarative Moqui XML layouts)
* **App Identity:** "Moqui IDE"
* **Security & HIPAA Enforcement:**
  * `require-authentication`: "true"
  * Sensitive Fields: None specified
  * Audit Logging: False

## 📝 DESCRIPTION
This screen serves as both a tutoring page and a context-sensitive help system for the agi-ide app. It functions as an agentic documentation viewer that watches the workspace telemetry to dynamically load Moqui framework references, architectural patterns, or API templates tailored precisely to the user's active task.

### Subscreens
None specified.

### Subcomponents
* None specified (Leverages an inline floating tool palette configuration).

## 🛰️ INTER-COMPONENT BUS (BROADCASTCHANNEL)
* **Channel Name:** `agi-ide-context-bus`

### Outbound Broadcast Events:
* None specified.

### Inbound Event Listeners:
* `context-change`: Listens for focus updates across the IDE space. 
  * **Behavior:** Extracts the active `artifactId` or `subArtifactId` and uses that identity to instantly refresh the displayed documentation manuals, tutorials, or XSD rule breakdowns without requiring manual user search inputs.

## 📥 INPUT PARAMETERS & PROPS
* **Moqui Screen Parameters:** None specified.
* **Vue Component Props:** None specified.

## 💾 INSTANCE STATE & DATA VARIABLES
* **Server Side Actions:**
  * Evaluates the contextual incoming requests from the bus to locate corresponding documentation markdown blocks inside the component's help registry database.

## 🔄 LIFECYCLE & ALWAYS-ACTIONS
### Server Side (`<actions>` / `<pre-actions>`):
* Pre-loads a default master introduction index page containing core Moqui IDE setup rules and tutorial tracks if no active context is broadcast over the communication bus.

### Client Side:
* None specified.

## ⚙️ BEHAVIORS & BACKEND DATA CONTRACTS
### Transitions / API Routes:
* `/rest/s1/agi-ide/fetchContextHelpData`: GET endpoint called to retrieve localized reference documentation and best-practice structural examples matching the targeted layout element or code focus block.

### Vue Internal Methods:
* None specified.

## 🎨 VISUAL CONFIGURATION / WIDGETS
### Declarative Layout Tree (Moqui XML Structure):
A dual-pane educational viewport layout structure:
1. **Left Navigation Panel:** A structured tree navigation block allowing manual index browsing of the framework's core developer guides, asset creation conventions, and component layout constraints.
2. **Right Content Reading Arena:** A clean container utilizing a standard `<render-mode>` block to interpret and display the compiled, rich documentation text files.
3. **Floating Context Palette Container:** A responsive, context-aware layout ornament that floats dynamically over the reading view, surfacing quick-copy boilerplate text macros or template tags directly related to the active topic.

## 💾 ENTITY DATA MODELS
* **Extended Mantle UDM Entities:** None specified.

## 🔍 VERIFICATION STEPS (MANUAL TESTING)
1. Verify that loading the instructions page displays the baseline tutorial guide structure by default.
2. Verify that dispatching a simulated `context-change` configuration event containing an active file type forces the view to cleanly refresh and display the targeted technical documentation segment instantly.