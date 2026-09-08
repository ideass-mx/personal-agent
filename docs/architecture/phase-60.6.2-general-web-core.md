# PHASE 60.6.2 — Personal Agent Search Engine: General Web Core

**STATUS:** Experimental  
**AGPL:** no incorporado  
**API keys / fallback:** no

---


y comportamiento observado en benchmarks 60.4–60.6.1. **No se importó ni adaptó
código AGPL.**

### Query processing


| Campo | Rol conceptual |
| --- | --- |
| `query` | Texto (tras bangs/syntax) |
| `lang` / locale | Idioma de engines que lo soportan |
| `safesearch` | 0/1/2 |
| `time_range` | day/week/month/year |
| `engineref_list` | Engines concretos a ejecutar |
| `categories` | Derivadas de engines (general, science, it, news, …) |
| `timeout_limit` | Presupuesto global de la búsqueda |

Prioridad típica: syntax de query > form > preferencias de usuario.

### Engine selection

- Categorías → conjunto de engines habilitados.
- Bangs / shortcuts pueden forzar engines.
- Engines deshabilitados se excluyen antes del fan-out.

### Parallel execution + failure isolation

- Un thread/tarea por engine.
- Timeout global: engines vivos tras el join → `unresponsive` / timeout.
- Un engine en CAPTCHA o timeout **no** cancela a los demás.
- Resultados parciales se agregan igual.

### Normalización / metadata

Resultados con URL, título, content/snippet, engine(s), categoría, plantilla,
posiciones por engine, score.

### Deduplication

Hash/normalización de URL; merge de metadatos; **varias engines que ven la misma
URL aumentan el score** (`weight * count * Σ 1/position`).

### Ranking

Señal fuerte: **acuerdo multi-engine + posición + peso del engine**.  
Ordenación en dos pases con agrupación por categoría/template para diversidad
visual.

### Language / region / categories

Language se propaga a engines capaces. Categories separan corpora (general vs
science vs news). No hay “intent” LLM; la categoría del usuario hace ese rol.


No es un algoritmo mágico de ranking: es **muchos engines HTML/API de web general
en paralelo**. Cuando DDG/Google/Brave/etc. responden, aparece cobertura
(visto en 60.6.1).

---


| --- | --- | --- |
| Query normalization | ✓ | ✓ `normalizeQueryText` + `QueryPlan` |
| Intent / categories | ✓ categorías | ✓ intent + categories en plan |
| Language | ✓ | ✓ plan + providers locale-aware |
| Region | parcial (locale) | ✓ `region` + señales MX |
| Provider selection | ✓ por categoría/bang | ✓ `selectProvidersForPlan` |
| Parallel fan-out | ✓ | ✓ `Promise.all` |
| Timeout isolation | ✓ | ✓ timeout por provider + global |
| Partial failure | ✓ unresponsive list | ✓ `providerReports` |
| Normalization | ✓ | ✓ `buildPaResult` |
| Deduplication | ✓ URL hash + merge | ✓ `urlDedupeKey` |
| Multi-source agreement | ✓ score | ✓ `agreementByUrl` en ranking |
| Source classification | débil / por engine | ✓ `SourceRule` + domain quality |
| Ranking | engine weight + pos | ✓ intent-aware multi-señal |
| Domain diversity | agrupación UI | ✓ hard cap + soft-max |
| Freshness / time_range | ✓ | ✓ `freshnessScore` por intent |
| Official / ES-MX | vía engines web | ✓ reglas; **limitado por HTML** |
| General web engines | muchos | DDG + Mojeek (**frágiles**) |

### Gaps reales (evidencia)

1. **General web coverage** — cuello de botella estructural (CAPTCHA HTML).
2. **Agreement score** — cerrado parcialmente en 60.6.2.
3. **Query plan / selection** — cerrado en 60.6.2.
4. **Freshness tipada** — cerrado en 60.6.2.
5. **Cantidad de engines web generales estables sin API key** — **sigue abierto**.

---

## 3. Mejoras implementadas (código propio)

Archivos nuevos/tocados solo bajo `node/src/research/search/`:

| Componente | Rol |
| --- | --- |
| `query-plan.ts` | Plan determinista: intent, language, region, preferred sources, freshness, categories |
| `provider-selection.ts` | Capacidades + selección por intent + confidence |
| `rank.ts` | Señales: locale, preference, agreement, freshness tipada, demote academic en general |
| `engine.ts` | plan → select → fan-out → agreement → dedupe → rank → soft diversity |
| `source-classifier.ts` | `.ac.*`, SAT/DOF/Banxico, sin premiar `.mx` genérico |

