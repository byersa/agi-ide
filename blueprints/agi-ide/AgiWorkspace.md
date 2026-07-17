# `AgiWorkspace` Architectural Blueprint

## 1. Executive Overview
`AgiWorkspace` serves as the centralized orchestration container and reactive layout coordinate engine for the suite of AGI Workspace Editors (`AgiCanvasEditor`, `AgiScreenEditor`, and `AgiComponentEditor`)[cite: 5]. It manages active viewport focus loops, handles external multi-window window state detaching, synchronizes tool configurations from the database runtime environment into the `AgiMcpEngine` pipeline, and enforces state coherence using an explicit server-side workspace buffer synchronization mechanism[cite: 5].

---

## 2. Reactive Data Properties & Architecture Scope

                         +-----------------------+
                         |     AgiWorkspace      |
                         +-----------+-----------+
                                     |
        +----------------------------+----------------------------+
        |                            |                            |
        v                            v                            v
+-----------+-----------+    +-----------+-----------+    +-----------+-----------+
|   AgiCanvasEditor     |    |    AgiScreenEditor    |    |  AgiComponentEditor   |
| (Canvas Renderer)     |    | (Screen Source Editor)|    |(ComponentSrc Editor)  |
+-----------------------+    +-----------------------+    +-----------------------+


The internal workspace scope tracks window geometry choices, panel assignments, and state parameters:

| Variable | Data Type | Default / Options | Purpose |
| :--- | :--- | :--- | :--- |
| **`windowDisplayMode`** | `String` | `'Collage Grid'` <br> *(Options: 'Focus Canvas', 'Focus Source')* | Dictates global viewport window layout distributions[cite: 5]. |
| **`activeScreens`** | `Array` | `['AgiCanvasEditor', 'AgiScreenEditor', 'AgiComponentEditor']` | Tracked array of editors selected by the developer for active layout evaluation[cite: 5]. |
| **`activeLayoutGrid`** | `Object` | `{ AgiCanvasEditor: { state: 'docked' }, ... }` | Manages the layout configuration state (`'docked'`, `'maximized'`, `'external'`) for each specific sub-editor pane[cite: 5]. |
| **`activeWorkspaceBuffer`** | `Object` | `{ workspaceBufferId: '', metaJsonBuffer: null }` | The shared local master source-of-truth JSON tree structure synchronized with the server backend[cite: 5]. |

---

## 3. Initialization Lifecycles & Event Subscriptions

### `mounted()` Boot Routine
*   **Window Unload Protection**: Binds an execution listener to `beforeunload` to securely close trailing popup windows[cite: 5].
*   **External Window Tracking Loop**: Initializes a $1000\text{ ms}$ baseline poller to monitor external sub-windows; if a panel window is closed externally, its state reverts to `'docked'`[cite: 5].
*   **Moqui Real-Time WebSocket Listener**: Registers an asynchronous listener on the notification topic channel `'agi-ide-workspace'`[cite: 5]. Intercepted mutations dynamically heal the local `metaJsonBuffer` state on the fly[cite: 5].
*   **Database Tool Hydration**: Invokes database calls to populate the running workspace environment[cite: 5].
*   **Workspace State Rehydration**: Restores the user's active file layout structure buffer[cite: 5].

---

## 4. Core Method Specifications

### Operational & Grid Layout Mechanics
*   **`isPanelVisible(panelName)`**: Returns `false` if the panel name is excluded from `activeScreens` or detached to an `external` state[cite: 5]. If a sibling panel is flagged as `'maximized'`, only that panel returns `true`[cite: 5].
*   **`getPanelClass(panelName)`**: Calculates layout sizes based on visible docked items, returning `'col-12'` if maximized or isolated, `'col-6'` if two are docked, and `'col-4'` if three share the viewport space[cite: 5].
*   **`handleDisplayModeChange(val)`**: Overrides the selected options checklist to trigger view mutations (`Focus Canvas` isolates the canvas editor, `Focus Source` displays the screen code editor)[cite: 5].
*   **`detachPanelToExternalWindow(panelName)`**: Transitions a panel state to `'external'` and provisions an individual popup window targeting `/apps/agi-ide/amaTerminal`[cite: 5]. Copies DOM framework style tags into the new window context on load[cite: 5].

### Server Sync & Database Hydration Pipelines
*   **`hydrateMcpOrchestratorFromDatabase()`**: Performs a `GET` request against `/rest/s1/agi-ide/getAllTools`[cite: 5]. Instantiates safe JavaScript operational runtimes from the `scriptBody` records using factory injection routines, registering executable nodes inside `window.AgiMcpEngine`[cite: 5].
*   **`hydrateWorkspaceBuffer()`**: Dispatches a `GET` request targeting `/rest/s1/agi-ai/getWorkspaceBuffer` using `screenPath` and `window.AGI_SERVER_USER_ID` coordinates[cite: 5]. Unpacks the raw text payload to seed the unified reactive model[cite: 5].
*   **`handleChildEditorSave(updatedLayoutTree)`**: Triggered by events from children editors[cite: 5]. Commits updates locally, verifies token integrity, and transmits a serialized payload string via a `POST` request to `/rest/s1/mcp/storeWorkspaceBuffer`[cite: 5].