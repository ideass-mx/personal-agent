# PHASE 55 — Agent Model / Runtime Consolidation

**Estado:** IMPLEMENTED · **FIELD TEST: N/A**  
**Fecha:** 2026-08-30

## Pregunta

¿Qué es un `Agent` en Personal Agent?

## Respuesta

Un **Agent** es una **definición lógica** (`AgentDefinition`) que configura cómo el **AgentRuntime** (módulo dentro del proceso Gateway) ejecuta conversaciones.

```text
Agent != process
Agent != Node
Agent != MCP
Agent != Gateway
Agent != Android client
```

## Identidades (no confundir)

| Concepto | Campo | Significado |
|----------|-------|-------------|
| Installation identity | `GatewayConfig.agentId` / `PERSONAL_AGENT_ID` | Identidad persistente de la **instalación** (pairing, producto) |
| Logical Agent | `AgentDefinition.id` | Identidad del Agent lógico (p. ej. `personal-assistant`) |

El default lógico actual:

```text
id = "personal-assistant"
name = "Asistente personal"
```

## Topología

```text
Installation Identity
        ↓
      agentId

Agent Definition
        ↓
   AgentDefinition.id

Agent Manager
        ↓
   Agent Runtime   (singleton de proceso hoy; captura la definición al crear)
        ↓
 ┌──────┼────────┐
 ▼      ▼        ▼
LLM   Memory    Tools
                  ↓
                 MCP
                  ↓
                 Node
```

## Responsabilidades

| Pieza | Hace | No hace |
|-------|------|---------|
| **AgentDefinition** | id, name, prompt, model, toolPolicy, enabledTools?, memoryPolicy? | spawn, HTTP, MCP |
| **AgentRegistry** | register / get / list / has / unregister | LLM, tools, WS, pairing |
| **AgentManager** | default/active, resolveAgent, createRuntime | procesos OS, A2A |
| **AgentRuntime** | turn loop, LLM, tools, confirmación | Electron, Tailscale, Node spawn |
| **ToolRegistry** | dueño del Tool System | Agent identity |
| **MCP** | bajo `tools/mcp/` | proceso hermano |
| **Node** | MCP Server + Native Tools | Agent Runtime |

## Runtime lifecycle (comportamiento real)

- El Gateway arranca **un** `AgentRuntime` con la definición **activa** (`getActiveDefinition()` / `createRuntime()`).
- `createAgentRuntime` **captura** prompt, model y `enabledTools` al construir.
- La memoria (`TurnMemory`) es por **`conversationId`**, no por `AgentDefinition.id` (gap documentado; sin migración).
- Preparado para registrar más definiciones (`research-agent`, `coding-agent`) sin duplicar Runtime class ni procesos.

## Persistencia

- Registry **in-memory**.
- **Sin** migración SQLite de Agents en esta fase.
- Gap: no hay store persistente de AgentDefinition.

## NO implementado (by design)

multi-agent orchestration, A2A, agent UI/editor, multi-MCP, OpenAI/Gemini, vector memory, cambios de pairing/Tailscale/protocolo WS.
