# PHASE 60.15.1 — Web Intelligence Sources UX & Web Integration

**Estado:** Web Intelligence Sources UX = **CLOSED**  
**Fecha:** 2026-09-08

## Pregunta de cierre

> ¿Puede el usuario ver cuántas fuentes usó el agente, abrirlas desde la respuesta y consultarlas en un panel lateral sin abandonar la conversación?

**Respuesta: YES**

## Arquitectura

```text
AgentRuntime
   │  (collect research.search / research.fetch)
   ▼
assistant_done { sources[] }
   │
   ├── SQLite messages.sources_json  (persistencia)
   └── WebSocket → Agent Console
                      │
                      ├── SourcesChip  (bajo el mensaje)
                      └── SourcesPanel (derecha / bottom sheet)
                               │
                               ▼
                         External browser
```

**Sources** es una primitive de Structured UI, no un “Research App”.

## Contrato

`assistant_done.sources?: AgentSource[]`

```ts
{
  id: "source-1",
  title: string,
  url: string,       // http(s) only
  domain: string,
  snippet?: string,
  sourceType?: "web" | "knowledge" | "academic" | "official"
}
```

- Sin providers internos (`electron-duckduckgo`, `openalex`, …).
- Sin secretos.
- Dedupe y orden: autoridad del Gateway (collector de turno).

## UI

| Elemento | Rol |
| --- | --- |
| `SourcesChip` | `[ N fuentes ]` / `1 fuente`; oculto si 0 |
| `SourcesPanel` | Side panel Desktop; bottom sheet ≤820px |
| `SourceCard` | Título, dominio, badge de tipo, snippet opcional |

Click en fuente → `window.open(url, "_blank", "noopener,noreferrer")`.  
Abrir el panel **no** re-ejecuta `research.search` / `research.fetch`.

## Persistencia

Migración `015_message_sources.sql`: columna `messages.sources_json`.  
HTTP `GET /conversations/:id/messages` incluye `sources` cuando existen.

## Familias semánticas

El ResearchEngine etiqueta `sourceFamily` (web / knowledge / academic / official)
antes de llegar al LLM y al collector del Gateway. Providers estructurados ganan;
hits de General Web se reclasifican por dominio/tipo (p. ej. Wikipedia → knowledge,
`.org` docs → official). El Gateway mapea `sourceFamily` → `AgentSource.sourceType`
sin exponer providers internos.

## Evidencia

| Test | Ubicación |
| --- | --- |
| Collector / dedupe / types | `gateway/tests/agent/sources-60.15.1.test.ts` |
| Chip labels / normalize | `web/tests/sources-60.15.1.test.ts` |
| Runtime → done.sources (FakeLLM) | `gateway/tests/agent/research-60.15.test.ts` |

## Futuro

`Source` como primitive puede evolucionar a Research / Citation / Finding / Artifact  
sin cambiar este cable: `response.sources[]` → Experience Layer → Channel Renderer.
