# PHASE 60.11 — Experimental SERP Integration

**Estado:** completo (experimental opt-in)  
**Fecha:** 2026-09-08  
**Default producción:** `ELECTRON_SERP_ENABLED=false` (sin cambio de comportamiento)

## Objetivo

Integrar `electron-duckduckgo` bajo `research.search()` sin rediseñar la API ni el contrato MCP, y sin que AgentRuntime conozca Electron.

## Arquitectura

```text
AgentRuntime
     ↓
research.search()   (MCP invariante)
     ↓
ResearchEngine
     └─ ELECTRON_SERP_ENABLED=true → Electron SERP (reusable session)
           ↓
     SearchResult[]  (provider interno: electron-duckduckgo)
           ↓
     LLM ve provider: "web"  (no se expone electron-duckduckgo)
```

## Opt-in / rollback

```bash
# node/.env — default off
ELECTRON_SERP_ENABLED=false

# experimental
ELECTRON_SERP_ENABLED=true
```

Rollback = poner `false`. Sin migraciones, sin cambiar Gateway/MCP/AgentRuntime.

## Garantías

- Sesión reutilizable + cola serial + idle timeout (~60s)
- Shutdown Node cierra Electron (`lifecycle.ts` → `shutdownElectronSerp`)
- CAPTCHA → `provider_unavailable` (BLOCKED interno)
- Crash Electron → error controlado; no tumba Gateway/Node
- `QueryPlan` aplica language/region antes del search
- `research.fetch` sin cambios

## Benchmark (n=36 Electron vía tool MCP)

| --- | ---: | ---: |
| Blocked | — | **0%** |
| Avg latency | — | ~3.0 s (sesión caliente) |
| LLM provider label | — | `web` |


Multi-search + fetch: primera ~6.8 s; siguientes ~2.6–3.1 s; fetches posteriores a SERP OK.

## Clasificación

**CASE A — Integración viable**

Mantener **opt-in**. No activar por defecto hasta una fase de default-on explícita.

## Tests

`node/tests/research/electron-serp-60.11.test.ts` + config/router gates.  
Typecheck OK. Script: `npm run research:benchmark:60.11 -w @mxideass/node`.
