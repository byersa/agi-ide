# SCREEN/COMPONENT: AgiEditorPalette
# SUBTITLE: Polymorphic Agentic AI Control Pad & Widget Macro Deck

## 🛡️ CORE METADATA & RULE BOUNDARIES
* **Target Output Files:**
  * Frontend: `runtime/component/agi-ide/screen/agi-ide/assets/AgiEditorPalette.qvt.js`
* **App Identity:** "Moqui IDE"
* **Security & HIPAA Enforcement:**
  * Sensitive Fields: None specified
  * Audit Logging: False

## 📝 DESCRIPTION
This component serves as the central agentic interface and primary AI input/output console for Moqui IDE. It docks seamlessly alongside or within the active workspace editors, dynamically mutating its layout options, pre-defined prompt sets, and macro templates based on whether a developer is working in a raw XML screen context, a JavaScript controller layer, or a visual layout engine canvas.

### Subscreens
None specified.

### Subcomponents
* None specified.

## 🛰️ INTER-COMPONENT BUS (BROADCASTCHANNEL)
* **Channel Name:** `agi-ide-context-bus`

### Outbound Broadcast Events:
* `xml-source-mutated`: Fired when an AI prompt generation successfully resolves or when a user drags a visual primitive layout card, sending the clean structural update over the thread.
  * **Payload Schema:** `{ rawXmlText: String }`
* `execute-agent-intent`: Fired to dispatch raw developer prompt inputs and operational context to the background agent processing pool.

### Inbound Event Listeners:
* `peer-communication`: Monitors layout state shifts to keep the local active editor tracking profile accurate.
* `agent-response-stream`: Catches real-time streaming tokens or incremental structured code revisions coming back from the active AI agent.

## 📥 INPUT PARAMETERS & PROPS
* **Moqui Screen Parameters:** None specified.

### Vue Component Props:
* `editorMode` (String): Dictates the behavior layout mode. Options: `'screen'` (XML engineering rules), `'component'` (JavaScript/Vue rules), or `'canvas'` (Visual layout mapping rules).
* `activeArtifactContext` (Object): Holds metadata regarding the target file paths, schemas, and structural boundaries currently under modification.

## 💾 INSTANCE STATE & DATA VARIABLES
### Reactive UI Keys:
* `rawPromptInput` (String): Captures the live text written by the developer to guide the AI agent.
* `agentStreamingBuffer` (String): Accumulates incoming real-time textual output or reasoning paths pushed from the agent pool.
* `selectedCategory` (String): Tracks the active sidebar drawer section (e.g., 'Prompts', 'Macros', 'Primitives').

## 🔄 LIFECYCLE & ALWAYS-ACTIONS
### Server Side:
* `<always-actions>` / `<pre-actions>`
  * None specified.

### Client Side:
* Vue `mounted()` / `unmounted()` hooks
  * Establishes direct event bindings to intercept streaming agent responses and teardown listeners smoothly when layout views transition.

## ⚙️ BEHAVIORS & BACKEND DATA CONTRACTS
### Transitions / API Routes:
* `/rest/s1/agi-ide/executePromptIntent`: POST endpoint used to transmit the developer's prompt text combined with the exact file context buffer directly to the LLM agent orchestrator.
* `/rest/s1/agi-ide/fetchContextualMacros`: GET endpoint used to pull down targeted, pre-defined recipe prompts or boilerplate widget structures based on the current `editorMode`.

### Vue Internal Methods:
* `submitPrompt()`: Packs the `rawPromptInput` and current schema states into a payload, clears the input area, and kicks off the background agent execution thread.
* `handlePrimitiveDragStart(item)`: Configures the browser drag-data payload when a visual layout primitive element card is pulled out while operating in canvas mode.

## 🎨 VISUAL CONFIGURATION / WIDGETS
### Declarative Layout Tree:
The user interface is styled as an adaptive, elegant tool sidebar layout panel featuring:
1. **Top Section (The AI Device):** A high-walled, reactive text input area optimized for engineering prompts, accompanied by a dynamic console output feed that displays streaming agent tokens or validation outputs.
2. **Middle Section (Contextual Toolbar):** A changing button strip that surfaces quick-action recipe buttons (e.g., *Form Generator*, *Service Binding*, *Event Wire-up*) matching the active editing layer.
3. **Bottom Section (The Layout Deck):** Only active when `editorMode == 'canvas'`. Displays a clean grid of drag-and-drop layout cards (Containers, Grids, Form rows) for immediate spatial construction on the canvas.

## 💾 ENTITY DATA MODELS
* **Extended Mantle UDM Entities:** None specified.

## 🔍 VERIFICATION STEPS (MANUAL TESTING)
1. Verify that switching the `editorMode` property dynamically alters the rendered button toolsets and toggle regions instantly without throwing console template bugs.
2. Verify that typing an engineering intent statement and executing `submitPrompt()` successfully routes a structured request to the `/executePromptIntent` REST endpoint.