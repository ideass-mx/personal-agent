# PHASE 60.1-A — Reporte SPIKE `agent-search-mcp`

**Fecha:** 2026-09-07  

## 1. Repository inspection

Revisado: `node/src/research/*`, `node/tests/research/*`, `node/scripts/research-search.ts`,
`node/package.json` (+ lock), `package.json` root, `docs/architecture/`, gateway/.env.example.
Sin pnpm/yarn lock. Contrato existente: `SearchProvider` / `SearchRouter` / `researchSearch()`.

## 2. agent-search-mcp

```text
version: 3.2.1
license: Apache-2.0
Node compatibility: >=18.17
API: searchWithFallback (dist/tools/free-search.js) — programática real
CLI: fasm search --json
MCP: npx agent-search-mcp (stdio/HTTP)
browser dependency: NO (cheerio + undici HTTP scraping)
API keys required: NO para zero-key (duckduckgo, bing, wikipedia, …)
                    YES solo si se activan paid (brave/tavily/…)
```

## 3. Integration

```text
SearchRouter → SearchProvider(id=agent-search-mcp)
            → createRequire → searchWithFallback
            → SearchResponse normalizado
```

optionalDependency. Sin AgentRuntime/MCP registration. Sin wrap de stdout.

## 4. Real searches

```text
REAL PROVIDER TEST: PARTIAL
```

- PASS: búsquedas reales sin API keys (Internet).
- FAIL parcial: muchas queries ES/MX con `resultCount=0` tras fallos upstream;
  sesgo fuerte a Wikipedia cuando DDG/Bing/Startpage/Mojeek fallan.

## 5–6. Benchmark (ejecutado)

### Locales

| Provider | Status |
|----------|--------|
| websurfx | UNAVAILABLE |
| librey | UNAVAILABLE |

### agent-search-mcp — 3 runs × 11 queries (REAL INTERNET TESTED)

| Query | Success (API) | Results (typ.) | Unique domains | Notes |
|-------|---------------|----------------|----------------|-------|
| doctorados IA México beca 2026 | 3/3 | 9–10 | ~9 | Mejor corrida ES |
| Ed25519 Android API 29 | 3/3 | 6 | 1 | Wikipedia-heavy |
| últimas noticias OpenAI | 3/3 | 10 | 1 | Wikipedia |
| PostgreSQL 17 novedades | 3/3 | **0** | 0 | empty + partialFailures |
| laptops RTX IA 2026 | 3/3 | **0** | 0 | empty |
| OpenAI latest news Sep 2026 | 3/3 | 10 | 1 | Wikipedia |
| Anthropic Claude latest 2026 | 3/3 | 10 | 1 | Wikipedia |
| BitLocker VM cloning | 3/3 | 10 | 1 | Wikipedia |
| mejores ETFs 2026 | 3/3 | **0** | 0 | empty |
| SECIHTI doctorado IA 2026 | 3/3 | **0** | 0 | empty |
| UAQ IA doctorado | 3/3 | **0** | 0 | empty |

```text
Success rate (no throw): 33/33 (100%)
Non-empty result rate:   ~18/33 (~55%)
Latency (non-cache):     min ~521 ms, avg ~900–1100 ms, max ~1529 ms
Cache warm:              ~0–1 ms (exact cache)
Partial failures:        frecuentes (duckduckgo|bing|startpage|mojeek)
```

Bench 1-run fresco (engines menos castigados): 11/11 API ok; 6/11 non-empty;
avg ~1055 ms.

## 7. Quality observations (manual)

- **México/ES:** inestable. Una corrida buena en “doctorados…”; SECIHTI/UAQ a menudo vacíos.
- **Noticias:** resultados Wikipedia; snippets con warnings de injection del propio paquete.
- **Tecnología:** Ed25519/BitLocker → páginas EN Wikipedia, no docs Android oficiales.
- **Comercial / Finanzas:** vacíos bajo fallos multi-engine.
- **Diversidad:** colapsa a `uniqueDomains=1` (wikipedia) cuando scrapers fallan.
- **Spam:** bajo en muestras vistas; relevancia oficial débil.

