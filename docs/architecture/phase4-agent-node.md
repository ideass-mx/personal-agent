# PHASE 4 — Agent / Node topology

**Estado:** CLOSED (auditoría, modelado y contratos; sin IDs, fleet ni cambio de comportamiento).  
**Fecha:** 2026-08-24.

## 1. Agent

Un **Agent** es una entidad **lógica**: actor de IA (identidad, instrucciones, modelo, comportamiento, tool set permitido, y más adelante Workspace).

No es un proceso, MCP Server, Node, Agent Runtime ni una conexión WebSocket.

**Hoy:** la identidad es **implícita** a una `AgentDefinition` en memoria (PHASE 6). No hay `agentId` persistente ni Agent Registry. Agent identity is currently configuration-scoped and not yet persistent.

Vive en `hub/src/agent/definition.ts` (prompt, model, toolPolicy). El Runtime pasa prompt/modelo al LLM. Policy se aplica en discovery.

Frontera natural futura para `agentId`: la definition, **no** el protocolo WS ni Android.

## 2. Agent Runtime

Motor **común**. Una implementación: `hub/src/agent/runtime.ts`.

```text
Agent + configuration + context + Agent Runtime = ejecución
```

No hay WriterRuntime / ResearchRuntime / TradingRuntime. El Runtime no ramifica `if agent === "writer"`.

Alojamiento actual: **mismo proceso que el Gateway**. Eso es despliegue, no identidad.

El Runtime consume Tools vía `AgentRuntimeTools` → MCP Adapter. No conoce Node, MCP Server, stdio, filesystem ni process.

## 3. Node

Unidad de **ejecución/hospedaje**. Provee entorno para MCP Servers, procesos, filesystem, integraciones locales.

**Node ≠ Agent.** No razona, no tiene personalidad, no es MCP Server (puede hospedar uno o varios).

**Hoy:** el proceso `agent/` es el **Local Node** / host de MCP Server. No hay `nodeId`, NodeRegistry, heartbeat ni fleet.

Nombres históricos (no rename en esta fase):

| En código | Significado real |
|-----------|------------------|
| carpeta / paquete `agent/` | Local Node + MCP Server |
| `LocalAgent`, `startLocalAgent`, `attachLocalAgent` | lifecycle del MCP Server local |
| `AgentConfig` (`agent/src/config.ts`) | config de infraestructura (p. ej. `filesystem.root`), **no** identidad de Agent |
| `hub/src/agent/` | Agent Runtime + ConfirmationPort + prompts |

## 4. MCP Server

Proveedor de Tools. No es Agent. Un Node puede hospedar varios; hoy hay **uno** in-process con muchas Tools (filesystem, office, process, math, …).

## 5. Tool

Acción ejecutable. Canónico. En producción: MCP.

## 6. Gateway

Entrada y coordinación. Aloja el Runtime. Spawn/lifecycle del Local Node. Policy, confirmations, WS.

## 7. Relación

```text
Agent  (identidad lógica, implícita)
  │ ejecutado por
  ▼
Agent Runtime  (motor común; hoy en proceso Gateway)
  │ consume Tools mediante MCP
  ▼
MCP Server
  │ hospedado en
  ▼
Node  (hoy: proceso agent/ = Local Node)
```

MCP = Agent → Tool.  
A2A = Agent → Agent (**no implementado**). Nunca Agent → MCP → Agent como A2A.

## 8. Single Node (topología, no implementación)

```text
┌───────────────────────────────────────────┐
│                  Machine                  │
│                                           │
│  Gateway                                  │
│    │                                      │
│    └── Agent Runtime                      │
│           │                               │
│           │ MCP (stdio)                   │
│           ▼                               │
│      Local Node                           │
│       └── MCP Server (uno hoy)            │
│            ├── filesystem.*               │
│            ├── office.*                   │
│            ├── process.*                  │
│            ├── math.*                     │
│            └── …                          │
│                                           │
└───────────────────────────────────────────┘
```

No hay código “Single Node” aparte. Packaging: [`phase7-single-node.md`](./phase7-single-node.md). Distributed reutilizará los mismos componentes (varios Nodes). **No implementado.**

```text
Gateway + Agent Runtime
   ├── Node A → MCP Servers
   └── Node B → MCP Servers
```

## 9. A2A (posición; no código)

```text
Agent A --A2A--> Agent B --MCP--> MCP Server --> Tools
```

## 10. Workspace

Frontera documental: [`phase5-workspace.md`](./phase5-workspace.md). Sin persistencia ni protocolo.

| Concepto | Qué es |
|----------|--------|
| Conversation | interacción (SQLite hoy) |
| Workspace | contexto persistente de trabajo (identidad implícita / ausente) |
| Agent | actor |
| Node | infraestructura |
| Runtime | motor |

No usar **Project** como sinónimo de Workspace. No introducir Resources como sustituto.

## 11. Decisiones tomadas

- Identidad de Agent: implícita; no `agentId`.
- Identidad de Node: implícita; no `nodeId`.
- Un Runtime; especialización = prompt + policy + model + Tools.
- `agent/` = Local Node, no Agent.
- Single Node = topología.
- No rename masivo (`LocalAgent`, carpeta `agent/`).

## 12. Aplazado

A2A, persistencia de Workspace, fleet, multi-node, Agent Registry, persistencia de Agent, `agentId`/`nodeId` en protocolo, provisioning, transports extra, clase `Agent`, tablas nuevas.

## Afirmaciones

Agent = identidad lógica.  
Agent Runtime = motor común.  
Node = unidad de ejecución.  
MCP conecta Agents con Tools.  
A2A conectará Agents con Agents.  
Workspace será el contexto persistente de trabajo.  
Single Node y Distributed son topologías, no implementaciones distintas.
