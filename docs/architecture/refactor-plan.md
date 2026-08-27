# Plan de refactor — Agent Platform (Gateway)

**Estado:** PHASE 2.1–2.4 DONE. PHASE 3 contratos CLOSED. PHASE 4 Agent/Node topology CLOSED.  
**Prioridad:** el código ejecutable manda sobre este documento y sobre auditorías previas.  
**Vocabulario canónico:** Agent · Agent Runtime · Tool · MCP · MCP Server · MCP Client · A2A · Gateway · Workspace · Conversation · Context · Node · Agent Platform.  
**Cancelado:** Capability (y CapabilityRegistry / Manager / Provider / Catalog). **Cancelado:** ToolLookup.  
**Prohibido en artefactos nuevos:** la expresión «Control Plane». El componente central se llama **Gateway**. «Local tool» no es concepto arquitectónico.

`ARCHITECTURE_AUDIT.md` **no está en el repositorio**. Este plan se ancla en el código actual (`hub/`, `agent/`, `mobile/android/`, `packages/protocol/`) y en la auditoría de arquitectura. Donde choquen, gana el código. Glosario: [`terminology.md`](./terminology.md).

---

## 1. Inventario del repositorio (PHASE 0)

### 1.1 Árboles productivos observados

| Ruta | Rol actual (código) | Rol futuro (vocabulario) |
|------|---------------------|---------------------------|
| `hub/` (`@mxideass/hub`) | Proceso único: WS, auth, Agent Runtime, policy, MCP Client, SQLite, spawn del proceso local | **Gateway** (mismo proceso; fronteras internas) + **Agent Runtime** alojado |
| `agent/` (`@mxideass/agent`) | Proceso MCP stdio: extensions, filesystem, process, Excel COM | Precursor de **Local Node** + **MCP Server** in-process (no es un Agent) |
| `mobile/android/` | Cliente Compose; backend Hub **o** OpenClaw | UI móvil; no es Gateway |
| `web/` (`@mxideass/agent-console`) | Agent Console SPA (Vite/React); cliente USE+MANAGE | UI Web principal (PHASE 50); no Runtime/MCP |
| `desktop/` | Electron tray / first-run / Control Center (PHASE 48–51) | Launcher mínimo; Agent Console = UI principal; sin Chat |
| `packages/protocol/` | Contrato WS clientes ↔ Hub | Contrato clientes ↔ **Gateway** (rename de protocolo: más tarde) |
| `db/migrations/` | Schema SQLite conversaciones/dispositivos | Precursor de persistencia de **Conversation**; **Workspace** no existe aún |
| `scripts/build.mjs`, `package.mjs`, `smoke-package.mjs` | `dist/hub/hub.cjs` + `dist/agent/agent.cjs` | Empaquetado **Single Node** |
| `docs/` | Arquitectura, roadmap, research, notas OpenClaw | Actualizar en fases; no reescribir producto |

### 1.2 Árboles residuales (no borrar en PHASE 1)

En **este** workspace **no** aparecen `api/`, `guardian/` ni una app `android/` distinta de `mobile/android/`. Una auditoría anterior los indexó; **antes de borrar cualquier cosa** hay que repetir `git ls-files` / `git status` en la máquina de implementación.

OpenClaw **no** es un servidor de este repo: el cliente vive en `mobile/android/.../gateway/` y las notas en `docs/gateway/VERSION-NOTES.md`. **No fusionar** con el Gateway de Agent Platform.

### 1.3 Entrypoints

| Comando / símbolo | Qué arranca |
|-------------------|-------------|
| `npm run hub` / `hub/src/index.ts` | Hub: registry + `attachLocalAgent` + Agent Runtime + HTTP/WS |
| `HUB_HANDSHAKE_ONLY=1` | Spawn Agent + MCP; sin LLM/HTTP |
| `npm run agent` / `agent/src/index.ts` | MCP Server stdio aislado |
| `npm run build` / `package` / `smoke:package` | Artefactos producción |
| Android `AgentApp` + FGS | Cliente; `RoutingChatConnection` elige Hub vs OpenClaw |

