# PHASE 6 — Agent Definition

**Estado:** CLOSED (definición mínima en memoria; un Runtime; sin registry ni IDs persistentes).  
**Fecha:** 2026-08-24.

## Auditoría

Configuración que estaba **mezclada**:

| Dónde | Qué | Debería ser |
|-------|-----|-------------|
| `hub/src/agent/prompts.ts` | `SYSTEM_PROMPT`, `AGENT_NAME` | **Agent** |
| `hub/src/config.ts` `model` | modelo LLM | **Agent** (estaba junto a puerto, token, SQLite) |
| `DEFAULT_TOOL_POLICY` | tools permitidas + executionMode | **Agent** (se aplicaba en discovery del Gateway) |
| `config.maxTokens`, API key | proveedor | **Gateway** / proveedor |
| `config.port`, `hubToken`, `dbFile` | HTTP/auth/persistencia | **Gateway** |
| `AgentConfig.filesystem.root` (`agent/src/config.ts`) | contención de paths | **Node** |
| `attachLocalAgent` / `LocalAgent` / `startLocalAgent` | spawn MCP stdio | **Node** lifecycle (nombre histórico) |
| `TurnMemory` / Conversation | historial | **Gateway**; no es Agent Definition |

## Pertenencia

**Agent:** `prompt`, `model`, `toolPolicy` (`AgentDefinition`).  
**Node:** proceso `agent/`, `filesystem.root`, MCP Server, lifecycle.  
**Gateway:** composición, WS, SQLite, MCP Client/Adapter, policy *enforcement* en discover, confirmações, alojar el Runtime.

## Modelo

```text
                    Gateway
                       │
                 Agent Definition
                       │
                       ▼
                 Agent Runtime
                       │
                       ▼
                      MCP
                       │
                       ▼
                      Node
                       │
                 ┌─────┴─────┐
                 │           │
             MCP Server   MCP Server
                 │           │
               Tools       Tools
```

Hoy hay **un** MCP Server in-process en el Local Node.

```text
Agent ─────────────── A2A ──────────────> Agent     (no implementado)
  │
  │ MCP
  ▼
 Tool
```

Nunca Agent → MCP → Agent como A2A.

## Contratos

`hub/src/agent/definition.ts`:

- `prompt`, `model`, `toolPolicy`
- Sin `agentId`, `workspaceId`, `conversationId`, `nodeId`, root, port, process
- No ejecuta turnos ni Tools

`createAgentRuntime({ agent, memory, llm, tools })`. Confirmation sigue en el turno (`ConfirmationPort`).

Si `agent` se omite (tests), se usa `createDefaultAgentDefinition()` (mismo prompt/modelo/policy de siempre).

La policy **no** se re-aplica en el Runtime: el catálogo ya viene filtrado por discovery. ToolRegistry ≠ Agent Definition.

**Agent identity is currently configuration-scoped and not yet persistent.**

## Node vs Agent

`filesystem.root` **no** está en `AgentDefinition`. Vive en `AgentConfig` del proceso `agent/` (Local Node).

No rename de `agent/`. No proceso extra para el Runtime (sigue en el Gateway).

## Workspace

Sin acoplar. Definition no tiene `workspaceId`. PHASE 5 intacta.

## Single Node

Misma implementación. Distributed es topología futura, no código duplicado.

## Decisiones

- Un `createAgentRuntime`.
- Sin AgentRegistry, NodeRegistry, fleet, A2A, WorkspaceStore, Knowledge, Tools in-process.
- Protocolo WS sin `agentId`/`nodeId`.
- `maxTokens` y API key permanecen en config del proveedor/Gateway.

## Aplazado

Varios Agents simultáneos, persistencia de Agent, `agentId` en protocolo, packaging Single Node (PHASE 7), multi-Node, A2A.
