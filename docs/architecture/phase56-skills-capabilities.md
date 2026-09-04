# PHASE 56 — Skills & Capabilities Foundation

**Estado:** IMPLEMENTED (Skills foundation) · artifact Tools = audit only  
**Fecha:** 2026-08-30

## Auditoría (antes de código)

| Concepto | Hallazgo |
|----------|----------|
| Skill | **No existía** en `gateway/src` |
| CapabilityRegistry | Prohibido / no implementado (PHASE 40) |
| Tools reales (Node) | `filesystem.*`, `process.execute`, `math.*`, `system.info`, `diagnostics.ping`, `agent.echo`, `customer.*`, `office.excel.*` |
| git / web / document / pdf / image / chart / presentation / citation | **No existen** como Tools |

## Separación

```text
Skill  = reusable behavioral knowledge (instructions)
Tool   = executable capability
MCP    = protocol/transport inside Tool System
Node   = local execution process
AgentRuntime = execution engine (one class)
```

```text
Agent
  ↓
AgentDefinition
  ├── Prompt
  ├── Model
  ├── Skills[]     → SkillRegistry → resolveAgentInstructions()
  ├── enabledTools → ToolRegistry (filter; Skills no agregan tools)
  ├── toolPolicy
  └── memoryPolicy   (conversation-scoped hoy)
```

## Composition (determinista)

```text
{AgentDefinition.prompt}

# Skills

## {name} ({id})

{instructions}
```

Orden = orden de `AgentDefinition.skills`. Skill faltante → `SkillResolutionError`.

## Security

Skills **no** pueden: grant permission, credentials, enable dangerous tools, bypass confirm, tocar pairing/TrustedDevice.

## Capability matrix

| Capability | Status | Owner | Transport |
| ---------- | ------ | ----- | --------- |
| filesystem | **IMPLEMENTED** (`filesystem.read/list/write`) | Tool/Node | MCP stdio |
| process | **IMPLEMENTED** (`process.execute`) | Tool/Node | MCP stdio |
| math | **IMPLEMENTED** | Tool/Node | MCP stdio |
| system / diagnostics | **IMPLEMENTED** | Tool/Node | MCP stdio |
| spreadsheet (Excel) | **PARTIAL** (`office.excel.read/write`, Windows/COM) | Tool/Node | MCP stdio |
| git | **NOT IMPLEMENTED** | — | — |
| web | **NOT IMPLEMENTED** | — | — |
| document | **NOT IMPLEMENTED** | — | future Tool |
| pdf | **NOT IMPLEMENTED** | — | future Tool |
| image | **NOT IMPLEMENTED** | — | future Tool |
| chart | **NOT IMPLEMENTED** | — | future Tool |
| presentation | **NOT IMPLEMENTED** | — | future Tool |
| citation | **NOT IMPLEMENTED** | — | future Tool |

## Contratos futuros (solo conceptos)

```text
document.create|read|edit|export
pdf.create|export
image.generate
chart.create
spreadsheet.create|read|write|export   (hoy: office.excel.*)
presentation.create|addSlide|export
citation.search|resolve|format
```

Agent no conoce reportlab/LibreOffice/OpenAI image APIs — eso sería ImageProvider/Tool/Node.

## Fixtures (configuración, no clases)

`book-writer`, `scientific-writer`, `coding-agent` en `gateway/src/agents/fixtures.ts`.

## Gaps

- Memoria: conversation-scoped (no agent-scoped).
- Skills/Agents: in-memory (no SQLite).
- enabledTools acepta prefijo de familia (`filesystem` → `filesystem.*`).

## NOT IMPLEMENTED BY DESIGN

A2A, orchestration, Agent Builder UI, multi-MCP, vector memory, artifact providers.
