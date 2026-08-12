# SCREEN/COMPONENT: AgiScreenEditor
# SUBTITLE: XML Screen Code-View Editor Component

## 🛡️ CORE METADATA & RULE BOUNDARIES
* **Target Output Files:**
  * Frontend: `runtime/component/agi-ide/screen/agi-ide/assets/AgiScreenEditor.qvt.js`[cite: 4]
* **App Identity:** "Moqui IDE"
* **Security & HIPAA Enforcement:**
  * Sensitive Fields: None specified
  * Audit Logging: False

## 📝 DESCRIPTION
A synchronized XML source code editor within the AGI IDE Suite[cite: 4]. It dynamically compiles the reactive layout tree into formatted XML using a backend compilation service[cite: 4], listens for element selection events to auto-scroll and highlight matching XML elements, and broadcasts localized text mutations to keep sister editors synchronized[cite: 4].

### Subscreens
None specified.

### Subcomponents
* None specified (Runs alongside other layout cells within the workspace scope)[cite: 4].

## 🛰️ INTER-COMPONENT BUS (BROADCASTCHANNEL)
* **Channel Name:** `agi-ide-context-bus`[cite: 4]

### Outbound Broadcast Events:
* `xml-source-mutated`: Fired instantly on textarea typing changes to broadcast real-time XML string modifications down the line[cite: 4].
  * **Payload Schema:** `{ rawXmlText: String }`[cite: 4]

### Inbound Event Listeners:
* `element-selected-by-id`: Intercepts interactive visual element selections originating from the Visual Canvas[cite: 4].
  * **Payload Schema:** `{ mariaId: String }`[cite: 4]
  * **Behavior:** Parses the target name from the compound `mariaId` (e.g., extracting `"username"` from `"SampleForm#username"`)[cite: 4]. Searches the text buffer for the string declaration pattern `name="[elementName]"`[cite: 4]. If located, it focuses the textarea, highlights the characters, and scrolls the cursor cleanly into viewport focus[cite: 4].

## 📥 INPUT PARAMETERS & PROPS
* **Moqui Screen Parameters:** None specified.

### Vue Component Props:
* `screenPath` (String, *Required*): The physical target directory path of the active XML screen[cite: 4].
* `layoutTree` (Object, *Optional*): The shared master reactive blueprint JSON tree structure[cite: 4].

## 💾 INSTANCE STATE & DATA VARIABLES
### Reactive UI Keys:
* `rawXmlSource` (String): Holds the compiled XML code representation[cite: 4].
* `contextBus` (BroadcastChannel): The active browser messaging context[cite: 4].
* `activeHighlightedMariaId` (String): Tracks the active highlighted `mariaId` mapped from canvas selections[cite: 4].
* `localBlueprintTree` (Object): A local replica of the synchronized workspace layout tree state[cite: 4].

## 🔄 LIFECYCLE & ALWAYS-ACTIONS
### Server Side:
* `<always-actions>` / `<pre-actions>`
  * None specified (Operates purely as an asynchronous JavaScript workspace asset)[cite: 4].

### Client Side:
* Vue `mounted()`: Instantiates the `'agi-ide-context-bus'` channel and registers the `'element-selected-by-id'` selection listener[cite: 4].
* Vue `beforeUnmount()`: Closes the active broadcast context safely to prevent memory leaks[cite: 4].
* Vue `watch: { layoutTree }`: Deeply watches workspace state adjustments, synchronizes them to `localBlueprintTree`, and invokes the dynamic XML compile routine[cite: 4].

## ⚙️ BEHAVIORS & BACKEND DATA CONTRACTS
### Transitions / API Routes:
* `/rest/s1/agi-ide/compileTreeToXml` (POST): Compiles the active structured JSON blueprint tree back into formatted XML[cite: 4].
  * **Payload Schema:** `{ layoutTree: Object }`[cite: 4]
  * **Response Schema:** `{ xmlText: String }`[cite: 4]

### Vue Internal Methods:
* `compileTreeToXmlText()`: Dynamically fetches Pinia store configurations to issue secure compile requests[cite: 4].
* `executeBufferSave()`: Emits the upstream `'trigger-save'` custom event to request a workspace commit on the server[cite: 4].
* `onTextareaInput(event)`: Listens to keystrokes inside the editor view to update local buffers and trigger mutations[cite: 4].
* `clearHighlight()`: Erases the active highlighting states[cite: 4].
* `highlightAndScrollToSourceElement(mariaId)`: Executes pattern lookups in the text workspace and moves the scroll window to focus the line[cite: 4].

## 🎨 VISUAL CONFIGURATION / WIDGETS
### Declarative Layout Tree:
Renders a full-height column container featuring a top toolbar and a responsive text editing pane[cite: 4]:
* **Top Toolbar**: Displays a title, a **"Save Changes"** button, and an active highlight chip displaying the currently synced element[cite: 4].
* **Editor Pane**: Holds a native textarea decorated with custom scroll classes[cite: 4].

## 💾 ENTITY DATA MODELS
* **Extended Mantle UDM Entities:** None specified.

## 🔍 VERIFICATION STEPS (MANUAL TESTING)
1. Verify that incoming edits inside the visual canvas trigger an automatic server-side compilation, updating the editor text buffer seamlessly[cite: 4].
2. Verify that manual text changes inside the textarea instantly broadcast the `'xml-source-mutated'` event down the bus[cite: 4].
3. Verify that saving mutations commits the current tree cleanly up to the workspace context[cite: 4].