Pipeline:

```text
PaSearchRequest
  → QueryPlan
  → selectProvidersForPlan
  → parallel providers
  → normalize / dedupe
  → rank (agreement + locale + preference + freshness)
  → soft domain diversity
  → PaSearchResponse (+ plan + providerReports)
```

### Limitación documentada (no más hacks)

```text
DuckDuckGo HTML  → rate_limited frecuente (anomaly.js)
Mojeek HTML      → CAPTCHA ~100% en este entorno
```

**No se añadieron parsers agresivos ni evasión anti-bot.**  
Safety net temporal: `openalex` en intents technical/news/financial/local/general
para evitar empty rate mientras no exista general-web estable.

---

## 4. Benchmark

Artefacto: `research/phase-60.6.2-benchmark-raw.json`  
Script: `npm run research:benchmark:60.6.2 --prefix node`

### Resultados PA (live, esta corrida)

| Métrica | 60.6.2 | 60.6.1 comparative |
| --- | ---: | ---: |
| Empty rate | **0/15** (tras safety net) | 0/16 |
| Avg relevance top3 | ~0.5–0.7* | 0.762 |
| Avg official/gov/uni | **bajo** (HTML caído) | 1.56 |
| Avg academic | alto | 6.0 |
| Avg latency | **~0.5–0.8 s** | ~5005 ms |
| DDG success | **~0%** | ~50% (pase bueno) |
| Mojeek success | **0%** | 0% |

\*Depende del corpus; con solo academic APIs la “relevance” léxica en queries MX
no sustituye fuentes oficiales.

### Antes / después (arquitectura)

| | Antes 60.6.1 | Después 60.6.2 |
| --- | --- | --- |
| Plan de query | implícito | `QueryPlan` explícito |
| Selección providers | todos siempre | por intent + safety net |
| Agreement multi-provider | no | sí |
| Freshness tipada | parcial | por `SearchFreshness` |
| Latencia típica | arrastre arxiv/todos | selección + budgets |
| General web real | DDG intermitente | **sigue bloqueado** |

---

## 5. Tests

```text
node/tests/research/search-engine-60.6.2.test.ts
+ 60.6 / 60.6.1
→ 46 tests pass
```

Cubren: planning, intent, language/region, provider selection, freshness,
ranking, diversity, partial failure, all failed.

---

## 6. Licencias

Sin dependencias npm nuevas.  
`docs/legal/search-engine-licenses.md` actualizado (nota 60.6.2).

```text
NEW_NPM_DEPS_60_6_2: NONE
```

---

## 7. Criterio de éxito — evaluación honesta

| Objetivo | ¿Cumple? |
| --- | --- |
| Matriz + gaps | **Sí** |
| Mejorar gaps internos (plan/select/rank) | **Sí** |
| General Web estable/relevante | **No** (HTML providers) |
| ES/MX + official mejora | **No medible** sin web general |
| Ranking determinístico | **Sí** |
| Producción intacta | **Sí** |

Progreso real: **núcleo de orquestación** más cercano al modelo mental de un
buen metasearch.  
Progreso **no** logrado: cobertura general-web (depende de fuentes, no de ranking).

---

## 8. Recomendación PHASE 60.6.3

```text
60.6.2 demostró:
  orquestación ✓
  academic ✓
  general-web HTML scrapers ✗ estructural
```

**Siguiente fase (prioridad única): General Web Provider estable, propio,
sin API key, ToS limpio, sin AGPL.**

Opciones a evaluar (investigación + spike, no commit ciego):

1. Provider HTTP JSON **público y permitido** (no scraping HTML frágil).
2. Índices / dumps open data orientados a gov/edu MX (offline o semi-offline).
3. Crawl acotado de allowlist de dominios oficiales MX (gob.mx, edu.mx, …)
   con politeness — código propio.
4. **No** adoptar otro metasearch AGPL/GPL como dependencia.

Criterio de salida 60.6.3:

```text
sin depender de CAPTCHA luck de DDG/Mojeek
research.search producción sigue sin tocar hasta evidencia
```

```text
PHASE 60.6.2
     ↓
Orquestación lista; general-web aún no
     ↓
60.6.3 → General Web Core Sources (código propio)
```

## Principio