### 1.4 Tests y CI

- Hub: `hub/tests/**/*.test.ts` (`tsx --test`).
- Agent: `agent/tests/**/*.test.ts`.
- Android: tests unitarios bajo `mobile/android/app/src/test/`.
- **No hay** `.github/workflows` ni Dockerfiles en el árbol inspeccionado.
- Tests de arquitectura existentes: fronteras Hub↔Agent, fail-closed MCP/confirm, policy, Excel.

### 1.5 Validación de la auditoría previa vs código

**Sigue siendo cierto:**

- Dos procesos Node (Hub padre, Agent hijo) + MCP stdio.
- Agent Runtime en `hub/src/agent/runtime.ts`; no importa Hono, `ws`, SQLite, MCP SDK ni Excel.
- Confirmación fail-closed en el Hub; policy deny-by-default (`hub/src/tools/tool-policy.ts`).
- Tools de OS/Excel y `math.*` detrás de MCP en el proceso `agent/`; `office.excel.write` es extensión + policy `confirm`.
- Sin calculator in-process en el Gateway.
- Un Agent Runtime; no hay definiciones Book/Research.
- No hay Workspace, Knowledge, A2A, scheduler, fleet de Nodes.
- Android puede ignorar `confirm_request` en el adaptador Hub (riesgo de producto).

**Matices / correcciones:**

- El Hub ya llama `attachGateway` al WebSocket (`hub/src/http/server.ts`): el nombre **Gateway** está parcialmente en código, pero denota el socket, no el componente de plataforma.
- En Android, `gateway` significa **OpenClaw**, no Agent Platform. Colisión de vocabulario **crítica**.
- No hay archivo `ARCHITECTURE_AUDIT.md` que mantener en sync.
- El proceso `agent/` **no** es un Agent: es Local Node + MCP Server.

---

## 2. Arquitectura actual

```text
Clientes
  Android (Hub protocol ──o── OpenClaw externo)
  wscat / PROTOCOL.md
        │  WS v1  (packages/protocol)
        ▼
┌───────────────────────────────────────────┐
│  hub/  (un proceso)                       │
│  HTTP Hono · WS · HUB_TOKEN               │
│  sesiones WS · confirmaciones             │
│  Agent Runtime · Anthropic · prompts      │
│  ToolRegistry (solo remotas MCP)          │
│  Tool Policy · MCP Client stdio           │
│  SQLite conversations/messages/devices    │
│  spawn + lifecycle del proceso agent/     │
└─────────────────────┬─────────────────────┘
                      │ MCP stdio
                      ▼
┌───────────────────────────────────────────┐
│  agent/  (un proceso)                     │
│  MCP Server · ToolRegistry interno        │
│  Agent Extensions (estáticas)             │
│  filesystem · process · office COM · …    │
└─────────────────────┬─────────────────────┘
                      ▼
                 OS / Excel
```

**Hecho:** no existe entidad Agent de negocio (Book, Research, etc.). El loop LLM es uno. El proceso `agent/` no razona.

---

## 3. Arquitectura objetivo (responsabilidades, no procesos)

```text
                 AGENT PLATFORM
                        │
                    GATEWAY
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
     WORKSPACES       AGENTS        NODES
                        │             │
                        ▼             ▼
                  AGENT RUNTIME    MCP Client
                                      │ MCP
                                      ▼
                                 MCP Server
                                      │
                                    Tools
```

**Single Node** = el mismo diseño desplegado en una máquina: Gateway + Agent Runtime (pueden seguir en `hub/`) + Local Node (`agent/` hoy) + MCP stdio + SQLite + filesystem. No es otra implementación.

**Distributed** = mismos contratos, varios Nodes. Fuera de alcance de implementación ahora; los tipos no deben decir «solo existe un Node».

Modelo de Tools (canónico):

