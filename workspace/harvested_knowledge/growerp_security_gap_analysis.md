# GrowERP Security, Authentication, & Multitenancy Gap Analysis

This document details a targeted technical analysis of the security, authentication, and multitenancy architecture across the `moqui-adk`, `moqui-mcp`, and `growerp` components in the local environment, specifically highlighting the "Security Isolation Gap" of direct, un-harnessed tool calls.

---

## 1. Executive Summary

The current integration of Google ADK and MCP transport layers inside the GrowERP ecosystem bridges Moqui's service framework with background-running AI agents. 

However, because the ADK agents execute on background thread pools (e.g. RxJava/IO schedulers) that sever the user's thread-local `ExecutionContext`, they resort to executing tools as the **`SystemSupport`** superuser. Furthermore, the tenant context (`ownerPartyId`) is passed as an LLM argument without being verified against the initiating user's context.

This design introduces a critical **Security Isolation Gap**, bypassing Moqui's Artifact Authorization (ArtifactAuthz) checks and opening vulnerabilities to privilege escalation and cross-tenant data leakage. Transitioning to a **stateless Orchestration Harness** guarantees that every tool call runs strictly inside the user's authentic permissions and validates tenant ownership before execution.

---

## 2. Technical Findings

### A. Ingestion, Validation, and Tracking of User Authentication Tokens

