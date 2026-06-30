# AgiWorkspace Hydration Blueprint & Traceability Matrix

```mermaid
%%{init: { 'theme': 'dark' } }%%
sequenceDiagram
    autonumber
    participant UI_Shell as AgiCommandPalette (Vue Parent)
    participant REST as Moqui REST API Engine
    participant ADK as AgiMcpServices (executeAdkProxyLoop)
    participant DB as Moqui Database (WorkspaceBuffer)
    participant MGR as AdkManager (Native Session State)
    participant LLM as External Gemini API Gateway

    Note over UI_Shell: User Submits Prompt or Mutation Trigger<br/>[PROX-01]
    Note over UI_Shell: Packages memory context pointers<br/>(userPrompt, focusCoordinate, etc.)
    
    UI_Shell->>REST: POST /geminiProxy [PROX-02]
    REST->>ADK: Invoke execute#35;AdkProxyLoop script [PROX-03]
    
    rect rgba(100, 150, 255, 0.15)
        Note over ADK: Server Caching & Hydration Phase
        ADK->>DB: service-call get#35;WorkspaceBuffer [PROX-04]
        DB-->>ADK: Return row details & activeLayoutBuffer text
        ADK->>MGR: Resolve / Hydrate continuous native context session [PROX-05]
        MGR-->>ADK: Return verifiedSessionId
    end

    rect rgba(255, 180, 100, 0.15)
        Note over ADK: LLM Secure Handshake Phase
        Note over ADK: Injects Server API Secret Keys<br/>& Constructs System Prompt Payload
        ADK->>LLM: AdkManager.runAgent() -> POST /v1beta/models/gemini [PROX-06]
        LLM-->>ADK: Return conversational events & tool mutation tokens
    end

    rect rgba(100, 255, 150, 0.15)
        Note over ADK: Server Validation Critique & Correction Loop
        Note over ADK: If ec.message.hasError(), re-prompt LLM<br/>with validation rules to force execution healing
    end

    ADK-->>REST: Return completionText JSON string map envelope
    REST-->>UI_Shell: Return 200 OK Response Payload [PROX-07]
    
    rect rgba(200, 100, 255, 0.15)
        Note over UI_Shell: Upstream Hot-Reload Phase
        UI_Shell->>UI_Shell: Reactively ingest mutated layoutTree payload [PROX-08]
        Note over UI_Shell: Deep store watcher triggers downstream cascade
    end
```
### 2. Lookup section (Corrected)
| Key | Phase / Event | Layer Involved | Technical Mechanism / Operation | Architectural Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| <nobr>`[PROX-01]`</nobr> | Prompt Trigger | `AgiCommandPalette.qvt.js` | User inputs text query; app tracks active cursor coordinate context parameters. | Packages user intent alongside real-time frontend file pointer attributes before submitting across network lines. |
| <nobr>`[PROX-02]`</nobr> | Secure Outbound POST | Axios HTTP Client | JavaScript executes an authenticated `axios.post()` to `/rest/s1/agi-ai/geminiProxy` with `axiosConfig`. | Passes the active session token to bypass gates while pushing data to the network layer. |
| <nobr>`[PROX-03]`</nobr> | Direct Proxy Route | `agi-ide.rest.xml` | REST engine processes route definition and executes target service artifact script. | Bypasses mid-tier web controllers to trigger your core backend script compilation line immediately. |
| <nobr>`[PROX-04]`</nobr> | Cache Layer Sync | `AgiWorkspaceServices` | Script issues a synchronous internal `<service-call>` to `get#WorkspaceBuffer`. | Pulls the active layout tree string directly from database memory to guarantee backend state accuracy. |
| <nobr>`[PROX-05]`</nobr> | Token Session Warm-Up | `AdkManager` Core | System matches browser transaction tokens against an active `ConcurrentHashMap` cache. | Restores or provisions a dedicated, continuous execution footprint mapping to the LLM agent instance. |
| <nobr>`[PROX-06]`</nobr> | Secure LLM Handshake | Google Gemini API | Server issues a secure outbound call injecting backend credentials and rules context. | Completely screens critical API workspace keys from reaching client environments. |
| <nobr>`[PROX-07]`</nobr> | Serialized Delivery | Moqui REST Engine | Packs parsed token results directly into a structured `completionText` response variable. | Completes network processing loops by delivering clean JSON payloads straight back to browser contexts. |
| <nobr>`[PROX-08]`</nobr> | Workspace Cascade | Vue Core / Pinia | Component extracts fresh mutation data maps, triggering a unidirectional down-tree redraw. | Synchronizes both drawing workspace screens and text views instantly without file reloads. |