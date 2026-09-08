# PHASE 2 — Auditoría de contratos y fronteras

**Estado:** PHASE 2.1–2.4 DONE. PHASE 3 contratos CLOSED.  
**PHASE 1:** no se reabre.  
**Código de verdad:** `hub/src/**`, `agent/src/**`.  
**Fecha:** 2026-08-24.

Nombres en código (no inventados): `AgentTool`, `ToolRegistry`, `ConfirmationPort`, `TurnMemory`, `RemoteAgentTool`.  
**Tool** es el término canónico de diseño. `AgentTool` / `ToolRegistry` son la representación interna actual. **Capability** y **ToolLookup** están cancelados.

---

## 1. Executive Summary

- El Runtime ya **no** importa Hono, `ws`, MCP SDK, SQLite, `node:fs` ni Excel. Eso es PHASE 1.
- `AgentTool` es a la vez **descriptor para el LLM**, **modo de confirmación** y **función `execute`**. Es la representación interna actual de una **Tool**.
- `ToolRegistry` es un **Map** (`register` / `get` / `list`). No autoriza, no confirma, no ejecuta, no habla MCP. No es el registry global de la plataforma.
- Autorización = `DEFAULT_TOOL_POLICY` + `registerDiscoveredAgentTools` (Gateway bootstrap). El Runtime solo **lee** `executionMode`.
- `ConfirmationPort.wait` es el único contrato del Runtime. `createConfirmationWaiter` vive en `hub/src/sessions/confirmation-waiter.ts` (Gateway). WS traduce frames.
- `TurnMemory` **PHASE 2.1 COMPLETED:** contrato en `memory/types.ts`; `SqliteTurnMemory` / `createSqliteTurnMemory()`; `index.ts` es composition root. Runtime no importa `history.ts` ni SQLite.
- **PHASE 2.4:** no hay `calculatorTool` in-process. Aritmética: `math.*` en el MCP Server. El registry del Hub se llena solo por discovery MCP (`RemoteAgentTool`).
- **MCP Adapter** (`mcp-stdio.ts` + `mcp-executor.ts`) es el único código de producción del Hub que importa el SDK MCP. `discover.ts` usa `McpListToolsClient` estructural.
- El Runtime usa `AgentRuntimeTools` (get/list). No importa la clase `ToolRegistry`. No es ToolLookup.
- **No** introducir Capability, CapabilityProvider ni ToolLookup.

---

## 2. Current Architecture

Proceso Hub (`hub/` = Gateway de hecho; aloja Agent Runtime + MCP Client):

1. `index.ts` crea `ToolRegistry` vacío, `attachLocalAgent` (MCP stdio + discovery + policy).
2. Compone `TurnMemory` (`createSqliteTurnMemory()`).
3. `createAgentRuntime({ memory, llm, tools })`.
4. `startServer` → `attachGateway` (WS). Cada turno: `createConfirmationWaiter` → `runtime.runTurn({ confirmation: waiter.port })`.

Proceso Agent (`agent/` = Local Node + MCP Server; **no** es un Agent):

- Otro `AgentTool` + otro `ToolRegistry` (copia de forma, **no** importan el Hub).
- MCP Server stdio ejecuta `tool.execute`.
- `executionMode` en el Agent **lo ignora el Hub** (comentado en tools Agent).

```text
WS client
  → attachGateway (ws/index.ts)
  → AgentRuntime.runTurn
       → TurnMemory
       → LLMProvider
       → ToolRegistry.get/list
            → AgentTool.execute
                 → createRemoteAgentTool → McpRemoteExecutor → stdio → MCP Server → Tool
       → ConfirmationPort.wait  (solo si executionMode === "confirm")
  ← confirm_request / assistant_* frames
```

Modelo objetivo (frontera lógica; no implica procesos nuevos):

```text
Agent → Agent Runtime → MCP Client → MCP → MCP Server → Tool
```

---

## 3. AgentTool Analysis

### A. Definición

`hub/src/tools/types.ts`:

```ts
interface AgentTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  executionMode: "automatic" | "confirm";
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}
```