```text
                         Agent
                           |
                    Agent Runtime
                           |
                       MCP Client
                           |
                           | MCP
                           v
                      MCP Server
                           |
                    +------+------+------+
                    |      |      |      |
                    v      v      v      v
                   Tool   Tool   Tool   Tool
```

---

## 4. Frontera Gateway

**Definición:** punto de entrada y coordinación de la plataforma: clientes, identidad, sesiones, routing, policy, lifecycle, confirmaciones y coordinación.

**Hoy (mezclado en `hub/`):** conectividad WS, auth token, sesiones, confirmaciones, policy de tools, spawn del proceso local, discovery MCP, health HTTP, SQLite de chat, **y** el Agent Runtime.

**Debe ir quedando (módulos internos, mismo proceso):**

- Conectividad de clientes (WS actual; futuros desktop/wearables).
- Autenticación e identidad de dispositivo (evolución, no IAM completo).
- Sesiones y binding de confirmaciones.
- Catálogo de Agents lógicos (más adelante; hoy: implícito, uno solo).
- Registro de Nodes y tool sets anunciados (hoy: un handle MCP).
- Policies (`executionMode` / Tool Policy).
- Routing de Tools hacia el MCP Server adecuado.
- Lifecycle del Node local (spawn/shutdown ya en `attach-agent.ts`).
- Estado de plataforma (ready, tools list, disconnect).
- Coordinación de confirmaciones humanas.

**Gateway no es:** Agent, Agent Runtime, Node, MCP Server, Workspace. Puede **alojarlos** en el mismo proceso.

**Rename físico `hub/` → `gateway/`:** solo cuando tests, Android Hub client, scripts, packaging y docs coincidan. PHASE 1 no lo hace.

---

## 5. Frontera Agent Runtime

**Definición:** motor común de todos los Agents. Razonamiento, turnos, contexto, selección de Tools y coordinación.

**Hoy:** `createAgentRuntime` en `hub/src/agent/runtime.ts`.

**Responsabilidades:** input de turno, historial vía `TurnMemory`, LLM stream, tool calls, `ConfirmationPort`, eventos (`text_delta`, `confirm_request`, `done`, `error`).

**Ya desacoplado de (hecho):** Hono, WebSocket, SQLite, MCP SDK, filesystem, Excel, spawn.

**Acoplamientos restantes:** vive en el paquete Hub; usa `ToolRegistry` concreto (incluye RemoteAgentTool/MCP detrás); un solo system prompt; no hay `agentId` / workspace id.

**No crear:** BookAgentRuntime, ResearchAgentRuntime, TradingAgentRuntime, WriterRuntime, LocalAgentRuntime, DistributedAgentRuntime.

La especialización de un Agent viene de: definición, instrucciones/prompt, configuración, Workspace, Tools disponibles, memoria/contexto, colaboración A2A (futuro).

Interfaces a introducir **solo cuando un segundo adapter lo exija:** `ModelProvider` (ya hay `LLMProvider`), `ConfirmationPort` (existe), `TurnMemory` (existe). No inventar puertos vacíos. **No** CapabilityProvider. **No** ToolLookup.

---

## 6. Frontera Node

**Definición:** entorno de ejecución (máquina/dispositivo) que hospeda MCP Servers y Tools. Sin LLM.

**Hoy:** el proceso `agent/` es el único Node implícito. No hay `nodeId`, registro ni heartbeat de fleet.

**Debe conservar:** `AGENT_FILESYSTEM_ROOT`, process.execute, Excel COM, extensions, fail-closed de namespace, MCP stdio.

**No hacer:** rename masivo `agent/` → `node/` en PHASE 1. No tratar el proceso `agent/` como Agent.

---

## 7. Frontera Tool

**Definición:** acción invocable por un Agent. Concepto canónico. Un MCP Server puede exponer un **tool set**; un Agent puede consumir Tools de múltiples MCP Servers.

**Hoy:** `AgentTool` + `ToolRegistry` internos. Policy en Hub; implementación en MCP Server (`agent/`). Sin Tools in-process en el Gateway.

