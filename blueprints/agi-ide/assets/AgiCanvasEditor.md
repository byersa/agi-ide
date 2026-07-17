# `AgiCanvasEditor` Architectural Blueprint

## 1. Executive Overview
`AgiCanvasEditor` is the primary interactive, visual WYSIWYG rendering engine of the AGI IDE Suite[cite: 5]. It translates declarative metadata JSON trees representing Moqui screens directly into dynamic, nested Quasar components[cite: 5]. The component manages interactive visual node selections, communicates state modifications via a shared browser broadcast channel, and maps standard layout types to corresponding visual components[cite: 5].

---

## 2. Component Hierarchy & Data Flow

+------------------------+
                     |    AgiCanvasEditor     |
                     +-----------+------------+
                                 | (Renders root nodes)
                                 v
                     +------------------------+
              +----->|     AgiCanvasNode      |<-----+
              |      +-----------+------------+      |
              |                  |                   |
              |                  | (Recursive loop)  |
              +------------------+-------------------+

### Component Parameters & Input Interfaces
The editor expects a structured screen identity path alongside the current layout context[cite: 5]:

*   **`screenPath`** (`String`, *Required*): The target file destination tracking key of the active Moqui screen[cite: 5].
*   **`layoutTree`** (`Object`, *Optional*): The master backend JSON syntax representation of the document structure[cite: 5]. Defaults to `{ id: "root", tagName: "form", children: [] }`[cite: 5].

### Reactive Local Scope
*   **`selectedMariaId`** (`String`): Stores the unique visual tracking identifier (`mariaId`) of the element currently selected by the developer[cite: 5].
*   **`contextBus`** (`BroadcastChannel`): The communication pipeline initialized on the channel name `'agi-ide-context-bus'`[cite: 5].
*   **`localBlueprintTree`** (`Object`): The local operational state replica of the rendering structure[cite: 5].

---

## 3. The `AgiCanvasNode` Sub-System
To support infinitely nested UI grids, layout elements are parsed by a recursive inner renderer named `AgiCanvasNode`[cite: 5].

### Tag Mapping Strategies (`resolveQuasarTag`)
Incoming generic XML elements are dynamically resolved to interactive Quasar elements[cite: 5]:

| XML Tag Name | Quasar Element | Notes |
| :--- | :--- | :--- |
| `container`, `webroot`, `widgets` | `div` | Acts as standard layout block dividers[cite: 5]. |
| `form`, `formsingle` | `q-form` | Mounts standard form actions[cite: 5]. |
| `text-field`, `formfield` | `q-input` | Outlined text boxes with interactive labels[cite: 5]. |
| `link`, `submit` | `q-btn` | Interactive action buttons[cite: 5]. |
| `label` | `div` | Normal text display container[cite: 5]. |

### CSS Layout Mapping (`getNodeClasses`)
Layout nodes automatically obtain specific layout wrapper styling configurations[cite: 5]:
*   **Form/Containers**: Appends padding, margins, card backgrounds, rounded corners, shadows, and column structures (`'q-pa-md q-my-sm bg-white rounded-borders shadow-1 full-width column q-gutter-y-sm'`)[cite: 5].
*   **Fields**: Configured with `'q-my-xs block full-width'` to preserve grid columns[cite: 5].
*   **Buttons**: Rendered with `'q-mt-md block text-left'`[cite: 5].
*   **Labels**: Styled with `'text-body2 text-grey-7 q-py-xs block'`[cite: 5].

---

## 4. Initialization Lifecycles & Event Subscriptions

### `mounted()` Event Broker Configuration
1. **Pipeline Instantiation**: Opens the `'agi-ide-context-bus'` broadcast channel[cite: 5].
2. **Synchronized Selection Monitoring**: Listens on the channel for incoming `'element-selected-by-id'` events[cite: 5]. Upon receipt, updates the local selection highlight and scrolls the target element into view[cite: 5].
3. **Dynamic Mutation Interception**: Listens for `'artifact-state-mutated'` events, updating the preview structure when backend changes occur[cite: 5].

---

## 5. Method Specifications

### Operational Actions
*   **`executeBufferSave()`**
    *   *Logic*: Emits the custom component event `'trigger-save'`, passing the modified layout tree state to the parent workspace[cite: 5].
*   **`handleVisualNodeClick(clickedNode)`**
    *   *Logic*: Sets the clicked element's `mariaId` as the active highlight state[cite: 5]. Broadcasts the selection details (`element-selected-by-id`) to the other editors over the broadcast channel and centers the view on the selection[cite: 5].
*   **`scrollToNode(mariaId)`**
    *   *Logic*: Locates the DOM element matching the active `mariaid`[cite: 5]. Performs a smooth scroll, adds the temporal `'pulse-highlight'` class, and removes it after $1000\text{ ms}$[cite: 5].

### Reactive Tree Watchers
*   **`layoutTree` Watcher**
    *   *Logic*: Synchronizes local states when the parent workspace updates[cite: 5]. Standardizes Moqui’s root `"widgets"` arrays into the common Vue `"children"` structure[cite: 5].
