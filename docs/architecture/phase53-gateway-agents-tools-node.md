# PHASE 53 — Gateway / Agents / Tools / Node

**Estado:** IMPLEMENTED (refactor de nomenclatura y estructura) · field = NOT EXECUTED  
**Fecha:** 2026-08-29

## Nomenclatura canónica

| Concepto | Nombre |
|----------|--------|
| Producto | Personal Agent |
| Proceso principal | **Gateway** (`gateway/`, `@mxideass/gateway`) |
| Agentes lógicos | **Agents** (`gateway/src/agents/`) |
| Motor de turno | **AgentRuntime** (módulo, no proceso) |
| Herramientas | **Tools** (`gateway/src/tools/`) |
| Protocolo de tools | **MCP** (`gateway/src/tools/mcp/`) |
| Proceso de ejecución local | **Node** (`node/`, `@mxideass/node`) |
| Android | Gateway Client (`AgentGatewayClient` / legacy `HubClient`) |
| Desktop | Gateway Supervisor |

## Layout

```text
Gateway
├── Agents (definition, runtime, registry, manager, prompts, confirmation)
├── Tools (registry, policy, discover, remote, mcp/{client,stdio,executor})
├── Providers
├── Memory
├── HTTP
├── WS
├── Sessions
└── Pairing

Node
├── MCP Server
└── Native Tools
```

## Topología

```text
Client → Gateway → Agents/Runtime → Tools → MCP/stdio → Node → Native Tools
```

## Legacy conservado

| Legacy | Canónico | Motivo |
|--------|----------|--------|
| `hub/` path, `hub.cjs`, `[hub] READY` | `gateway/`, `gateway.cjs` | Desktop / instalador |
| `@mxideass/hub` | `@mxideass/gateway` | package rename hecho; docs mencionan legacy |
| `HUB_TOKEN` | (sin rename) | installation credential |
| `agent/`, `agent.cjs` | `node/`, `node.cjs` | layouts duales en dist/ |
| `HubClient` | `AgentGatewayClient` typealias | Android |

## Prohibido en esta fase

SSE MCP, multi-MCP registry, A2A, rename de `HUB_TOKEN`, carpetas `gateway/src/gateway/` o `gateway/src/mcp/`.
