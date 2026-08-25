# GrowERP ADK & MCP Architectural Gap Analysis

This document provides a comprehensive technical review and architectural gap analysis of the integration of the Google Agent Development Kit (ADK) and Model Context Protocol (MCP) transport layers within the GrowERP component ecosystem, specifically contrasting the current stateful implementation with a stateless Orchestration Harness model.

---

## 1. Executive Summary

The current implementation maps Google ADK and MCP protocols to the Moqui service framework to enable AI-driven operations (such as automated screen navigation, tool discovery, and background notifications) within the GrowERP component ecosystem (particularly for its Flutter-based front-end). 

However, the architecture relies heavily on **persistent HTTP/SSE streams** and **in-memory session registries** (`McpSessionAdapter`, `AdkManager.registry`). While highly responsive under local development conditions, this stateful design creates scalability bottlenecks, prevents horizontal load-balancing in clustered production environments, and is vulnerable to container/node restarts. 

Transitioning to a **stateless Orchestration Harness model** (e.g., utilizing `executeAdkProxyLoop`) backed by durable database session hydration resolves these issues, enabling massive scaling, resilience to restarts, and distributed cluster support.

---

## 2. Technical Code Harvest

Below is a detailed trace of the components, gateways, and transport implementations mapping the ADK and MCP layers.

### A. Mappings and Gateways

The incoming gateways that accept AI prompts and orchestrate Model Context Protocol requests are defined in `moqui-mcp` and mapped via `web.xml` and `component.xml`:

1. **REST and Web Servlet Gateway**:
   - **Class**: [`org.moqui.mcp.EnhancedMcpServlet`](file:///home/byersa/IdeaProjects/aitree-project/runtime/component/moqui-mcp/src/main/groovy/org/moqui/mcp/EnhancedMcpServlet.groovy)
   - **Endpoints**:
     - `GET /mcp/sse` (or `/sse`): Handled by `handleSseConnection()`. Establishes the long-running Server-Sent Events (SSE) channel.
     - `POST /mcp/message` (or `/message`): Handled by `handleMessage()`. Receives JSON-RPC messages and routes them to tool execution.
     - `POST /mcp`: Handled by `handleJsonRpc()`. Handles fallback JSON-RPC POST requests.
   - **Authentication**: Delegated to Moqui's filter chain (`MoquiAuthFilter`). The servlet ensures that `ec.user.userId` is populated, returning `SC_UNAUTHORIZED` (HTTP 401) with a JSON-RPC error if not authenticated.
   - **CORS Handling**: `handleCors()` dynamically appends CORS preflight and access control headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Headers` containing `Mcp-Session-Id`, `MCP-Protocol-Version`, etc.).

2. **Agi-Ai Lifecycle & Bootstrapping**:
   - **File**: [`AgiAdkLifecycleBinding.groovy`](file:///home/byersa/IdeaProjects/aitree-project/runtime/component/agi-ai/script/AgiAdkLifecycleBinding.groovy)
   - **Logic**: Dynamic bootstrap script executed after Moqui initialization. It:
     - Generates a 1-year API key for user `SystemSupport` via `ec.user.getLoginKey()`.
     - Creates a stateless `org.moqui.ai.RestMcpToolset` pointing to the REST URL `http://localhost:8080/rest/s1/mcp/tools`.
     - Configures the `com.google.adk.agents.LlmAgent` and binds the custom toolset to a unified `com.google.adk.runner.Runner`.
     - Directly overrides and registers the runner into `AdkManager`'s static registries:
       ```groovy
       AdkManager.registry.put(AdkManager.DEFAULT_CONFIG, unifiedRunner)
       AdkManager.agentRegistry.put(AdkManager.DEFAULT_CONFIG, unifiedAgent)
       ```

---

### B. Session Management Analysis

Session management maps Moqui `Visit` records directly to MCP sessions, tracking them in-memory:

1. **In-Memory Registries**:
   - [`McpSessionAdapter.groovy`](file:///home/byersa/IdeaProjects/aitree-project/runtime/component/moqui-mcp/src/main/groovy/org/moqui/mcp/adapter/McpSessionAdapter.groovy) defines `McpSessionAdapter` which caches session state in a `ConcurrentHashMap`:
     ```groovy
     private final Map<String, McpSession> sessions = new ConcurrentHashMap<>()
     private final Map<String, Set<String>> userSessions = new ConcurrentHashMap<>()
     ```
   - Each `McpSession` object contains the `PrintWriter sseWriter` used for active stream delivery, a thread-safe `notificationQueue` for buffering undelivered notifications, and a `subscriptions` list.
   - [`AdkManager.groovy`](file:///home/byersa/IdeaProjects/aitree-project/runtime/component/moqui-adk/src/main/groovy/org/moqui/adk/AdkManager.groovy) similarly maintains:
     - `registry`: Maps `configId` to the active ADK `Runner`.
     - `agentRegistry`: Maps `configId` to `LlmAgent`.
     - `sessionOwn`: Maps `sessionId` to `configId`.

2. **SSE Connection Lifecycle**:
   - `EnhancedMcpServlet` keeps connections alive by entering a blocking loop that sleeps for 5 seconds and issues an SSE event ping:
     ```groovy
     int pingCount = 0
     while (!response.isCommitted() && pingCount < 60) {
         Thread.sleep(5000)
         if (!response.isCommitted()) {
             if (!transport.sendPing(sessionId)) break
             pingCount++
         }
     }
     ```
   - If a client disconnects, `transport.unregisterSseWriter(sessionId)` is invoked to clean up.
   - When a session has no active writer (e.g. during a network transition), any incoming notification is buffered in the session's queue and flushed upon reconnection via `deliverQueuedNotifications()`.

---

### C. Tool Schema Loading & Transfer

The mechanism for loading schemas and calling tools leverages Moqui's service engine:

1. **Tool Discovery (`tools/list`)**:
   - Mapped via [`McpToolAdapter`](file:///home/byersa/IdeaProjects/aitree-project/runtime/component/moqui-mcp/src/main/groovy/org/moqui/mcp/adapter/McpToolAdapter.groovy) to the Moqui service [`list#Tools`](file:///home/byersa/IdeaProjects/aitree-project/runtime/component/moqui-mcp/service/McpServices.xml#L2990-L3087).
   - This service returns a list of tools including:
     - `moqui_browse_screens` (renders operational screen structures as accessibility trees or HTML/text).
     - `moqui_search_screens` (finds target screen paths).
     - `moqui_get_screen_details` (analyzes input fields and autocomplete options).
     - `moqui_get_help` (fetches wiki/doc files).
     - `moqui_prompts_list` / `moqui_prompts_get`.
   - Each tool specifies an `inputSchema` detailing expected parameter names, types, and descriptions in JSON-Schema format.

2. **Tool Execution (`tools/call`)**:
   - Handles call requests via the service `mcp#ToolsCall`.
   - **Direct Dispatch**: Matches the tool name to specific Moqui services (e.g., `McpServices.mcp#BrowseScreens`).
   - **Dynamic Fallback**: If the tool name does not match any internal MCP helper but is defined as a general Moqui service (`ec.service.isServiceDefined(name)`), it executes the service directly using the provided arguments, converting the response map into an MCP-compliant text structure:
     ```groovy
     if (ec.service.isServiceDefined(name)) {
         def serviceResult = ec.service.sync().name(name).parameters(arguments ?: [:]).call()
         result = [content: [[type: "text", text: new JsonBuilder(serviceResult).toString()]], isError: false]
         return
     }
     ```

---

## 3. Architectural Gaps

The current implementation utilizes a **stateful, direct-streaming setup** where active clients must establish and hold open a persistent HTTP/SSE connection. Below is a comparison contrasting this model against an **asynchronous, stateless Orchestration Harness**.

| Architectural Dimension | Stateful Direct-Streaming Model (Current Hans's Model) | Stateless Orchestration Harness Model (Proposed Target Model) |
| :--- | :--- | :--- |
| **Connection Lifecycle** | **Stateful & Persistent**: Holds HTTP sockets open continuously via blocking loops (`Thread.sleep()`). | **Stateless Request-Response**: Clients communicate via short-lived, transient REST/HTTP requests. No persistent TCP pins. |
| **Session Cache Location** | **JVM Memory**: Sessions, writers (`PrintWriter`), and running `Runner` / `LlmAgent` instances reside in concurrent maps inside JVM memory. | **Durable Database**: Session data, execution history, and active execution cursors are saved to database tables. |
| **Clustering & Horizontal Scaling** | **Incompatible / Hard to Load-Balance**: If a client's request is routed to Node B but their SSE socket is registered on Node A, Node B cannot deliver events. | **Fully Clustered**: Any request can hit any node. Nodes are completely stateless; they hydrate session state from the DB, execute a step, and persist it back. |
| **Resilience & Fault Tolerance** | **Fragile**: Any server restart, timeout, or load-balancer connection drop severs the socket and destroys the session, requiring client-side re-initialization. | **Self-Correcting**: Uses an asynchronous execution loop (`executeAdkProxyLoop`). If a node restarts or a network blip occurs, the loop recovers exactly where it left off. |
| **Resource Efficiency** | **Low**: Consumes a servlet container thread or async context per active connection, leading to thread or file-descriptor exhaustion. | **High**: Only consumes threads during active calculations/turn steps. Threads are immediately returned to the pool after writing response. |

### Stateful Bottlenecks in Hans's Model

1. **Thread & Socket Pinning**: The `while (!response.isCommitted())` loop inside `handleSseConnection()` forces the server to maintain open HTTP writers. This prevents the platform from scaling to thousands of concurrent agents.
2. **Cluster Session Fragmentation**: Because `McpSessionAdapter` stores `PrintWriter` instances in an in-memory `ConcurrentHashMap`, horizontal scaling is blocked. Standard sticky-sessions or complex WebSocket/SSE routing fabrics are required to guarantee that JSON-RPC calls are routed to the node holding the socket.
3. **Loss of Run State on Crash**: If the Moqui process is terminated, active LLM loops (which run asynchronously inside Google ADK's `runner.runAsync` subscription threads) are aborted midway. The progress is lost because the runner and its execution cursor are not serialized to a database.

### The Stateless Alternative: Asynchronous Orchestration Loop (`executeAdkProxyLoop`)

A stateless Orchestration Harness model operates like a transaction engine:
- **Stateless Turn Step**: When the client posts a new message, the harness reads the session ID, loads the chat history and ADK state from the DB, runs the LLM model to determine the next step, executes any tool calls synchronously or asynchronously, saves the state, and responds.
- **Asynchronous Execution Loop**: Instead of holding a socket open, the harness runs a proxy loop (`executeAdkProxyLoop`) in the background or triggers it via short polling/webhooks. If the agent needs to call a tool, the proxy harness posts the tool call to a queue, executes it, feeds the results back to the LLM agent, and continues until it reaches a final text answer or user-action directive (e.g. `growerp-action`).
- **Distributed Lock Management**: Uses database-level row locking on the session record to ensure only one thread executes the proxy loop for a given session at a time, preventing concurrency issues while allowing any node in the cluster to handle the request.
