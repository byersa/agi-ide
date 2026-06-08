# SCREEN/COMPONENT: AgiDashboard
# SUBTITLE: User customizable workspace welcome dashboard

## 🛡️ CORE METADATA & RULE BOUNDARIES
* **Target Output Files:**
  * Backend: `runtime/component/agi-ide/screen/agi-ide/AgiDashboard.xml`
  * Frontend: None (Handled natively via declarative Moqui XML layouts)
* **App Identity:** "Moqui IDE"
* **Security & HIPAA Enforcement:**
  * `require-authentication`: "true"
  * Sensitive Fields: None specified
  * Audit Logging: False

## 📝 DESCRIPTION
This screen serves as a dashboard and user customizable welcome screen for the agi-ide app. It presents differently per each individual user's preferences, pulling dynamic layout data from individual workspace histories and displaying active agent status feeds.

### Subscreens
None specified.

### Subcomponents
* None specified.

## 🛰️ INTER-COMPONENT BUS (BROADCASTCHANNEL)
* **Channel Name:** `agi-ide-context-bus`

### Outbound Broadcast Events:
* None specified.

### Inbound Event Listeners:
* None specified.

## 📥 INPUT PARAMETERS & PROPS
* **Moqui Screen Parameters:** None specified.
* **Vue Component Props:** None specified.

## 💾 INSTANCE STATE & DATA VARIABLES
* **Server Side Actions:**
  * Evaluates the current user context (`ec.user.userId`) to fetch saved dashboard preferences, workspace shortcuts, and recent file history tracks from the database.

## 🔄 LIFECYCLE & ALWAYS-ACTIONS
### Server Side (`<actions>` / `<pre-actions>`):
* Resolves the profile data and maps out lists for the last 5 modified artifacts (XML screens, component definitions) associated with the current developer profile.

### Client Side:
* None specified.

## ⚙️ BEHAVIORS & BACKEND DATA CONTRACTS
### Transitions / API Routes:
* Standard transitions map links straight back into the main workspace router (`/apps/agi-ide/workspace?workspaceId=...`) using the user's historical profile identifiers.

### Vue Internal Methods:
* None specified.

## 🎨 VISUAL CONFIGURATION / WIDGETS
### Declarative Layout Tree (Moqui XML Structure):
A clean grid layout containing distinct card blocks:
1. **Welcome Area Card:** Displays a contextual greeting featuring the user's name alongside brief operational system metrics (active agent runtimes, connected background services).
2. **Recent Activities Desk:** A standard `<form-list>` layout showing a table of the 5 most recently updated artifacts, with explicit click-through link transitions leading straight into the `AgiWorkspace` engine for that file.
3. **Agent Quick Links Deck:** A section displaying configured, saved agent macro templates or recipe recipes for rapid project instantiation.

## 💾 ENTITY DATA MODELS
* **Extended Mantle UDM Entities:** None specified (Dashboard layout configurations and metadata are managed out of standard user preference entities).

## 🔍 VERIFICATION STEPS (MANUAL TESTING)
1. Verify that hitting the `/apps/agi-ide/dashboard` path displays personal developer statistics without errors.
2. Verify that clicking on a target record item within the recent activities table transitions the view cleanly into the main workspace with the correct target parameter attached.