## 8. Resource overhead

```text
Cold start search: ~1.2 s (incluye 1ª búsqueda)
Warm / cache:      ~0–400 ms
RAM/processes:     in-process (no Chromium); pino → stderr
Dependencies:      ~8.5MB paquete + cheerio/undici/pino; zod@4 anidado (no choca con zod@3)
Python:            semantic_bridge.py opcional; no usado en path básico
Native binaries:   ninguno observado
```

Vs adapters HTTP locales: más lógica (waterfall, health, cache, scrape) = más overhead
y más superficie de fallo externo.

## 9. Security

```text
API keys:   no usadas en free_only
tokens:     no observados en logs del harness
cookies:    scraping HTTP (comportamiento del paquete)
credentials: no persistidas por nuestro adapter
```

Snippets pueden incluir marcadores `SUSPICIOUS CONTENT` (defensa del upstream).
No ejecuta HTML/JS de resultados en nuestro proceso.

```text
License: Apache-2.0
Commercial-use concern: bajo (permisivo)
Attribution requirement: sí (NOTICE / copyright en redistribución)
Redistribution concern: estándar Apache-2.0
```

## 10. Comparison

→ **no hay comparación apples-to-apples de calidad/latencia**.

## 11. Recommendation

```text
USE AS PRIMARY: NO
USE AS FALLBACK: YES
KEEP AS EXPERIMENTAL: YES
```

Reduce instalación (Node+npm+Internet), pero **no reduce complejidad total**:
mueve fallos a scrapers/rate-limits/CAPTCHA opacos. Calidad ES/MX insuficiente
como primario. Útil como fallback zero-config mientras no haya motor local.

## 12. Architectural decision

**Opción B** (ajustada):

```text
SearchRouter
   └── agent-search-mcp (fallback zero-key experimental)
```

No A (primary). No C todavía (locales no validados en vivo).

## 13. Tests

```text
Node:        282 pass / 0 fail
Gateway:     no modificado (salvo .env.example comment)
Typecheck:   node PASS
Build:       PASS
Benchmark:   ejecutado (locales UNAVAILABLE; agent-search REAL)
Real provider: PARTIAL (funciona; calidad inconsistente)
```

## 14. Files changed (60.1-A + base 60.1 research)

- `node/src/research/**` (+ provider agent-search-mcp)
- `node/tests/research/**`
- `node/scripts/research-search.ts`, `research-robustness-live.ts`
- `node/package.json`, `node/package-lock.json`, `node/.env.example`
- `package.json` (scripts)
- `docs/architecture/phase-60.1-a-agent-search-mcp-spike.md` (+ docs 60.1 previos)
- `gateway/.env.example` (comentario)

## 15. Open issues

- Scrapers DDG/Bing/Startpage inestables → resultados vacíos o solo Wikipedia.
- Cobertura México/español no fiable bajo carga.
- Zod v4 anidado (ok, pero deuda).
- No promover a MCP tool todavía.

## 16. Definition of Done

```text
[PASS] Inspección repo
[PASS] Investigación agent-search-mcp (fuente/npm/código)
[PASS] Adapter experimental SearchProvider
[PASS] API programática (no stdout wrap)
[PASS] Zero-key real search
[PASS] Queries + 3 runs
[PASS] Locales marcados UNAVAILABLE
[PASS] Métricas objetivas
[PARTIAL] Calidad (datos reales pero inconsistentes)
[PASS] Multi-source/fallback observado (partialFailures + wiby→wiki)
[PASS] Robustez básica
[PASS] Deps/licencia/seguridad documentados
[PASS] Tests deterministas sin Internet
[PASS] Typecheck/build
[PASS] Decisión A/B/C
```