**Evolución:** el Agent Runtime descubre e invoca Tools mediante MCP Client. Los nombres públicos actuales se conservan (protocolo LLM + MCP).

**No crear:** Capability, CapabilityRegistry, ToolLookup. No sustituir ToolRegistry por una interfaz equivalente solo por abstracción.

**Código a conservar por ahora:** `AgentTool`, `ToolRegistry`, `RemoteAgentTool`.

---

## 8. Frontera MCP

**Definición:** protocolo para descubrir e invocar Tools. MCP Server = proveedor de Tools. MCP Client = lo que usa el Agent Runtime.

MCP es la **frontera lógica de ejecución**. No existe «local tool» en arquitectura. La implementación física puede ser mismo proceso, proceso separado, otra máquina, Docker, cloud u otro repo. stdio es solamente el transporte actual.

**Hoy:** un MCP Server en el proceso `agent/`; un MCP Client en el Hub; solo stdio; envelope `requestId` + context + input; sin resources/prompts MCP; sin retry; timeouts por tool.

**Conservar stdio.** No extraer CapabilityProvider. La migración completa Runtime → solo MCP **no** es PHASE 2.2.

Un Agent puede consumir MCP, exponer MCP, o ambas. **No** asumir que todo Agent es MCP Server. El proceso `agent/` actual expone MCP; el Agent implícito (loop en Hub) consume MCP.

---

## 9. Frontera A2A

**MCP:** Agent → Tool.  
**A2A:** Agent → Agent.

A2A no se implementa. MCP no es sustituto conceptual de A2A.

Ejemplo de diseño (no código):

```text
Book Agent --A2A--> Research Agent --MCP--> Academic Research MCP Server
                                              +-- search_papers
                                              +-- get_paper
                                              +-- extract_references
```

---

## 10. Frontera Conversation / Workspace / Context

**Hoy:** hay `conversationId` + SQLite (`conversations`, `messages`, `devices`). No hay filas ni IDs de Workspace.

**Conversation:** interacción humana. Puede existir sin Workspace.

**Workspace:** contexto persistente de trabajo. Puede usarse desde múltiples Conversations. Frontera PHASE 5 (`phase5-workspace.md`): **sin persistencia**, sin detección automática, sin `workspaceId` en WS. No crear entidad «Project» paralela.

**Context:** información dinámica seleccionada para un turno. No es almacenamiento. No es Workspace. No es Conversation. No crear un objeto Context persistente.

IDs futuros (clientes): `conversationId`, workspace id, `agentId`, `resourceId`, `nodeId`. **No** añadir campos al protocolo WS hasta la PHASE que lo requiera (PROTOCOL.md manda).

---

## 11. Grafo de dependencias actual

```text
hub/src/index.ts
  ├── ToolRegistry (vacío hasta MCP discover)
  ├── attachLocalAgent
  │     ├── resolveAgentLaunch
  │     ├── MCP stdio Client
  │     ├── mcp-executor
  │     └── discover + DEFAULT_TOOL_POLICY
  ├── createAgentRuntime
  │     ├── TurnMemory → SqliteTurnMemory → SQLite
  │     ├── LLMProvider → Anthropic
  │     └── ToolRegistry
  └── startServer → Hono + attachGateway(WS)
        └── confirmation waiter ↔ runtime

agent/src/index.ts
  └── startLocalAgent
        ├── createDefaultExtensions → ToolRegistry
        └── MCP Server stdio
```

Ciclos Hub↔Agent: ninguno (procesos separados; tipos duplicados). God-object: el **proceso** Hub.

---

## 12. Fases de migración

