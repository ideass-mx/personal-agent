# PHASE 64 — Agent Experience / Structured UI Runtime

## Objetivo

Demostrar el **Experience Layer** sin convertir Personal Agent en apps separadas:

```text
User → Intent → AgentRuntime → Structured Result → Experience Layer → Channel Renderer
```

> AgentRuntime decides WHAT happened.  
> Experience Layer decides HOW that result can be represented.  
> Channel Renderer decides HOW to present it on a specific channel.

## Qué NO es

- HTML/JSX emitido por el agente
- Plugin system / UI DSL / marketplace
- Segundo AgentRuntime o backend
- Research / Trading / Office como aplicaciones independientes

## 1. Structured UI

Contrato en `gateway/src/experience/` (fuera de React). Web solo consume.

- `StructuredResult` → `{ blocks: StructuredBlock[] }`
- Cada bloque es intención semántica, nunca presentación.

## 2. StructuredBlock

Tipos iniciales: `card`, `table`, `progress`, `research`, `comparison`, `sources`, `artifact`, `task`, `approval`.

Fixtures mock: `research-idle`, `research-working`, `research-completed`, `research-failed`, `research-comparison`, `research-artifact`, `research-sources`.

## 3. Actions

`ExperienceAction`: `{ id, label, action, variant? }`.

El agente describe la acción (`research.compare`, `research.sources`, …). Web decide el control (botón) y el efecto local del lab.

## 4. Experience Layer

Capa entre resultado estructurado y canal. No es un segundo runtime ni un sistema de plugins.

Research: `ResearchExperience` — idle → working → completed (+ comparar / fuentes / informe / proyecto / approval mock) coexistiendo con conversación.

## 5. Renderer

`StructuredBlockRenderer` → switch por `type` → vistas pequeñas (`StructuredBlockView`, `ActionBar`).

Solo React tipado. Sin `dangerouslySetInnerHTML` / `eval`.

## 6. Research workflow

Mock navegable en Experience Lab. Sin LLM ni red. Acciones:

| Acción | Efecto |
|--------|--------|
| Comparar | muestra `ComparisonBlock` |
| Fuentes | abre `SourcesPanel` existente (sin nueva búsqueda) |
| Crear informe | `ArtifactBlock` mock |
| Guardar como proyecto | confirmación conceptual local |
| Approval | pending → approved/rejected local |

## 7. Channel adaptation

Mismo `StructuredResult`; canal Desktop (rico) / Mobile (compacto) / Voice (resumen semántico). No tres aplicaciones.

## 8. Seguridad

`assertSafeStructuredResult` rechaza campos `html` / `css` / `jsx` / `script` / etc. Acciones solo por IDs semánticos.

## 9. Relación con AgentRuntime

Structured UI es **independiente del LLM provider** (Local / Cloud / BYOK). El runtime produce (o en el lab: fixtures simulan) resultados semánticos; el Experience Layer no conoce Anthropic / xAI / OpenAI.

## 10. Qué NO pertenece al Experience Layer

Credenciales, Cloud Auth, MCP, Local LLM, generación real de PDF, ejecución real de approvals, Projects API real, Intelligence Center, protocolo WebSocket nuevo.

## Web entry

`ExperienceLabScreen` (nav **Experiencia**): Universal vs Adaptive, selector de agente, Desktop/Mobile/Voice, comparación Universal · Specialized · Adaptive.