`ToolContext`: `{ conversationId, deviceId? }`.  
`ToolResult`: `{ ok: true, content } | { ok: false, error: { code, message } }`.

Copia estructural: `agent/src/tools/types.ts` (mismo shape; comentario: no importa el Hub).

Invariantes observados:

- `execute` no lanza hacia el Runtime: `executeToolSafe` atrapa excepciones.
- Remotas: `createRemoteAgentTool` clona JSON-safe input/result (`hub/src/tools/remote.ts`).
- `executionMode` en Hub-remote lo **estampa la policy**, no el `tools/list` MCP.
- Registry: nombre único (`Tool ya registrada`).

### B. Consumidores

| Rol | Quién | Evidencia |
|-----|--------|-----------|
| Agent Runtime | `tools.get` / `list` / `execute` | `hub/src/agents/runtime.ts` |
| Gateway bootstrap | `index.ts` + `registerDiscoveredAgentTools` | `index.ts`, `discover.ts` |
| Transport WS | no usa `AgentTool` | `ws.ts` solo Runtime events |
| MCP (Hub) | `createRemoteAgentTool` + `mcp-executor.ts` detrás de `execute` | `remote.ts`, `mcp-executor.ts` |
| MCP (Agent) | `agent/src/mcp/server.ts` registra `AgentTool` local | |
| Tool implementation | Agent extensions (MCP Server) | `agent/src/tools/*` |
| Tests | runtime, registry, remote, e2e, security | `hub/tests/**` |

### C. Responsabilidades mezcladas

`AgentTool` **es** una Tool ejecutable en el modelo interno actual. En el mismo objeto conviven:

- metadata LLM (`name`, `description`, `inputSchema`);
- señal de confirmación (`executionMode`);
- ejecución (`execute`).

No es discovery (eso es MCP `listTools` + `discover.ts`).  
No es autorización (eso es `tool-policy.ts`).  
No es confirmación (eso es `ConfirmationPort`).

### D. Dependencias

```text
AgentTool (tipo) → ToolContext, ToolResult, JsonSchema
createRemoteAgentTool.execute → RemoteToolExecutor → MCP Client
Agent-side execute → fs / child_process / winax (proceso Agent)
```

El **tipo** Hub no depende de MCP/WS/SQLite.

### E. Conclusión

**Debe permanecer** como contrato interno actual.  
**No** convertirlo en Capability.  
**No** sustituirlo por ToolLookup.  
La migración completa `AgentTool` → consumo solo-MCP **no** es PHASE 2.2; requiere la frontera MCP bien definida primero.

---

## 4. ToolRegistry Analysis

**Definición:** `hub/src/tools/registry.ts` — clase, `Map<string, AgentTool>`.  
**API:** `register`, `get`, `list`. Nada más.

**Instancia:** una por proceso Hub, en `index.ts` (tests crean las suyas). Registry interno, no catálogo de plataforma.

**Registro:**

- remotas en `registerDiscoveredAgentTools` (`discover.ts`) tras `client.listTools()` y policy.

**Discovery:** MCP `listTools` + Hub `discover.ts`. El Registry no descubre.

**Selección:** LLM elige `name`; Runtime hace `get(name)`.

**Autorización:** `DEFAULT_TOOL_POLICY`; tools MCP sin entrada se **omiten** (`if (executionMode === undefined) continue`). Deny by default. Registry no filtra en `get`.

**Confirmación:** Runtime, no Registry.

**Ejecución:** Runtime llama `tool.execute`. Registry no ejecuta.

**Metadata LLM:** `toLLMToolDescriptor` (`descriptor.ts`) sobre `list()`; strip de `execute` y `executionMode`.

**Flujo real:**

```text
register     → index.ts + discover.ts → ToolRegistry.register
discovery    → MCP listTools + discover.ts
selection    → LLM + Runtime.get
authorization→ tool-policy.ts (bootstrap), no por turno
confirmation → Runtime + ConfirmationPort
execution    → AgentTool.execute
result       → Runtime → LLM → WS
```

Copia: `agent/src/tools/registry.ts` (+ `registerExtension`) — registry **del MCP Server**, no del Agent Runtime.

