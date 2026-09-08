# PHASE 60.13 — Brave Web SERP benchmark summary

**Fecha:** 2026-09-08T15:55:58.783Z  
**Decisión:** **CASE_B** — Brave Web: **PARCIAL**  
**Producción:** UNCHANGED (`electron-duckduckgo` default)

## Condiciones

- Runtime: Electron SERP compartido (`BrowserWindow show:false`)
- Sin Brave API / sin API key / sin stealth / sin proxies
- Smoke: 3 queries × 3 runs (warm)
- Full: 25 queries × 1 run Brave + DDG (tras el smoke, misma máquina)

## Smoke

| | |
| --- | --- |
| Pass | **true** (criterio ≥~55% success, no bloqueo sistemático inicial) |
| Success | **78%** (7/9) |
| Blocked | **22%** (últimas 2 del run 3) |
| Avg latency (ok) | **~809 ms** |
| Avg results | **10.0** |

Patrón: las primeras ~7 búsquedas devuelven SERP orgánico; hacia el final del smoke aparece challenge.

## Comparación (full)

| Metric | DDG | Brave |
| --- | --- | --- |
| Success | 100% | 0% |
| Blocked | 0% | 100% |
| Challenge | 0% | 100% |
| Empty | 0% | 0% |
| Avg latency | 1553 ms | — (bloqueado) |
| P50 | 1436 ms | — |
| P95 | 2359 ms | — |
| Avg results | 10.0 | 0.0 |
| Top-3 relevance | 2.15 | 0.00 |
| Official/Gov/Edu | 2.84 | 0.00 |
| Mexico | 3.36 | 0.00 |
| Academic | 0.24 | 0.00 |
| Domain diversity | 130 | 0 |

Tras el volumen del smoke, la sesión full de Brave quedó **100% BLOCKED**. DDG en la misma infraestructura Electron: **100% success**.

## Procesos

- before: 0  
- after: 0  

## Conclusión

**Brave Search Web vía Electron (sin API): PARCIAL.**

- Accesible y útil en ráfagas cortas (smoke).
- Bajo carga / repetición, Brave eleva challenge/bot protection (sin intentar bypass).
- No es candidato estable a segundo provider productivo todavía.
- No fallback automático. Default productivo sigue siendo DuckDuckGo.

## Artefactos

- `research/phase-60.13-brave-serp-benchmark-raw.json`
- `docs/architecture/phase-60.13-brave-serp.md`
