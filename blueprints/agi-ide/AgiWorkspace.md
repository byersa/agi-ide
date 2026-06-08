# SCREEN/COMPONENT: AgiWorkspace
# SUBTITLE: Where the IDE work is done

## 🛡️ CORE METADATA & RULE BOUNDARIES
* **Target Output Files:**
  * Backend: `runtime/component/agi-ide/screen/agi-ide/AgiWorkspace.xml`
  * Frontend: Managed via client-side components loaded out of `/agi-ide-assets/`
* **App Identity:** "Moqui IDE"
* **Security & HIPAA Enforcement:**
  * `require-authentication`: "true"
  * Sensitive Fields: None specified
  * Audit Logging: False

## 📝 DESCRIPTION
This screen acts as the main orchestration area for agi-ide. It serves as the Moqui server anchor that loads the global context and triggers the injection of the client-side execution scripts via a specialized bootstrapper.

Once rendered on the client, it delegates window management to three distinct visual display behaviors:
* **Multiple Screen Mode:** Default mode where multiple AgiSubWorkspace panel instances are visible inside a responsive layout grid.
* **Replacement Mode:** An alternate mode where a single targeted AgiSubWorkspace panel is maximized to occupy 100% of the workspace content area.
* **Detached Mode:** Advanced mode where an individual AgiSubWorkspace editor panel is popped out (window.open) into an entirely separate browser tab or external window while maintaining global state sync.

### Subscreens
None specified.

### Subcomponents
- AgiSubWorkspace
- AgiCreateAppDialog

## 🛰️ INTER-COMPONENT BUS (BROADCASTCHANNEL)
* **Channel Name:** `agi-ide-context-bus`

### Outbound Broadcast Events:
* `context-change`: Broadcasts a structured payload containing the current artifactId and subArtifactId whenever a user shifts focus to a new code layer, forcing all active independent windows to synchronize their telemetry.

### Inbound Event Listeners:
* `context-change`: Listens for focus updates broadcast by detached child panels, updates the localized root component state, and triggers cross-panel redraws.

## 📥 INPUT PARAMETERS & PROPS
### Moqui Screen Parameters:
* `workspaceId` (String, Optional): Loads a saved developer session profile from the database if passed.

### Vue Component Props:
* None specified.

## 💾 INSTANCE STATE & DATA VARIABLES
* `activeLayoutGrid` (Object): A reactive state map tracking the active window positioning mode for the client canvas:

```javascript
{
  AgiScreenEditor: { state: 'docked' | 'maximized' | 'external', windowRef: null },
  AgiCanvasEditor: { state: 'docked' | 'maximized' | 'external', windowRef: null },
  AgiComponentEditor: { state: 'docked' | 'maximized' | 'external', windowRef: null }
}
```

## 🔄 LIFECYCLE & ALWAYS-ACTIONS
### Server Side (<actions>):
* Invokes script path `"component://agi-ide/script/AgiBootstrapper.groovy"` to dynamically push the required runtime engine scripts (AgiWorkspaceApp.js, IdeWorkspaceComponent.qvt.js, etc.) into the response footer scripts pipeline.

### Client Side:
* Vue `mounted()` / `unmounted()` hooks
  * Instantiates the global `BroadcastChannel('agi-ide-context-bus')` and hooks up the window-level lifecycle listeners to gracefully catch and clean up child popups if the master workspace is closed.

## ⚙️ BEHAVIORS & BACKEND DATA CONTRACTS
* **Transitions / API Routes:** None specified.

### Vue Internal Methods:
* **App switching:** When a request is made to load another app, a saved status check is done on the currently loaded app (if exists) and the user is prompted to save or cancel depending on the save status before loading the new app.
* **App creation:** When a request is made to create a new app, a saved status check is done on the currently loaded app (if exists) and the user is prompted to save or cancel depending on the save status before popping up the AgiCreateAppDialog.
* **App deletion:** None specified.
* **Subworkspace window management:** The window display mode - multiple screen mode, replacement screen mode or detached window mode - will dynamically be controlled. When the user picks a mode, the screens will orient themselves to that mode. Depending on the user-selected mode, the corresponding subworkspace - primary or agent - will be displayed and made active.
* `detachPanelToExternalWindow(panelName)`: Spawns a clean browser window popup (window.open), injects essential Quasar styling context headers, mounts the targeted component slice natively, and hooks it to the global BroadcastChannel.

## 🎨 VISUAL CONFIGURATION / WIDGETS
### Declarative Layout Tree (Moqui XML Structure):
There will be a thin header section with the following widgets:
* It will have one dropdown to control the window display mode: multiple screen mode, replacement screen mode or detached window mode.
* There will be another dropdown that shows the available screens. The same dropdown will allow subcomponents to be deactivated or new ones to be added.

The content pane can hold multiple AgiSubWorkspace windows, implemented via a raw HTML/Render-mode container:

```xml
<render-mode><text type="html"><![CDATA[
   <div id="agi-workspace-root-app">
      <component :is="currentLayoutComponent"></component>
   </div>
]]></text></render-mode>
```

## 💾 ENTITY DATA MODELS
* **Extended Mantle UDM Entities:** None specified.

## 🔍 VERIFICATION STEPS (MANUAL TESTING)
1. Verify that loading the workspace URL correctly pulls down all scripts specified in AgiBootstrapper.groovy through the network tab.
2. Verify that changing the workspace layout dropdown correctly repositions or isolates the child panels based on the activeLayoutGrid configuration tracking states.