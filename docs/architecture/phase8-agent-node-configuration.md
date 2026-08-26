# PHASE 8 — Agent / Node configuration boundary

**Estado:** CLOSED (contratos de config; mismo comportamiento; un Runtime).  
**Fecha:** 2026-08-24.

## Diagnóstico (antes)

| Valor | Dónde | Problema |
|-------|--------|----------|
| model | `AgentDefinition.model` **y** `config.model` | dos fuentes; Anthropic hacía `request.model ?? config.model` |
| prompt | `AgentDefinition.prompt` y fallback `SYSTEM_PROMPT` en Anthropic | el fallback es el mismo string (`prompts.ts`) |
| toolPolicy | `AgentDefinition.toolPolicy` = `DEFAULT_TOOL_POLICY`; discover usa `policy ?? DEFAULT_TOOL_POLICY` | mismo objeto por defecto; no allow-all |
| filesystem.root | `AgentConfig` / `AGENT_FILESYSTEM_ROOT` | Node, con nombre histórico «Agent» |
| API key, port, token, SQLite, maxTokens | `hub/src/config.ts` mezclado con `model` | Gateway + espejo de Agent |

## Después

```text
Gateway
│
├── GatewayConfig          hub/src/config.ts
│     port, hubToken, dbFile, anthropicApiKey, maxTokens, historyWindow
│
├── AgentDefinition        hub/src/agent/definition.ts
│     prompt, model, toolPolicy
│
├── Agent Runtime
│
└── Node  (proceso agent/)
      └── NodeConfig       agent/src/config.ts
            filesystem.root
```

`AgentConfig` / `loadAgentConfig` = alias históricos de `NodeConfig` / `loadNodeConfig`. Sin rename masivo.

## Agent

Identidad lógica. Contiene: prompt, model, toolPolicy.  
No contiene: API key, port, SQLite, stdio, filesystem.root, nodeId, workspaceId, conversationId.

Identidad: configuration-scoped, no persistente.

## Agent Runtime

Ejecuta un Agent. Una implementación.  
Conoce: AgentDefinition, TurnMemory, LLMProvider, AgentRuntimeTools, ConfirmationPort.  
No conoce: NodeConfig, MCP SDK, SQLite, Hono, WS, stdio.

Modelo efectivo:

```text
AgentDefinition.model → Runtime (llm.stream) → LLMProvider
```

El fallback `DEFAULT_AGENT_MODEL` en Anthropic es **el mismo constante** que usa `createDefaultAgentDefinition`, no `GatewayConfig`.

## Node

Unidad de ejecución. Contiene: MCP Server, Tools, `NodeConfig.filesystem.root`, lifecycle stdio.  
No contiene: prompt, model, toolPolicy, API keys. No es un Agent.

## Gateway

HTTP/WS, token, SQLite, credentials del proveedor, spawn MCP, enforcement de policy en discover, confirmaciones. Aloja el Runtime en Single Node.

## Tool policy

Una tabla: `DEFAULT_TOOL_POLICY`. El Agent la declara; el Gateway la aplica en discovery; el Runtime recibe el catálogo ya filtrado. Omitir una tool = deny.

## Single Node / Distributed

Sin cambio de topología. Distributed futuro = más MCP Clients / Nodes, mismo Runtime. Sin nodeId ni registry.

## Fuera de alcance

A2A, Workspace, registries, multi-Agent, transports MCP nuevos, Android, protocolo WS.
