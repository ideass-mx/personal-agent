# PHASE Web Intelligence 60.1 — `research.search()` (capa de búsqueda)

> **Nota de numeración:** el repo ya tiene PHASE 60 / 60.1 de Object Storage
> (`PHASE_60_DESIGN.md`, `PHASE_60_1_DESIGN.md`). Esta fase de producto es
> **Web Intelligence — contrato de búsqueda**, solicitada como «PHASE 60.1».
> No modifica storage, Identity, AuthSession ni AgentRuntime.

**Estado:** CODE IMPLEMENTED (adapters + tests unitarios).  
**Prueba real de motores:** solo si hay instancias locales levantadas.

## Objetivo

Contrato interno intercambiable:

```text
research.search()
       ↓
SearchRouter
       ↓
```

Sin chat, sin MCP tool registrada, sin browser, sin `research.fetch()`.

## Dónde vive

Según convenciones del monorepo (`Node` = capacidades locales / «garras»):

| Pieza | Ruta |
|-------|------|
| Contrato + router + adapters | `node/src/research/` |
| Tests de contrato | `node/tests/research/` |
| Harness CLI | `node/scripts/research-search.ts` |

**No** se registró extensión MCP todavía (`createDefaultExtensions` intacto).
Más adelante: extensión `research` → tool `research.search` vía MCP, sin
mover el contrato.

## Config (dev-only)

```bash
WEBSURFX_BASE_URL=http://127.0.0.1:8081
LIBREY_BASE_URL=http://127.0.0.1:8082
SEARCH_TIMEOUT_MS=15000
```

No va al onboarding ni a la UI. Sin API keys de usuario.

Ver `docs/architecture/phase-web-intelligence-local-engines.md` para levantar
cada motor por separado.

## Harness

```bash
# Desde la raíz del monorepo:
npm run research:search -- "doctorados inteligencia artificial México beca"
npm run research:search -- --provider websurfx "Ed25519 Android API 29"
npm run research:benchmark
```

## Seguridad (esta fase)

- Solo GET
- Timeout + límite de resultados + tope de bytes de respuesta
- Redirects acotados
- AbortSignal
- No ejecuta HTML/JS
- Logs del harness: provider / latency / counts / error codes (sin secrets)
