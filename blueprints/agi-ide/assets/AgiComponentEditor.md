# SCREEN/COMPONENT: AgiComponentEditor
# SUBTITLE: XML Component Code-View Editor Instance

## 🛡️ CORE METADATA & RULE BOUNDARIES
* **Target Output Files:**
  * Frontend: `runtime/component/agi-ide/screen/agi-ide/assets/AgiComponentEditor.qvt.js`[cite: 3]
* **App Identity:** "Moqui IDE"
* **Security & HIPAA Enforcement:**
  * Sensitive Fields: None specified
  * Audit Logging: False

## 📝 DESCRIPTION
A synchronized XML source code editor dedicated to managing raw component structures[cite: 3]. It fetches the physical XML file definition directly from the Moqui backend, listens for layout element focus events to highlight and scroll to source markup declarations, and broadcasts local text buffer mutations to synchronize the unified layout workspace[cite: 3].

### Subscreens
None specified.

### Subcomponents
* None specified (Operates side-by-side with sister editors inside the workspace viewport)[cite: 3].

## 🛰️ INTER-COMPONENT BUS (BROADCASTCHANNEL)
* **Channel Name:** `agi-ide-context-bus`[cite: 3] (Implicitly initialized or bound via mixin[cite: 3]).

### Outbound Broadcast Events:
* `xml-source-mutated`: Broadcasts raw XML string updates instantly on user keystroke input within the textarea[cite: 3].
  * **Payload Schema:** `{ rawXmlText: String }`[cite: 3]

### Inbound Event Listeners:
* `element-selected-by-id`: Listens for interactive visual selections broadcast from the Visual Canvas[cite: 3].
  * **Payload Schema:** `{ mariaId: String }`[cite: 3]
  * **Behavior:** Invokes `highlightAndScrollToSourceElement` to center and highlight the matching XML code element block[cite: 3].

## 📥 INPUT PARAMETERS & PROPS
* **Moqui Screen Parameters:** None specified.

### Vue Component Props:
* `screenPath` (String, *Required*): The physical workspace path tracking key of the active Moqui component screen[cite: 3].
* `layoutTree` (Object, *Optional*): The master layout tree configuration state[cite: 3]. Defaults to `{ id: "root", tagName: "form", children: [] }`[cite: 3].

## 💾 INSTANCE STATE & DATA VARIABLES
### Reactive UI Keys:
* `rawXmlSource` (String): The active raw XML text contents[cite: 3].
* `contextBus` (BroadcastChannel): The messaging pipeline context[cite: 3].
* `activeHighlightedMariaId` (String): Stores the highlighted element tracking key mapped from selection events[cite: 3].
* `localBlueprintTree` (Object): Local operational clone of the synchronized workspace layout tree state[cite: 3].

## 🔄 LIFECYCLE & ALWAYS-ACTIONS
### Server Side:
* `<always-actions>` / `<pre-actions>`
  * None specified (Runs exclusively as an on-demand JavaScript context asset)[cite: 3].

### Client Side:
* Vue `mounted()`: Configures the dynamic `contextBus` message event listener for element selections[cite: 3]. Dispatches an axios `GET` request to `/agi-ide/getRawXml` to retrieve the active screen source, loading a default XML structure template if the connection fails[cite: 3].
* Vue `beforeUnmount()`: Closes the active `contextBus` channel pipeline to prevent system memory leaks[cite: 3].
* Vue `watch: { layoutTree }`: Deeply watches workspace layout updates to keep the local tracking tree synced[cite: 3].

## ⚙️ BEHAVIORS & BACKEND DATA CONTRACTS
### Transitions / API Routes:
* `/agi-ide/getRawXml` (GET): Retrieves the raw XML source code string for the active screen path[cite: 3].
  * **Payload Schema:** `?screenPath=String`[cite: 3]
  * **Response Schema:** Raw XML String payload[cite: 3].

### Vue Internal Methods:
* `executeBufferSave()`: Emits the upstream `'trigger-save'` custom event to request a workspace compile write loop[cite: 3].
* `onTextareaInput(event)`: Handles direct keystrokes to update the text state and broadcast changes over the bus[cite: 3].
* `highlightCodeLineByMariaId(mariaId)`: Focuses on target elements and calculates scrolls[cite: 3].
* `clearHighlight()`: Erases the active highlighted `mariaId` state[cite: 3].
* `highlightAndScrollToSourceElement(mariaId)`: Parses the target element ID from a compound token, performs a regex pattern lookup inside the text buffer, executes cursor range selections, and programmatically scrolls the matching code line to center focus[cite: 3].

## 🎨 VISUAL CONFIGURATION / WIDGETS
### Declarative Layout Tree:
Renders a full-height column container featuring a header toolbar and a responsive text area[cite: 3]:
* **Header Toolbar**: Holds an active title "XML Component Editor", a flat **"Save Changes"** action button, and a selection-sync tracker chip[cite: 3].
* **Editor Container**: Holds a native, styleable `xml-textarea`[cite: 3].

## 💾 ENTITY DATA MODELS
* **Extended Mantle UDM Entities:** None specified.

## 🔍 VERIFICATION STEPS (MANUAL TESTING)
1. Verify that loading the component successfully issues a `GET` request to `/agi-ide/getRawXml` and populates the text area[cite: 3].
2. Verify that typing inside the text field triggers immediate layout-mutated broadcasts over the shared channel[cite: 3].
3. Verify that visual selections broadcast on the canvas force the cursor focus to snap directly to the corresponding source XML line[cite: 3].