No reemplazar `ToolRegistry` por una interfaz equivalente (`ToolLookup`) solo por abstracción.

---

## 5. ConfirmationPort Analysis

**Interfaz** (`hub/src/agents/confirmation.ts`):

```ts
interface ConfirmationPort {
  wait(request: ConfirmationRequest): Promise<ConfirmationOutcome>;
}
```

Runtime **solo** usa `wait` + yield `confirm_request`. Fail-closed si faltan `confirmation` o `sessionId`.

**Implementación:** `createConfirmationWaiter` en `hub/src/sessions/confirmation-waiter.ts`. Pending in-memory, timeout 60s, `structuredClone` del input, binding `sessionId`/`deviceId`, `respond` / `cancelAll`.

**Quién llama `wait`:** `createAgentRuntime` / `runTurn`.  
**Quién implementa:** waiter.port.  
**Quién llama `respond`:** `ws/index.ts` en `confirm_response`.

**¿Limpia?** **YES** para PHASE 2.3: contrato en Runtime; waiter en Gateway. El Runtime no importa el waiter ni WebSocket.

**Camino a WS:**

```text
runTurn yield confirm_request
  → attachGateway send { type: confirm_request, ... }
cliente confirm_response { confirmationId, approved }
  → waiter.respond(...)
  → wait() resuelve
  → Runtime execute congelado o error
```

---

## 6. TurnMemory Analysis

**PHASE 2.1 COMPLETED.** Contrato en `hub/src/memory/types.ts`; adapter `SqliteTurnMemory`. Runtime no define persistencia ni importa SQLite.

`TurnMemory` cubre historial de **Conversation**. No es Workspace. No es Context.

---

## 7. Calculator / math.* Analysis

**PHASE 2.4 DONE.** `calculatorTool` eliminado del Gateway.

Superficie pública: `math.add`, `math.subtract`, `math.multiply`, `math.divide` en el MCP Server (`agent/src/tools/math.ts`), policy `automatic`.

El Runtime no registra ni ejecuta aritmética in-process. `AgentTool.execute` en producción es `RemoteAgentTool`.

---

## 8. Dependency Graph (verificado)

```text
hub/src/index.ts
  ├── new ToolRegistry()
  │     └── attachLocalAgent → discover.ts
  │           ├── DEFAULT_TOOL_POLICY
  │           ├── MCP Client.listTools
  │           └── createRemoteAgentTool → mcp-executor → stdio
  ├── createAgentRuntime
  │     ├── TurnMemory  ← SqliteTurnMemory
  │     ├── LLMProvider ← providers/anthropic.ts
  │     └── ToolRegistry (import type + get/list/execute)
  └── startServer → attachGateway
        └── createConfirmationWaiter
              ├── .port → ConfirmationPort  → Runtime.wait
              └── .respond ← ws confirm_response
              (createConfirmationWaiter en sessions/confirmation-waiter.ts)

runtime.ts NO → hono | ws | MCP SDK | better-sqlite3 | node:fs | winax
```

```text
AgentRuntime
  ├── ToolRegistry.get/list     → AgentTool.execute
  │                                 └── RemoteAgentTool → MCP → Local Node
  ├── ConfirmationPort.wait     → ConfirmationWaiter (sessions/confirmation-waiter.ts)
  │                                 └── WS frames (ws.ts)
  └── TurnMemory                → SqliteTurnMemory → SQLite
```

---

## 9. Responsibility Matrix

`X` = ownership real, no “puede invocar”.

| Responsabilidad | Agent Runtime | ToolRegistry | AgentTool | Gateway | Transport | MCP | SQLite |
| --------------- | ------------- | ------------ | --------- | ------- | --------- | --- | ------ |
| ejecutar tool   | X (orquesta)  |              | X (hace)  |         |           | X (si remote) | |
| registrar tool  |               | X (almacena) |           | X (bootstrap) |      |     |        |
| descubrir tool  |               |              |           | X (discover) |       | X (listTools) | |
| metadata        | X (envía al LLM) |           | X (campos)|         |           | X (list schema) | |
| autorización    |               |              |           | X (policy) |        |     |        |
| confirmación    | X (orquesta)  |              |           | X (waiter+sesión) | X (frames) | | |
| persistencia    | X (llama puerto) |            |           | X (compone adapter) | |     | X |
| transporte      |               |              |           |         | X (WS)    | X (stdio) | |