| Fase | Objetivo | Implementar ahora |
|------|----------|-------------------|
| **0** | Inventario (este documento) | Sí (docs) |
| **1** | Vocabulario + fronteras en docs/tests de arquitectura; **sin** rename de carpetas | Hecho |
| **2.1** | TurnMemory | COMPLETED |
| **2.2** | MCP-first execution boundary: Runtime no nombra ToolRegistry ni SDK; adapter único | Hecho |
| **2.3** | Confirmation boundary: Port en Runtime, Waiter en Gateway | Hecho |
| **2.4** | MCP-only tool execution: math.* en MCP Server; sin calculator in-process | Hecho |
| **3** | Contratos Gateway / Runtime / MCP (docs + tests; sin cambio de comportamiento) | Hecho |
| **4** | Agent / Node topology (docs + tests; sin agentId/nodeId/fleet) | Hecho |
| **5** | Workspace boundary (docs + tests; sin store ni protocolo) | Hecho |
| **6** | Agent definitions (un Runtime; sin registry ni agentId) | Hecho |
| **7** | Packaging Single Node documentado | Hecho |
| **8** | Contratos de configuración Agent / Node / Gateway | Hecho |
| **9** | Agent identity lifecycle (audit) | Hecho / sin código |
| **10** | Agent selection & Conversation (audit) | Hecho / sin código productivo |
| **11** | Interaction & Workspace context (audit) | Hecho / sin store ni protocolo |
| **12** | Workspace persistence & lifecycle | Hecho |
| **13** | Conversation / Workspace association | Hecho |
| **14** | Workspace context resolution | Hecho |
| **15** | Workspace context (¿ConversationContext?) | Hecho / sin código productivo |
| **16** | Primer consumidor Gateway (HTTP Workspace) | Hecho |
| **17** | Active Workspace (audit) | Hecho / sin código productivo |
| **18** | Cliente HTTP Workspace | Hecho |
| **19** | UI Workspace (Android) | Hecho |
| **20** | Continuidad Workspace (audit Active Workspace) | Hecho / sin código productivo |
| **21** | Creación explícita Conversation en Workspace | Hecho |
| **22** | Listado Conversation por Workspace | Hecho |
| **23** | Audit lifecycle Workspace / Conversation | Hecho / sin código productivo |
| **24** | Audit Tool / Capability | Hecho / sin código productivo |
| **25** | Audit topología Node / MCP | Hecho / sin código productivo |
| **26** | Audit lifecycle / resiliencia Node | Hecho / sin código productivo |
| **27** | Audit readiness operativa de producto | Hecho / sin código productivo |
| **28** | HITL Android Hub + frontera env Node | Hecho |
| **29** | Audit ejecución E2E de Tools | Hecho / sin código productivo |

Cada fase que toque código: typecheck, tests Hub+Agent, build, smoke si toca packaging, sin bajar seguridad.

---

## 13. Archivos a modificar (por fase; no ahora)

**PHASE 1 (hecho):**

- `docs/architecture/terminology.md`, `docs/architecture/boundaries.md`
- `docs/architecture.md`, `AGENTS.md`, este plan
- `hub/tests/architecture/phase1-boundaries.test.ts`
- Extraído `hub/src/memory/types.ts` para que el Agent Runtime no importe el módulo SQLite ni siquiera como `import type`
- **No tocado:** protocolo, Android, OpenClaw, transporte MCP, carpeta `hub/`

**PHASE 2.1 (hecho):**

- Contrato `TurnMemory` en `hub/src/memory/types.ts` (única definición)
- Adapter `SqliteTurnMemory` + `createSqliteTurnMemory()` en `hub/src/memory/sqlite-turn-memory.ts`
- Composition root: `hub/src/index.ts`
- Test: `hub/tests/architecture/phase2-1-memory-boundary.test.ts`
- **No tocado:** ToolRegistry, AgentTool, ConfirmationPort, Calculator, WS, MCP

**PHASE 2.2 (MCP-first, hecho):**

- `AgentRuntimeTools` en `hub/src/agent/runtime.ts` (el Runtime no importa `registry.ts`)
- SDK MCP solo en `mcp-stdio.ts` + `mcp-executor.ts`; `discover.ts` sin SDK
- Tests: `hub/tests/architecture/mcp-execution-boundary.test.ts`
- Comentarios en `agent/src`: Local Node / MCP Server, no Agent lógico
- **No tocado:** calculator, stdio, protocolo, Android