Incoming HTTP/REST requests to MCP endpoints (/mcp/*) are routed through the filter [`org.moqui.impl.webapp.MoquiAuthFilter`](file:///home/byersa/IdeaProjects/aitree-project/framework/src/main/groovy/org/moqui/impl/webapp/MoquiAuthFilter.groovy), which invokes [`UserFacadeImpl.initFromHttpRequest()`](file:///home/byersa/IdeaProjects/aitree-project/framework/src/main/groovy/org/moqui/impl/context/UserFacadeImpl.groovy#L95) to ingest and validate credentials:

1. **Token Ingestion Channels**:
   - **HTTP Basic Authentication**: Reads the `Authorization: Basic <credentials>` header, decodes the base64 payload, and logs in using Shiro (`loginUser(username, password)`).
   - **API / Login Key Headers**: Inspects headers named `api_key` or `login_key`.
   - **Query String / Form Parameters**: Fallbacks to inspect query string parameters or secure POST parameters for keys named `api_key` or `login_key`.
   - **Direct Credentials Parameters**: Inspects `authUsername` and `authPassword` from request parameter maps.

2. **Validation**:
   - For `api_key`/`login_key` logins, Moqui hashes the input key using the configured hash type (`eci.ecfi.getLoginKeyHashType()`) and queries the `moqui.security.UserLoginKey` table.
   - It checks the key expiration by validating `nowDate <= thruDate`.
   - Once validated, it calls `internalLoginUser(username)` to establish a Shiro subject context.

3. **Tracking**:
   - Web sessions are tracked using Moqui's standard HTTP session cookies and mapped to a `moqui.visitId` in the servlet session attributes.
   - Active streams are tracked by `EnhancedMcpServlet` using the custom `Mcp-Session-Id` header to map the connection to a registered `McpSession` inside `McpSessionAdapter`.

---

### B. LLM Tool Call Execution Context (The Privilege Context)

When an LLM agent triggers a tool call (FunctionTool execution), the execution context is mapped as follows:

1. **System/Root Elevation**:
   - Background tools (such as [`EmailTool`](file:///home/byersa/IdeaProjects/aitree-project/runtime/component/moqui-adk/src/main/groovy/org/moqui/adk/EmailTool.groovy)) run in dedicated background threads (e.g. `Thread t = new Thread({ ... }, 'adk-email-send')`).
   - Because thread-local `ExecutionContext` state is lost on new threads, the tool explicitly overrides the active user by logging in as the root/system user:
     ```groovy
     ec.user.internalLoginUser('SystemSupport')
     ```
   - Consequently, **tool executions do not run within the user's explicit permissions**. They run under the `SystemSupport` superuser context, which has access to all services, data schemas, and API operations.

---

### C. Multitenancy and Tenant Data Isolation

1. **GrowERP Multitenancy Model**:
   - GrowERP uses a shared-database model with logical tenant isolation. Data separation relies on the `ownerPartyId` field (acting as the `tenantId`) present on business entities.
   - Business services filter data using the active tenant's `ownerPartyId` derived from the user's active session.

2. **Logical Isolation Vulnerability**:
   - In [`AdkManager.groovy`](file:///home/byersa/IdeaProjects/aitree-project/runtime/component/moqui-adk/src/main/groovy/org/moqui/adk/AdkManager.groovy), the active tenant ID `{tenantId}` is fed to the LLM agent's prompt context during session setup.
   - The agent is instructed to pass this ID as an argument to tools (e.g., `ownerPartyId`).
   - Inside [`EmailTool.groovy`](file:///home/byersa/IdeaProjects/aitree-project/runtime/component/moqui-adk/src/main/groovy/org/moqui/adk/EmailTool.groovy), the service retrieves the server config based on the passed parameter:
     ```groovy
     def es = ec.entity.find('moqui.basic.email.EmailServer')
             .condition('emailServerId', ownerPartyId).one()
     ```
   - **The Vulnerability**: Since the background thread runs as `SystemSupport`, it bypasses standard user access limits. If the LLM is hijacked via prompt injection and passes a different tenant's `ownerPartyId`, the service will operate on that other tenant's configuration. There is no verification on the server that the initiating user actually belongs to the passed `ownerPartyId`.

---

## 3. The Security Isolation Gap

The stateful, direct-streaming setup bypasses traditional security boundaries, creating a significant **Security Isolation Gap**:

```
[User Session]  --> [EnhancedMcpServlet (Auth Filter)] --> [RxJava Threads (ADK Runner)]
                                                                    |
                                                      (CONTEXT DISSOCIATION)
                                                                    |
[Target Entity] <-- [Elevated SystemSupport Context]   <-- [Tool (e.g. EmailTool)]
  (NO AUTHZ/TENANT VALIDATION ON USER PERMISSIONS)
```

### Artifact Authorization (ArtifactAuthz) Bypass
Moqui's Artifact Authorization checks are bound to the active user's `UserFacade` roles and permissions. By executing tool logic under `SystemSupport`:
- The user can trigger tools that execute services or access entities they are not authorized to view.
- ArtifactAuthz filters cannot reject the request because the thread-local context claims the caller is `SystemSupport`.
- Privilege escalation is trivial: the user asks the agent to view data, and the agent calls a tool that logs in as a superuser and prints the results back to the user.

---

## 4. The Stateless Orchestration Harness Solution

A stateless, database-backed Orchestration Harness solves the Security Isolation Gap by executing tool turns inside an authentic, non-elevated user context:

```
[User Request]  --> [Orchestration Harness] ----------------------------> [Moqui EC]
                           |                                                |
              (HYDRATE USER & TENANT FROM DB)                               |
                           |                                                |
                           v                                                v
             [Validate Tool Arguments] --> (Run Tool) --> [ArtifactAuthz Check Enforced]
             (Assert argument.ownerPartyId == ec.user.tenantId)
```

1. **Stateless Request Authentication**:
   - For every step of the agent execution loop, the harness re-authenticates the client using their cached login credentials, restoring the user's authentic `UserFacade` state on the execution thread.

2. **Enforcing User-Level Permission Boundaries**:
   - The harness executes the tool directly under the authenticated user's context.
   - No `SystemSupport` elevation is allowed. Moqui's native Shiro integration and ArtifactAuthz automatically intercept entity/service requests. If the user doesn't have the required permissions, the call throws an `ArtifactAuthorizationException` immediately.

3. **Strict Tenant Context Verification**:
   - The harness validates the arguments of every tool call before execution.
   - It asserts that the `ownerPartyId`/`tenantId` passed in the tool arguments matches the user's active tenant ID in the `ExecutionContext`. If there is a mismatch, the harness aborts execution, preventing cross-tenant injection.