---

## 10. Architectural Decisions

### Decision 1 — ¿`AgentTool` permanece?

**YES** (forma actual). Representación interna de Tool. No eliminar. No migrar aún a “solo MCP”.

### Decision 2 — ¿Debe existir `Capability`?

**NO.** Cancelado. El concepto canónico es **Tool**. No CapabilityRegistry / Manager / Provider / Catalog.

### Decision 3 — ¿`ToolRegistry` responsabilidad única?

**YES** el objeto Registry interno. **NO** el “subsistema tools” (policy + discover + remote + runtime). No es el registry de plataforma.

### Decision 4 — ¿Introducir `ToolLookup`?

**NO.** Cancelado. No reemplazar ToolRegistry por una interfaz equivalente solo por abstracción. Antes hace falta la frontera MCP.

### Decision 5 — ¿`ConfirmationPort` frontera limpia?

**YES.** Contrato en `agent/confirmation.ts`; waiter en `sessions/confirmation-waiter.ts`. PHASE 2.3 DONE.

### Decision 6 — ¿`TurnMemory` frontera limpia?

**YES** para PHASE 2.1 (puerto + adapter nombrado; Runtime sin SQLite).

### Decision 7 — ¿Calculator in-process?

**NO.** PHASE 2.4: unificado en `math.*` vía MCP.

### Decision 8 — MCP vs A2A

MCP = Agent → Tool. A2A = Agent → Agent. No implementar A2A. No usar MCP como A2A.

### Decision 9 — Agent vs MCP Server

Agent razona. MCP Server provee Tools. El proceso `agent/` actual es MCP Server, no Agent.

---

## 11. PHASE 2 Sequence

```text
PHASE 2.1  TurnMemory
           STATUS: COMPLETED

PHASE 2.2  MCP-first execution boundary
           STATUS: DONE

PHASE 2.3  Confirmation boundary
           STATUS: DONE
           ConfirmationPort en Agent Runtime.
           ConfirmationWaiter en Gateway (http/).
           Timeout 60s y fail-closed sin cambios.

PHASE 2.4  MCP-only tool execution
           STATUS: DONE
           calculatorTool eliminado.
           math.add/subtract/multiply/divide en MCP Server.
           Registry Hub = solo RemoteAgentTool.
```

Después (roadmap de refactor, no ahora): MCP normalization, Agent/Node topology, Workspace, Agent definitions, A2A, Multi-node.

**No continuar automáticamente con PHASE 3.**

---

## 12. Risks

- Confundir `AgentTool` Hub vs Agent (dos tipos, misma forma).
- Meter autorización en Registry o Runtime.
- Reintroducir Capability o ToolLookup.
- Tratar MCP como A2A (Agent → Agent).
- Tratar el proceso `agent/` como un Agent.
- Mover waiter y tocar `attachGateway` / protocolo (ya no: waiter está en http/).
- Unificar calculator y math (hecho en 2.4).
- Tratar `executionMode` del Agent como policy (el Hub la pisa).
- Convertir Context en almacenamiento persistente.

---

## 13. Non-goals

- Android, Gateway legacy, protocolo WS, transporte MCP, rename `hub/`, `attachGateway`, Capability, ToolLookup, A2A, Workspace en código.

---

## Pregunta de cierre (histórica; 2.1 ya hecha)

**¿Cuál es la mínima extracción para contratos limpios Tools / Confirmation / Memory sin tocar protocolo ni infra externa?**

- **Tools:** contrato interno (`AgentTool` + `ToolRegistry` almacén). PHASE 2.2 aclara el modelo Tool/MCP **en docs**, sin ToolLookup ni migración.
- **Confirmation:** extraído en 2.3 (`ConfirmationPort` vs `ConfirmationWaiter`).
- **Memory:** extraído en 2.1.