**PHASE 2.3 (hecho):**

- Contrato en `hub/src/agent/confirmation.ts` (`ConfirmationPort`)
- `createConfirmationWaiter` en `hub/src/http/confirmation-waiter.ts`
- Tests: `hub/tests/architecture/confirmation-boundary.test.ts`
- **No tocado:** protocolo, timeout 60s, códigos de error, Android

**PHASE 2.4 (hecho):**

- Eliminado `calculatorTool` in-process del Gateway
- Superficie aritmética única: `math.add` / `subtract` / `multiply` / `divide` en el MCP Server
- Tests: `hub/tests/architecture/mcp-only-tools.test.ts`
- **No tocado:** protocolo, Android, ConfirmationPort, stdio

**PHASE 3 (hecho):**

- Contratos en `docs/architecture/phase3-contracts.md`
- Tests: `hub/tests/architecture/phase3-contracts.test.ts`
- Comentarios en Runtime / AgentTool / ToolRegistry (sin cambio de comportamiento)

**PHASE 4 (hecho):**

- `docs/architecture/phase4-agent-node.md`
- Tests: `hub/tests/architecture/phase4-agent-node.test.ts`
- Identidad Agent/Node implícita; sin agentId/nodeId

**PHASE 5 (hecho):**

- `docs/architecture/phase5-workspace.md`
- Tests: `hub/tests/architecture/phase5-workspace.test.ts`
- Sin WorkspaceStore, sin schema, sin protocolo

**PHASE 6 (hecho):**

- `hub/src/agent/definition.ts` + Runtime consume prompt/model
- Tests: `hub/tests/architecture/phase6-agent-definition.test.ts`
- Sin AgentRegistry, sin agentId persistente

**PHASE 7 (hecho):**

- `docs/architecture/phase7-single-node.md`
- Tests: `hub/tests/architecture/phase7-single-node.test.ts`
- Entrypoint Single Node = `npm run hub` / `dev` (spawn MCP existente)

**PHASE 8 (hecho):**

- `GatewayConfig` sin `model`; modelo solo en AgentDefinition
- `NodeConfig` / `loadNodeConfig` (alias `AgentConfig`)
- Tests: `hub/tests/architecture/phase8-agent-node-configuration.test.ts`

**Fases posteriores (lista de impacto, no trabajo):** `hub/src/index.ts`, `hub/src/http/*`, `hub/src/agent/*`, `hub/src/runtime/*`, `hub/src/tools/*`, `agent/src/lifecycle.ts`, `scripts/*`, cliente Hub Android (`network/`), no el paquete OpenClaw `gateway/` salvo docs que desambigüen.

---

## 14. Archivos / comportamientos a preservar

- `packages/protocol/` (PROTOCOL.md, `messages.ts`, `Messages.kt`).
- Confirmación fail-closed, token timing-safe, input congelado, binding sesión/device.
- MCP stdio y envelope JSON.
- Tool Policy deny-by-default.
- `resolveSafePath` / filesystem root.
- Excel COM lock, timeouts, `office.excel.write` confirm.
- SQLite de historial.
- Spawn dev vs `agent.cjs`.
- OpenClaw como backend **opcional y externo**.
- Calculator unificado en `math.*` vía MCP (PHASE 2.4).
- `AgentTool`, `ToolRegistry`, `RemoteAgentTool` hasta MCP normalization.

---

## 15. Riesgos

| Nivel | Riesgo |
|-------|--------|
| Crítico | **«Gateway»** = Hub WS + componente de plataforma + **paquete Android OpenClaw**. Un rename descuidado rompe el cliente o el protocolo. |
| Alto | Confundir proceso `agent/` (MCP Server) con Agent (actor que razona). |
| Alto | Tratar MCP como A2A. |
| Alto | God-process Hub: extraer Runtime sin romper `index.ts` / tests e2e. |
| Alto | `confirm_request` no cableado en el path Hub de Android. |
| Medio | Docs vs código (`docs/architecture.md` aún dice Hub). |
| Medio | Calculator in-process vs frontera MCP. |
| Bajo | Health `personal-agent-api`; `HUB_TOKEN`. |

