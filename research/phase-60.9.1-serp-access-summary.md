# PHASE 60.9.1 — SERP Access & Stability Summary

**Generated:** 2026-09-08T07:15:44.417Z  
**Runs:** 5 × 20 queries (HTML / Lite / Mojeek)  
**Production:** intacto  

## Pregunta

> ¿Existe un canal SERP zero-key, legítimo y suficientemente estable para discovery general?

## Hipótesis

| ID | Resultado en este entorno |
| --- | --- |
| H1 (bloqueo route-specific) | **No soportada** — HTML y Lite ambos challenge/202 o BLOCKED de forma similar |
| H2 (canal estructurado d.js) | **UNAVAILABLE** — requiere vqd/UI; sin bypass no hay SERP usable |
| H3 (Lite ≠ HTML) | Comportamiento de **acceso** equivalente (bloqueado); recipes distintas sí (fixtures) |
| H4 (Mojeek API) | **Confirmada** — API key required; **no integrada** |
| H5 (runtime útil si blocked) | **Confirmada** — recovery sintético Lite/HTML sigue en L0/L1 |

## Endpoints

| Endpoint | Access | Availability | Blocked | Stability |
| --- | --- | ---: | ---: | --- |
| html.duckduckgo.com/html/ | live | 0% | 0% (error/timeout ~100%) | No viable bajo estas condiciones |
| lite.duckduckgo.com/lite/ | live | 0% | 0% (error/timeout ~100%) | No viable bajo estas condiciones |
| links.duckduckgo.com/d.js | probe | 0% | ~100% | UNAVAILABLE |
| mojeek.com/search HTML | live | 0% | 100% | No viable bajo estas condiciones |
| Mojeek Search API | — | — | — | NOT zero-key |

Nota: en esta corrida DDG HTML/Lite fallaron por **ERROR de red/timeout** (availability 0%), no por extracción. Mojeek respondió con **CAPTCHA/BLOCKED** de forma estable (100%). Ningún canal produjo SERP usable.

### Latency (live channels)

| Provider | avg | p50 | p95 |
| --- | ---: | ---: | ---: |
| DDG HTML | 0 | 0 | 0 |
| DDG Lite | 0 | 0 | 0 |
| Mojeek | 203 | 182 | 275 |

## ACCESS vs PARSER

El fallo observado es **ACCESS (BLOCKED)**, no STRUCTURAL_CHANGE.

- **Normal SERP**: access=OK, parser=PASS, recovery=—
- **DOM drift**: access=OK, parser=FAIL, recovery=PASS
- **Partial SERP**: access=OK, parser=PARTIAL, recovery=PASS/FAIL
- **CAPTCHA**: access=BLOCKED, parser=N/A, recovery=NONE
- **403**: access=BLOCKED, parser=N/A, recovery=NONE
- **429**: access=BLOCKED, parser=N/A, recovery=NONE
- **timeout**: access=ERROR, parser=N/A, recovery=NONE

## Mojeek API

Mojeek Search API requires an API key / account and commercial plans. Does not meet Personal Agent zero-key constraint. HTML public search remains experimental only; do not depend on Mojeek API.

## Third provider

NO THIRD PROVIDER — no additional public SERP met: public SERP + legitimate access + zero API key + not metasearch + not proxying another engine.

## d.js

`UNAVAILABLE`: d.js requires vqd from DuckDuckGo web UI flow; without browser challenge completion the endpoint returns HTTP 202 / challenge JS. Completing that challenge would be anti-bot bypass — out of scope. No legitimate zero-key automated path observed in this environment.

## Decisión

### C — `SERP no operacional actualmente`

SERP architecture = VALID; SERP providers = OPERATIONALLY UNRELIABLE under zero-key constraints. Keep SERP_DISCOVERY as prepared capability; operate with JSON/API + direct-web.

**Respuesta:** Mantener `SERP_DISCOVERY` como capability experimental preparada; operar discovery con **JSON/API + direct-web + catálogos oficiales** mientras no exista un canal SERP zero-key estable.

## Artefactos

- `research/phase-60.9.1-serp-access-raw.json`
- `docs/architecture/phase-60.9.1-serp-access-stability.md`
