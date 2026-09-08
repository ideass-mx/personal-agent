# PHASE 60.9.4 — Manual Chromium vs Playwright

**Estado:** completo (diagnóstico)  
**Fecha:** 2026-09-08  
**Producción:** sin cambios

## Objetivo

Comprobar si una búsqueda manual en Chromium y la misma búsqueda con Playwright se comportan de forma distinta ante DuckDuckGo, midiendo entrada, submit, navegación, challenge y resultados orgánicos — **sin** intentar evadir el challenge.

Consulta fija: `PostgreSQL 17`.

## Metodología

6 ejecuciones:

| # | Método | Canal |
| --- | --- | --- |
| 3 | Manual | Cursor IDE Chromium (mismo entorno visible que 60.9.3) |
| 3 | Playwright | Chrome vía Playwright, sin stealth / sin `?q=` directo |

Flujo en ambos: homepage → input → “PostgreSQL 17” → Enter → observar.

Artefactos: `research/phase-60.9.4-ddg-browser-comparison/`.

## Resultados

```text
PHASE 60.9.4
                         Manual    Playwright
------------------------------------------------
Query entered               3/3         3/3
Query submitted             3/3         3/3
Navigation                  3/3         3/3
Challenge                   0/3         3/3
Organic results             3/3         0/3
Avg result count             10           0
Avg resources               n/a         157
Avg latency             4233 ms     4412 ms
```

| Metric | Manual | Playwright | Delta |
| --- | ---: | ---: | ---: |
| Success rate | 100% | 0% | |
| Challenge rate | 0% | 100% | Δch = 1.0 |
| Organic rate | 100% | 0% | Δorg = 1.0 |

Manual: `postgresql.org` presente en las 3 ejecuciones.  
Playwright: `queryEntered`/`querySubmitted`/`navigation` ✓; `challengeDetected` ✓; orgánicos 0 (tras filtrar shell App Store/Play/Duck.ai).

## Observaciones

1. La consulta **sí** se introduce y se envía en Playwright (no es fallo del runner).
2. La navegación llega a URL con `q=PostgreSQL+17` y título `PostgreSQL 17 at DuckDuckGo`.
3. Tras el submit, el entorno Playwright recibe **challenge**; el Chromium manual no, en esta muestra.
4. No se afirma el algoritmo interno de DuckDuckGo — solo el outcome observable.
5. Cookies: solo nombres cuando disponibles; sin valores. Manual `document.cookie` → lista vacía (HttpOnly no visibles).
6. Sin técnicas de evasión.

## Conclusión

**CASE B** — `MANUAL SUCCESS / PLAYWRIGHT CHALLENGE`

## Decisión

Playwright **no** se considera vía viable para **SERP discovery**.

Mantener separado:

```text
Browser  →  interacción web (login / forms / JS / actions)
Search Engine  →  discovery / SERP por mecanismos legítimos disponibles
```

Cerrar la hipótesis: *“Browser automation is our SERP solution”*.

## Tests

Unitarios deterministas: `node/tests/research/browser-comparison-60.9.4.test.ts`  
(sanitización URL, challenge, orgánicos, normalize, summary CASE B).  
Sin tests live obligatorios en CI.
