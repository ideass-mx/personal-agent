# Fronteras — Agent Platform (PHASE 1)

Las fronteras son **modulares**. **Gateway** es el componente central.
Single Node no duplica código: es Gateway + Agent Runtime + Local Node + MCP en una máquina.

Vocabulario: [`terminology.md`](./terminology.md). PHASE 3: [`phase3-contracts.md`](./phase3-contracts.md). PHASE 4: [`phase4-agent-node.md`](./phase4-agent-node.md). PHASE 5: [`phase5-workspace.md`](./phase5-workspace.md). PHASE 6: [`phase6-agent-definition.md`](./phase6-agent-definition.md). PHASE 7: [`phase7-single-node.md`](./phase7-single-node.md). PHASE 8: [`phase8-agent-node-configuration.md`](./phase8-agent-node-configuration.md). PHASE 10: [`phase10-agent-selection.md`](./phase10-agent-selection.md). PHASE 11: [`phase11-interaction-workspace.md`](./phase11-interaction-workspace.md). PHASE 14: [`phase14-workspace-context.md`](./phase14-workspace-context.md). PHASE 15: [`phase15-workspace-context.md`](./phase15-workspace-context.md). PHASE 16: [`phase16-workspace-http.md`](./phase16-workspace-http.md). PHASE 17: [`phase17-active-workspace.md`](./phase17-active-workspace.md). PHASE 18: [`phase18-workspace-client.md`](./phase18-workspace-client.md). PHASE 19: [`phase19-workspace-ui.md`](./phase19-workspace-ui.md). PHASE 20: [`phase20-workspace-continuity.md`](./phase20-workspace-continuity.md). **Tool** es el concepto canónico.

```text
Clientes (Android Hub protocol | OpenClaw opcional | otros)
        │  WS  packages/protocol
        ▼
┌──────────────────────────────────────────┐
│  GATEWAY  (implementación: hub/)         │
│  HTTP · WS (`attachGateway` = transporte)│
│  auth · sesiones · confirmaciones        │
│  policy · MCP Client · spawn Local Node  │
│  SQLite historial (Conversation)         │
│  ┌────────────────────────────────────┐  │
│  │  AGENT RUNTIME                     │  │
│  │  hub/src/agent/runtime.ts          │  │
│  └────────────────────────────────────┘  │
└────────────────────┬─────────────────────┘
                     │ MCP Client → stdio
                     ▼
┌──────────────────────────────────────────┐
│  LOCAL NODE (precursor: agent/)          │
│  MCP Server · extensions · Tools         │
│  filesystem · process · Excel COM        │
└──────────────────────────────────────────┘
```

Frontera de ejecución MCP-first:

```text
Agent Runtime → MCP Adapter → MCP Client → stdio → MCP Server → Tool
```

stdio es transporte. El Runtime no importa el SDK MCP. El **MCP Adapter** de producción en el Hub es `mcp-stdio.ts` + `mcp-executor.ts`. `discover.ts` usa una interfaz estructural (`McpListToolsClient`), sin SDK.

El Runtime invoca Tools vía `AgentRuntimeTools`. En producción el registry solo contiene `RemoteAgentTool` (MCP). El Runtime **no** ejecuta Tools de negocio in-process.

Frontera de confirmación:

```text
Agent Runtime → ConfirmationPort → ConfirmationWaiter (Gateway) → Client
```

Sin HTTP/SSE MCP, sin registry global de plataforma, sin A2A.

## Gateway

**Sí:** conectividad de clientes, token de dispositivo, sesiones WS, **API HTTP de Workspace** (CRUD y asociación Conversation→Workspace), policy de Tools, descubrimiento MCP, lifecycle del proceso `agent/`, confirmación fail-closed, health HTTP, estado ready.

**No:** razonamiento LLM (eso es Agent Runtime), ejecución OS/Excel (eso es Node / MCP Server), ser el servidor OpenClaw, ser un Agent.

El Agent Runtime **en el mismo proceso** no viola la frontera: el Gateway *aloja* el runtime.

## Agent Runtime

**Sí:** turno, historial vía `TurnMemory`, LLM, selección e invocación de Tools, `ConfirmationPort`, eventos internos.

**No (imports directos ni grafo de valor):** Hono, `ws`, SDK MCP, `node:fs`, `node:child_process`, winax/Excel, `better-sqlite3`.

Acoplamiento residual:

- `AgentRuntimeTools` / `AgentTool` (el Runtime no importa la clase `ToolRegistry` ni el SDK MCP).
- En producción, `execute` es siempre RemoteAgentTool → MCP Adapter. No hay calculator in-process.
- `ConfirmationPort` (`hub/src/agent/confirmation.ts`): contrato del Runtime.
- `ConfirmationWaiter` (`hub/src/http/confirmation-waiter.ts`): Gateway; `ws.ts` traduce frames.
- `TurnMemory` (PHASE 2.1): contrato en `memory/types.ts`; adapter `SqliteTurnMemory` en `sqlite-turn-memory.ts`. El Runtime no importa SQLite.

No crear runtimes por Agent (`BookAgentRuntime`, etc.).

## MCP (frontera de ejecución)

Las acciones ejecutables de un Agent se modelan como Tools disponibles mediante MCP.

No usar «local tool» como concepto arquitectónico. Aritmética: `math.add` / `math.subtract` / `math.multiply` / `math.divide` en el MCP Server.

Un MCP Server provee un **tool set**. El Agent Runtime no ejecuta Tools: solicita invocación vía MCP Adapter.

Agent ≠ MCP Server. El proceso `agent/` hoy es Node + MCP Server, no un Agent.

**Capability** no es un tipo del producto (PHASE 24: Tool es suficiente). `toolPolicy` filtra catálogo y fija `executionMode`; no es Permission System.

## Local Node (`agent/`)

Hospeda MCP Server(s) y ejecuta Tools. No contiene Agent Runtime ni LLM. Sin `nodeId` ni fleet. En Single Node el Gateway **spawnea** este proceso (PHASE 7). PHASE 25: un Node, un MCP Server; sin NodeRegistry. PHASE 26: muerte del Node = fail-closed en `callTool`; `/health.agentReady` es snapshot de boot, no liveness; sin respawn. PHASE 27: Single Node **READY WITH DEBT** (confirmación Hub Android no implementada; health snapshot; shutdown vs WS). PHASE 28: HITL Hub Android (`confirm_request`/`confirm_response`); env del Node filtrado (`childEnvForLocalNode`). PHASE 29: ejecución E2E Tools auditada (Runtime→MCP→Node); schema de negocio no llega al LLM (validación en Node).

## MCP vs A2A

MCP: Agent → Tool. A2A: Agent → Agent. A2A no se implementa. MCP no sustituye A2A.

## Conversation / Workspace / Context

Documentados en `terminology.md`, `phase5-workspace.md` y `phase11-interaction-workspace.md`.

**Workspace** = trabajo persistente. **Conversation** = diálogo; `workspace_id` nullable (`null` = sin Workspace). El Gateway administra Workspace por HTTP. El Runtime no conoce Workspace. **Active Workspace** no existe. Sin `ConversationContext`. Sin `workspaceId` en el protocolo WS. `ToolContext` no es Workspace.

PHASE 30: persistencia Conversation en SQLite (`history.ts`); mensajes solo `user`/`assistant` (tool transcript in-memory por turno). Sin GET HTTP de mensajes Hub. Confirmación solo RAM/Session. Ver [`phase30-conversation-continuity-audit.md`](./phase30-conversation-continuity-audit.md).

PHASE 31: Conversation persistente en Gateway pero **no** unidad de producto end-to-end (sin History API; cross-talk Hub chat; DataStore = cache UX). Ver [`phase31-conversation-product-continuity.md`](./phase31-conversation-product-continuity.md).

PHASE 32: `GET /conversations/:id/messages`; rehidratación Android Hub; `conversationId` en `assistant_chunk`/`error`. Ver [`phase32-conversation-recovery-and-stream-routing.md`](./phase32-conversation-recovery-and-stream-routing.md).

PHASE 33: perímetro Single Node = `HUB_TOKEN` de instalación + policy + confirm + filesystem root + MCP stdio + env Node sin secretos Gateway. Sin User/ACL. Ver [`phase33-security-product-isolation-audit.md`](./phase33-security-product-isolation-audit.md).

PHASE 34: Single Node operable (arranque fail-closed, packaging, Conversation recovery, HITL). Deuda ops: health snapshot, shutdown WS, sin instalador/CI, FS root opcional, docs. Ver [`phase34-product-operational-completeness-audit.md`](./phase34-product-operational-completeness-audit.md).

PHASE 35: exit de arquitectura — **MVP-READY WITH DEBT**. Criterios A–G PASS; sin B/C; no nuevas abstracciones; siguiente trabajo = producto (Hub-first UX, HITL, docs). Ver [`phase35-mvp-readiness-and-architecture-exit.md`](./phase35-mvp-readiness-and-architecture-exit.md).

## Seguridad que no se toca

Confirmación fail-closed, comparación de token timing-safe, filesystem root, tool policy deny-by-default, input congelado en confirmación, binding sesión/dispositivo.
