# PHASE 3 — Contratos arquitectónicos

**Estado:** CLOSED (documentación + tests de frontera; sin cambio de comportamiento).  
**Fecha:** 2026-08-24.

Este documento fija los contratos entre Gateway, Agent Runtime y MCP.
No introduce abstracciones nuevas (`Capability`, `ToolLookup`, A2A, Workspace, fleet).

## Fronteras reales (código actual)

| Componente | Dónde | Depende de | No conoce |
|------------|--------|------------|-----------|
| **Agent Runtime** | `hub/src/agents/runtime.ts` | `AgentDefinition`, `LLMProvider`, `AgentRuntimeTools`, `TurnMemory`, `ConfirmationPort` | MCP SDK, Hono, `ws`, SQLite, fs, Excel, `ToolRegistry` (clase) |
| **AgentDefinition** | `hub/src/agents/definition.ts` | prompt, model, `ToolPolicy` | ejecución, Node, MCP, HTTP |
| **ConfirmationPort** | `hub/src/agents/confirmation.ts` | tipos ToolResult | waiter, WS, Hono |
| **ConfirmationWaiter** | `hub/src/sessions/confirmation-waiter.ts` | ConfirmationPort | — (Gateway) |
| **TurnMemory** | `hub/src/memory/types.ts` | — | SQLite |
| **SqliteTurnMemory** | `hub/src/memory/sqlite-turn-memory.ts` | TurnMemory, history.ts | Runtime |
| **ToolRegistry** | `hub/src/tools/registry.ts` | AgentTool | MCP, policy |
| **MCP Adapter** | `mcp-stdio.ts` + `mcp-executor.ts` | SDK MCP | Runtime |
| **Discovery** | `discover.ts` | `McpListToolsClient` estructural, policy, RemoteAgentTool | SDK |
| **Local Node** | `agent/` | MCP Server + Tools | Agent Runtime, LLM |

Composición (`hub/src/index.ts`): Gateway crea `AgentDefinition` + `ToolRegistry` vacío, `attachLocalAgent` descubre MCP (policy de la definition), luego `createAgentRuntime({ agent, memory, llm, tools })`.

En producción **no** hay Tools in-process en el Gateway.

## Contratos

### Gateway

Punto de entrada: clientes, auth, sesiones, WebSocket, routing, Tool Policy, confirmations, lifecycle del Local Node, discovery/adapters MCP, composición del Runtime.

Puede **alojar** el Agent Runtime en el mismo proceso. No son el mismo componente conceptual.

```text
Gateway
  └── Agent Runtime
```

### Agent Runtime

Motor común de razonamiento. Un solo código para todos los Agents futuros.

Recibe un turno → contexto (`TurnMemory`) → LLM → selecciona Tool → `AgentRuntimeTools` → (si `confirm`) `ConfirmationPort.wait` → resultado → eventos.

**No:** descubre MCP, conecta MCP, autoriza Tools, administra sesiones WS, persiste SQLite, filesystem, procesos, Nodes, Workspace, A2A.

### Agent

Actor lógico. Hoy: `AgentDefinition` (prompt, model, toolPolicy) en memoria. **Agent identity is currently configuration-scoped and not yet persistent.**

Puede consumir Tools vía MCP. En el futuro puede hablar con otros Agents vía **A2A** (no implementado).

**No** es el proceso `agent/`. **No** es un MCP Server. **No** posee `filesystem.root`.

### Node

Unidad de ejecución/hospedaje. Puede alojar uno o varios MCP Servers.

```text
Node
 ├── MCP Server: filesystem
 ├── MCP Server: office
 ├── MCP Server: process
 └── MCP Server: custom-domain
```

Hoy: el proceso `agent/` es el **Local Node** (un MCP Server in-process con varias Tools). No hay `nodeId` ni fleet.

**Node ≠ Agent.** El Node no razona.

### MCP Server

Proveedor de Tools. No razona, no tiene conversación de Agent, no sustituye A2A.

Puede vivir en el mismo proceso del Node, otro proceso, otra máquina u otro repositorio. Transporte actual: **stdio**.

### Tool

Acción ejecutable. Término canónico.

`AgentTool` es la representación **interna** (name, description, inputSchema, executionMode, execute). No es el catálogo global.

Producción:

```text
AgentTool.execute → MCP Adapter → MCP Client → MCP Server → implementación
```

### MCP

Frontera **Agent → Tool** (descubrir e invocar).

### A2A

Frontera **Agent → Agent**. **No implementado.** MCP no lo sustituye; A2A no sustituye MCP.

```text
Agent A --A2A--> Agent B --MCP--> MCP Server --> Tools
```

### Workspace

Contexto persistente de trabajo. Frontera en PHASE 5 (`phase5-workspace.md`): **sin persistencia**. No es Conversation, Session ni Context. El Runtime no lo posee.

## Diagramas

```text
Client → Gateway → Agent Runtime --MCP--> MCP Server → Tools
```

Múltiples Agents (futuro):

```text
Agent A --A2A--> Agent B --MCP--> MCP Server → Tools
```

## Responsabilidades de Tools (repartidas)

| Qué | Quién |
|-----|--------|
| Almacenar disponibles para el Runtime | `ToolRegistry` (interno) |
| Descubrir vía MCP | Gateway `discover.ts` |
| Autorizar / `executionMode` | Tool Policy |
| Ejecutar | `AgentTool` → MCP Adapter en producción |
| Confirmar | Runtime + ConfirmationPort; waiter en Gateway |

## Qué no se introduce

Capability (ni Registry/Provider/Manager/Catalog), ToolLookup, A2A, Workspace, fleet, HTTP/SSE MCP, segundo Runtime, Tools in-process en el Gateway.
