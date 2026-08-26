# PHASE 25 — MCP Server / Node Topology Audit

**Estado:** AUDIT CLOSED / NO CODE CHANGE  
**Fecha:** 2026-08-25.

**Decisión: A — Arquitectura actual suficiente.** Un Gateway + un Local Node + un MCP Server. Sin consumidor de Distributed, NodeRegistry, `nodeId` ni varios MCP Servers.

---

## Topología real

```text
Gateway process (hub/)
├── HTTP / WS / Sessions / ConfirmationWaiter
├── AgentDefinition + Agent Runtime
├── ToolRegistry (RemoteAgentTool)
├── MCP Client / Adapter (mcp-stdio + mcp-executor)
└── attachLocalAgent  →  spawn hijo
         │ stdio
         ▼
Local Node process (agent/)
└── startLocalAgent
    ├── ToolRegistry (Extensions → AgentTool)
    └── un MCP Server (createAgentMcpServer)
        └── execute
```

`npm run hub` / `dev` / `hub.cjs` es Single Node (PHASE 7): dos procesos, una máquina. `npm run agent` es el Node **solo** (stdio en stdin), no el stack completo.

Node ≠ Agent ≠ Runtime ≠ MCP Server ≠ Workspace.

---

## Ownership

| Qué | Quién |
|-----|--------|
| Crea el proceso `agent/` | Gateway: `connectAgentStdioClient` (`StdioClientTransport` spawn). Comando: `resolveAgentLaunch()` (tsx en dev, `dist/agent/agent.cjs` empaquetado). |
| Lifecycle del hijo | Gateway `LocalAgentHandle.shutdown()` → `client.close()`. El Node, al cerrar el transport, `startLocalAgent` shutdown (abort process.execute, Excel COM, `mcp.close`). |
| `filesystem.root` | Node: `loadNodeConfig()` lee `AGENT_FILESYSTEM_ROOT`. El Gateway puede inyectarlo (`attachLocalAgent.filesystemRoot` o env heredado). `index.ts` de producción **no** pasa `filesystemRoot`; hereda `process.env`. |
| MCP Server | Instancia **dentro** del proceso Node. Lifecycle = proceso. Nombre MCP `mxideass-agent` (etiqueta, no `serverId`). |
| Extensions / Tools del Node | `createDefaultToolRegistry` al arrancar `startLocalAgent`. El core no registra tools por nombre. |
| Tools del Gateway | `registerDiscoveredAgentTools` tras `tools/list`. |

El Node **no** conoce Conversation, Workspace, Session, AgentDefinition ni WS. `ToolContext` solo trae `conversationId`/`deviceId` en el envelope MCP (datos de invocación, no dominio persistente).

Estado en el Node: efímero (procesos hijos, lock Excel). Sin SQLite de hilos.

---

## `attachLocalAgent`

Nombre **histórico**: adjunta el **Local Node** (MCP), no un Agent lógico. No rename masivo.

Hace: spawn → `client.connect` (initialize) → `tools/list` + policy → registry Gateway → `ready`.  
Spawn/initialize fallan → `HubAgentError`, cierra transport. Discovery falla → cierra hijo.  
Disconnect tras READY: `cancelAllConfirmations`; `onDisconnected` opcional. **`index.ts` no registra `onDisconnected`.** No hay respawn.

---

## tools/list y ejecución

```text
availability     Node MCP tools/list
authorization    toolPolicy en registerDiscoveredAgentTools
registration     ToolRegistry Gateway (ya filtrado)
confirmation     Runtime + ConfirmationWaiter (turno)
execution        Node AgentTool.execute vía callTool
```

`ToolRegistry` del Gateway = catálogo **ya filtrado** y ejecutable (`RemoteAgentTool`). No autoriza de nuevo. Conservar.

---

## Lifecycle

**Boot:** Definition + registry vacío → attach (spawn, handshake, list, policy) → Runtime + HTTP (`agentReady` snapshot al arrancar) → `[hub] READY`.

**Turno:** `user_message` → Runtime → get tool → MCP o confirm → resultado.

**Shutdown Gateway:** SIGINT/SIGTERM → `http.close()` → `agent.shutdown()` → Node exit. Idempotente.

---

## Fallos (comportamiento actual)

| Caso | Qué pasa | ¿OK? | Código ahora |
|------|----------|------|----------------|
| 1 Spawn no arranca | `agent_spawn_error` / startup; Hub no llega a READY | Sí | No |
| 2 Handshake MCP falla | `mcp_initialize_error`; hijo cerrado | Sí | No |
| 3 `tools/list` / policy falla | `mcp_discovery_error`; hijo cerrado | Sí | No |
| 4 Node muere tras READY | Confirmaciones canceladas; `callTool` → `agent_disconnected` o remote error; **sin retry** | Fail-closed correcto | No respawn (deuda: `/health` `agentReady` no se actualiza; `index` sin `onDisconnected`) |
| 5–6 Tool error | `ToolResult` ok:false / timeout MCP | Sí | No |
| 7 Gateway pierde el hijo | Igual que 4 | Sí | No |
| 8 Gateway reinicia | Nuevo spawn + discovery; SQLite de Conversation sigue | Sí | No |
| 9 WS sigue con Node caído | Socket vivo; tools fallan; confirms canceladas | Aceptable | No “MCP Gateway” |
| 10 Cliente reconecta tras restart | Nueva Session; mismo `conversationId` si lo reenvía | Sí | No |

No inventar recovery.

---

## ¿Varios Nodes / varios MCP Servers?

**No.** Un hijo, un `McpServer`. Varias Extensions ≠ varios Servers. Sin consumidor de routing.

---

## Seguridad

Sin PermissionManager. Policy en discovery. Confirmation en el turno. Ejecución en el Node. Quien hable stdio al Node elude el Gateway: la frontera de producto es el spawn del Gateway.

---

## Fronteras

Runtime: sin SDK MCP, Node, fs, child_process, Hono, WS, SQLite.  
Node: sin Workspace, Session, AgentDefinition, WS.  
MCP Server: no es Agent, Runtime, Workspace ni registry de plataforma.

---

## Tests ya cubiertos

`lifecycle-9a` (spawn, muerte, shutdown, señales, tool_not_found). MCP/policy/confirmation fail-closed. `smoke:package` (handshake + list + read). PHASE 4/7/24 docs.

Este PHASE: test documental de topología.

---

## Deuda (documentar, no implementar)

- Nombres `attachLocalAgent` / `LocalAgent` / logs «Agent READY».
- `agentReady` en `/health` es snapshot.
- Sin respawn; ToolRegistry no se vacía al disconnect.
- `filesystemRoot` no se pasa desde `index.ts` (solo env).

---

## PHASE 26

No Distributed. No NodeRegistry. Solo si un producto exige un segundo Node o un segundo MCP Server. Si no: detenerse.