---

## 16. PHASE 1 — alcance (histórico; hecho)

1. Documentar: **Hub actual = Gateway in-process**; **`hub/src/agent` = Agent Runtime**; **`agent/` = Local Node + MCP Server**.
2. Glosario anti-colisión: **OpenClaw** (cliente Android `.../gateway/`) ≠ **Gateway** de Agent Platform.
3. Tests de arquitectura que fijen imports del Runtime.
4. No rename `hub/` ni `agent/`. No tocar protocolo. No código de Workspace.

---

## 17. Preguntas abiertas

1. ¿Cómo nombrar en Android el cliente OpenClaw para no chocar con Gateway de plataforma (paquete Kotlin, copy de UI, `ConnectionBackend`)?
2. ¿El default de la app sigue siendo OpenClaw o el Hub/Gateway propio?
3. ¿Cuándo cablear `confirm_request` en el path Hub Android?
4. ¿Conversation y Workspace son independientes desde el día 1 de Workspace?
5. ¿El rename de carpeta `hub/` → `gateway/` se aplaza hasta clientes actualizados?
6. ¿Existen en git (otras máquinas) `api/`, `guardian/`, `android/` raíz que este workspace no lista?

---

## 18. Mapping explícito (canónico)

| Término | Significado en este plan |
|---------|---------------------------|
| **Agent Platform** | Producto completo (repo + runtime + clientes). |
| **Gateway** | Clientes, identidad, sesiones, policy, routing, lifecycle, confirmaciones, coordinación. Hoy: mayor parte de `hub/`. |
| **Agent** | Actor que razona, decide y ejecuta. Hoy: uno solo, implícito. |
| **Agent Runtime** | Motor único (`hub/src/agent/runtime.ts`). |
| **Tool** | Acción invocable. Canónico. |
| **Tool catalog / tool set** | Conjunto de Tools disponibles. No una clase nueva. |
| **MCP Adapter** | Capa que conoce el SDK/transporte. Hoy: `mcp-stdio.ts` + `mcp-executor.ts`. |
| **AgentRuntimeTools** | Puerto get/list del Runtime. Implementado por ToolRegistry. No es ToolLookup. |
| **MCP Server** | Proveedor de Tools. |
| **MCP Client** | Permite al Agent Runtime usar MCP. |
| **A2A** | Agent → Agent. No implementado. |
| **Node** | Entorno de ejecución. Hoy: proceso `agent/` (Local Node + MCP Server). |
| **Workspace** | Contexto persistente de trabajo. Store PHASE 12; FK PHASE 13; resolver PHASE 14; HTTP Gateway PHASE 16 (incl. `POST /conversations` PHASE 21, `GET /workspaces/:id/conversations` PHASE 22); cliente `@mxideass/workspace-http` PHASE 18. Sin ConversationContext. Sin Active Workspace. |
| **Conversation** | Interacción humana. SQLite Gateway: user/assistant; `conversationId` en WS. `GET /conversations/:id/messages` (PHASE 32). Cliente Android: rehidratación Hub + DataStore cache + `GET /conversations/:id/workspace`. Aislamiento = instalación `HUB_TOKEN` (PHASE 33); sin User/ownership. |
| **Context** | Información dinámica de un turno. No persistente. |
| **Single Node** | Gateway + Runtime + Local Node + MCP + SQLite. Producto: Hub-first (37), HITL global (38), onboarding (39). Tools → capacidades UX (40 audit; impl pendiente). OpenClaw legacy. Sin User/ACL / CapabilityRegistry. |
| **AgentTool** | Representación interna actual de una Tool. Conservar. |
| **ToolRegistry** | Registry interno actual. No es el registry de plataforma. Conservar. |
