# PHASE 60.6.1 — General Web Providers & Intent-Aware Ranking

**STATUS:** Experimental  
**Production:** NO CAMBIADO (`research.search` sigue el camino 60.5.1)  
**Fallback / API keys / AGPL:** ninguno

## Objetivo

Estabilizar DuckDuckGo/Mojeek, clasificar fallos de provider, mejorar ranking
intent-aware + clasificación ES/MX, diversidad de dominio, y medir evidencia

## Cambios (código propio en `node/src/research/search/`)

### Providers HTML

- **DuckDuckGo:** detección de `anomaly.js` / HTTP 202 / 429 / captcha →
  `rate_limited`; retry limitado solo en `timeout`/`http_error`; UA de navegador;
  parser con variantes de `result__a`; timeout/cancelación.
- **Mojeek:** detección de página `<title>Captcha</title>` → `rate_limited`;
  parser tolerante (`ob` / `title` / `li.result`); mismos guards de red.

No se intentó evadir anti-abuso. Si el provider rechaza → report + continuar.

### Taxonomía de fallos

Cada búsqueda expone `providerReports[]`:

```text
success | empty | timeout | rate_limited | http_error | parse_error | unavailable | aborted
```

Ejemplo: `{ provider: "duckduckgo", status: "rate_limited", resultCount: 0, elapsedMs: 371 }`.

### Ranking intent-aware (determinista, sin LLM)

Pesos por `intent`: `general | research | academic | technical | news | financial | local`.

- `general` — no sobrepondera academic.
- `research` / `local` — favorece official/gov/uni + bonus ES/MX (`.mx` / gob / edu).
- `academic` — academic/university.
- `technical` — documentation/community/official.
- `news` / `financial` — mayor peso de freshness.

### SourceRule + domain quality

Reglas configurables (`*.gob.mx`, `*.edu.mx`, `unam.mx`, `secihti.mx`, …).  
**`.mx` genérico ≠ university.**  
`domainQualityScore` local/explicable (sin servicios de reputación).

### Diversidad / dedupe

- `applyDomainDiversity` — máx. 2 resultados por dominio en la ventana top-N.
- `urlDedupeKey` — unifica http/https y www/non-www sin mutar la URL mostrada.

### Budgets internos (`ProviderConfig`)

`timeoutMs` / `maxResults` / `enabled` / `maxRetries` — **no** expuestos al usuario.  
Arxiv con presupuesto corto para no arrastrar latencia global (OpenAlex/Crossref cubren academic).

## Benchmark real

Artefacto: `research/phase-60.6.1-benchmark-raw.json`  
Script: `node/scripts/research-60.6.1-benchmark.ts`

### Evidencia principal (primer pase, ambos OK)


| --- | ---: | ---: |
| Empty rate | 0/16 | 0/16 |
| Avg relevance top3 | 0.762 | 0.828 |
| Avg official/gov/uni | **1.56** | **3.88** |
| Avg academic | **6.0** | 0.75 |
| Avg latency | ~5005 ms* | ~1142 ms |

\*Latencia inflada por abort de arxiv ~5s en ese pase; presupuesto arxiv bajado después.

### Providers (mismo pase)

| Provider | success | rate_limited | notas |
| --- | ---: | ---: | --- |
| DuckDuckGo | **50%** | 50% | Cuando OK, ogU ES/MX sube fuerte |
| Mojeek | 0% | **100%** | Captcha consistente desde esta red |
| OpenAlex / Crossref | 100% | — | Academic estable |
| Wikipedia | ~12.5% | — | Muchas queries MX → empty |
| Arxiv | — | — | timeouts frecuentes |

Highlight: `doctorado inteligencia artificial México` con DDG `success` → PA
`rate_limited` → PA cae a academic-only.

### Pases posteriores

requests, `duckduckgo` CAPTCHA) → empty 13/16–16/16. **No usar esos pases como
baseline de calidad.** El JSON guarda `comparativeRun` + `notes`.

### vs PHASE 60.6

- Clasificación de fallos: **sí** (antes se confundía captcha con empty/http_error).
- Official/gov/uni: mejora **condicional** a DDG usable (de ~0–1 sumado a
- Academic: **mantenida** (OpenAlex/Crossref).
- Latencia: ~1.9–2.0s típico tras bajar budget arxiv (vs ~1849 ms en 60.6);
  no hay victoria clara hasta que HTML providers respondan o se recorten más.

## Tests

`node/tests/research/search-engine-60.6.1.test.ts` — DDG/Mojeek
(normal/empty/rate_limit/malformed/cancel), ranking por intent, ES/MX,
diversidad, dedupe www/http, `providerReports`, sin secretos en reportes.

```text
33 tests pass (60.6 + 60.6.1)
```

## Licencias

Sin dependencias npm nuevas. Sin código AGPL.  
`docs/legal/search-engine-licenses.md` — sin cambios de inventario (solo nota
60.6.1 de hardening parsers propios).

## Criterio de éxito (evaluación)

| Criterio | ¿Cumple? |
| --- | --- |
| Academic mantener | **Sí** |
| General web mejora significativa | **Parcial** (solo cuando DDG no rate-limita) |
| ES/MX mejora significativa | **Parcial** (mismo cuello de botella) |
| Latencia ↓ vs 60.6 | **No claro** |

## Recomendación siguiente fase

```text
¿Web general + MX suficientemente buenos?
→ NO todavía como PRIMARY
→ PHASE 60.6.2: mejoras de cobertura general
```

Prioridades objetivas para 60.6.2:

1. **Sustituir o complementar** DDG/Mojeek HTML con al menos un provider web
   general estable **sin API key** y ToS limpio (o aceptar que HTML scrapers
   no son PRIMARY en datacenter/VPN).
2. Mantener academic stack (OpenAlex/Crossref/Arxiv) como está.
3. No cablear producción hasta evidencia de `official/gov/uni` estable en
   corpus ES/MX **sin** depender de un 50% de suerte anti-bot.

```text
PHASE 60.6.1
     ↓
Benchmark (DDG intermitente; Mojeek CAPTCHA; academic OK)
     ↓
NO → 60.6.2 mejoras cobertura web general
```

## DoD checklist

- [x] DuckDuckGo analizado y estabilizado (detección + retry + parser)
- [x] Mojeek analizado y estabilizado (CAPTCHA explícito)
- [x] Fallos clasificados (`providerReports`)
- [x] Fan-out paralelo
- [x] Intent-aware ranking
- [x] Source classification ES/MX + SourceRule
- [x] Domain diversity
- [x] Latencia medida; presupuesto arxiv ajustado
- [x] Tests pasan
- [x] Licencias OK / sin AGPL
- [x] `research.search` producción intacto
- [x] Recomendación: **NO** pasar a adapter de producción; abrir 60.6.2
