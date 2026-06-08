# SCREEN/COMPONENT: AgiCanvasEditor
# SUBTITLE: Visual design canvas and layout execution engine

## 🛡️ CORE METADATA & RULE BOUNDARIES
* **Target Output Files:**
  * Frontend: `runtime/component/agi-ide/screen/agi-ide/assets/MoquiCanvasEditor.qvt.js`
* **App Identity:** "Moqui IDE"
* **Security & HIPAA Enforcement:**
  * Sensitive Fields: None specified
  * Audit Logging: False

## 📝 DESCRIPTION
This Vue component displays the rendered user interface canvas and acts as the interactive visual editor engine. It tracks graphic layouts, captures item selection coordinates, and natively embeds or coordinates with the `AgiEditorPalette` to process physical drag-and-drop operations and agentic layout prompt scripts.

### Subscreens
None specified.

### Subcomponents
* `AgiEditorPalette` (Embedded or docked side console acting as the primary AI device and widget deck).

## 🛰️ INTER-COMPONENT BUS (BROADCASTCHANNEL)
* **Channel Name:** `agi-ide-context-bus`

### Outbound Broadcast Events:
* `canvas-element-selected`: Fired instantly when a developer clicks any interactive element box or layout region on the canvas screen.
  * **Payload Schema:** `{ componentName: String, screenPath: String, elementId: String, elementType: String }`
  * **Intent:** Signals the code editors to immediately scroll to and highlight the matching backend source line.

### Inbound Event Listeners:
* `xml-source-mutated`: Receives incoming raw XML strings from either a manual text editor save or an agentic prompt completion. 
  * **Behavior:** Automatically triggers a 750ms debounced POST request to compile and refresh the active layout display.

## 📥 INPUT PARAMETERS & PROPS
### Vue Component Props:
* `inputArtifactState` (Object): The reactive source state configuration for the active layout file.
* `editorMode` (String): Options: `'screen'` (default, parses standard Moqui XML views) or `'component'` (handles raw Vue/Quasar templates).

## 💾 INSTANCE STATE & DATA VARIABLES
### Reactive UI Keys:
* `canvasWidgetsTree` (Array): Structured element node array representing the compiled, visual UI widgets currently drawn on the screen.
* `activeSelectedElementId` (String): Tracks the current focused or clicked boundary item on the graphic canvas.

## 🔄 LIFECYCLE & ALWAYS-ACTIONS
### Client Side:
* Vue `mounted()` / `unmounted()` hooks
  * Binds the canvas to intercept incoming `xml-source-mutated` broadcast streams to handle seamless visual hot-reloading.

## ⚙️ BEHAVIORS & BACKEND DATA CONTRACTS
### Transitions / API Routes:
* `/rest/s1/agi-ide/compileRawXmlToBlueprint`: POST endpoint that transmits raw XML code strings and receives back a clean, structured JSON rendering tree to draw on the canvas.

### Vue Internal Methods & Palette Interactions:
* `handlePaletteDrop(event)`: Intercepts a native HTML drag-and-drop action originating from the `AgiEditorPalette` layout primitive cards. Extracts the dropped widget type, inserts the new XML tag stub at the drop coordinates, and immediately broadcasts `xml-source-mutated` to update the sister code editors.
* `selectVisualElement(elementId)`: Handles canvas mouse clicks, updates `activeSelectedElementId`, and dispatches the outbound `canvas-element-selected` event over the context bus.

## 🎨 VISUAL CONFIGURATION / WIDGETS
### Declarative Layout Tree:
A split view-port container structure:
1. **Left Main Area (The Visual Stage):** A sandboxed layout window that processes the compiled `canvasWidgetsTree` array into interactive Quasar interface elements.
2. **Right Integrated Anchor Area:** Houses the `AgiEditorPalette` instance, explicitly binding its configuration to run in `editorMode='canvas'`.

## 💾 ENTITY DATA MODELS
* **Extended Mantle UDM Entities:** None specified.

## 🔍 VERIFICATION STEPS (MANUAL TESTING)
1. Verify that dragging a structural grid primitive out of the embedded palette and onto the canvas wrapper fires a valid mutation payload back to the data bus.
2. Verify that clicking an element card highlights its visual boundaries and correctly dispatches the `canvas-element-selected` data model packet over the channel.