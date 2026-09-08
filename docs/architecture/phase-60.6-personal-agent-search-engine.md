# PHASE 60.6 — Personal Agent Search Engine

**Fecha:** 2026-09-07  
**STATUS:** COMPLETE (experimental)  

---

## Executive Summary

Se implementó un **motor de búsqueda propio** en Node (`node/src/research/search/`),
determinista y clasificación de fuentes.


| --- | ---: | ---: |
| Empty rate | **0/10** | **0/10** |
| Avg relevance top3 (léxica) | **0.802** | **0.766** |
| Avg latency | **1849 ms** | **787 ms** |
| Official/gov/uni (suma) | **1** | **32** |
| Academic (suma) | **79** | **6** |

### Recomendación

```text
→ NO todavía.
```

**Fortaleza:** cobertura académica (arXiv / OpenAlex / Crossref) excelente.  
**Debilidad crítica para Personal Agent:** DuckDuckGo/Mojeek aportaron poco en este run

Siguiente: endurecer providers web generales + sesgo de ranking para `intent=research`
en ES/MX **antes** de cablear a `research.search` de producción.

---

## Architecture

```text
Research Engine (existente)
        ↓  (futuro adapter; hoy experimental)
SearchProvider (legacy contract)
        ↓
PersonalAgentSearchProvider  ← search/adapter.ts
        ↓
PaSearchEngine               ← search/engine.ts
        ↓ parallel
Providers: duckduckgo | mojeek | wikipedia | arxiv | openalex | crossref
        ↓
normalize → dedupe → rank → SearchResult[]
```

No hay proceso `search-service`. No hay fallback de producto. Providers fallan en paralelo.

---

## Files

| Path | Rol |
| --- | --- |
| `node/src/research/search/**` | Motor experimental |
| `node/tests/research/search-engine-60.6.test.ts` | Unit tests |
| `node/scripts/research-60.6-benchmark.ts` | Benchmark live |
| `research/phase-60.6-benchmark-raw.json` | Datos |
| `docs/legal/search-engine-licenses.md` | Licencias |
| `docs/architecture/phase-60.6-personal-agent-search-engine.md` | Este informe |

---

## Providers (v1)

| Id | Mecanismo | Key |
| --- | --- | --- |
| duckduckgo | POST HTML no-JS | No |
| mojeek | GET HTML | No |
| wikipedia | MediaWiki OpenSearch | No |
| arxiv | Atom API | No |
| openalex | REST + mailto UA | No |
| crossref | REST + mailto | No |

GitHub / StackOverflow / PubMed: **aplazados** (auth o valor marginal en v1).

---

## Licenses

Ver `docs/legal/search-engine-licenses.md`.

```text
New npm deps: NONE
```

---

## Tests

```text
search-engine-60.6: 8 pass
typecheck node: PASS
```

---

## Benchmark notes (query-level)

- **Academic LLM/agents:** PA competitivo o mejor.  
- **React docs / MCP:** PA fuerte vía academic+wiki; latencia mayor.  
- Failures parciales: 1 timeout arxiv en `mx-secihti` (no tumba la búsqueda).

---

## Decision

```text
KEEP experimental
DO NOT wire as production research.search yet
CONTINUE improving web HTML providers + MX source bias
```

Cuando:

1. DuckDuckGo/Mojeek aporten resultados de forma estable, y  

entonces evaluar promoción a PRIMARY vía adapter en ResearchEngine.
