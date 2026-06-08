# SCREEN/COMPONENT: agi-ide
# SUBTITLE: Architectural Blueprint: AGI-IDE Meta-Shell

## 🛡️ CORE METADATA & RULE BOUNDARIES
* **Target Output Files:** * Backend: `runtime/component/agi-ide/screen/agi-ide.xml`
  * Frontend: None (Handled via Moqui's native XML screen widget layouts)
* **App Identity:** "Moqui IDE"
* **Security & HIPAA Enforcement:**
  * `require-authentication`: "true"
  * Sensitive Fields: None specified
  * Audit Logging: False

## 📝 DESCRIPTION
agi-ide is the entry point for the agi-ide app. It acts as a structural header shell that provides navigation across the main functional zones of the application and decorates all nested subscreens.

### Subscreens / Components
The following subscreens are explicitly registered as child paths under this shell:
- AgiWorkspace.xml
- AgiInstructions.xml
- AgiDashboard.xml

The default subscreen path to render when accessing `/agi-ide` is explicitly configured to point to `dashboard`.

## 🛰️ INTER-COMPONENT BUS (BROADCASTCHANNEL)
* **Channel Name:** `agi-ide-context-bus`
* **Outbound Broadcast Events:**
  * None specified.
* **Inbound Event Listeners:**
  * None specified.

## 📥 INPUT PARAMETERS & PROPS
* **Moqui Screen Parameters:** None specified.
* **Vue Component Props:** None specified.

## 💾 INSTANCE STATE & DATA VARIABLES
* **Reactive UI Keys:** None specified.

## 🔄 LIFECYCLE & ALWAYS-ACTIONS
* **Server Side:** `<always-actions>` / `<pre-actions>`
  * Evaluates and sets the active menu context so Moqui's standard header templates can highlight the selected workspace option natively.
* **Client Side:** Vue `mounted()` / `unmounted()` hooks
  * None specified.

## ⚙️ BEHAVIORS & BACKEND DATA CONTRACTS
* **Transitions / API Routes:** None specified.
* **Vue Internal Methods:** None specified.

## 🎨 VISUAL CONFIGURATION / WIDGETS
* **Declarative Layout Tree:**
  This screen will display a short banner across the top with 
  - an app identity section on the left: Displaying "Moqui IDE"
  - a menu for the subscreens in the middle: A declarative dynamic menu bar utilizing explicit links targeting each registered child path (dashboard, workspace, instructions)
  - an account status and dropdown button on the right: Displays the currently logged-in user's name (ec.user.username) containing an explicit logout link (/apps/LogOut)

  The bottom, content section uses the native `<subscreens-active/>` element to render the targeted child view seamlessly below the header.

## 💾 ENTITY DATA MODELS
* **Extended Mantle UDM Entities:** None specified.

## 🔍 VERIFICATION STEPS (MANUAL TESTING)
1. Verify navigating to `/apps/agi-ide` successfully redirects and renders the `AgiDashboard.xml` content by default.
2. Verify that clicking the header menu items correctly loads `/apps/agi-ide/workspace` and `/apps/agi-ide/instructions` without losing the layout banner.
3. Verify that the user's username is visible on the top-right and clicking logout terminates the active Moqui session.