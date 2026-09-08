# PHASE 60.13.1 — Brave Search Pacing & Blocking Correlation

**Estado:** completo (rerun post-clear manual)  
**Fecha:** 2026-09-08  
**Pacing case:** `D_HIGH_VARIANCE`  
**Decisión Personal Agent:** **C — EXPERIMENTAL**  
**Producción:** UNCHANGED (`electron-duckduckgo`)

## Objetivo

Medir si el intervalo entre búsquedas se correlaciona con challenge/block en Brave Search Web vía Electron (`show:false`), sin evasión.

**Hipótesis:** a mayor intervalo, menor probabilidad de bloqueo.  
**Causalidad:** no demostrada.

## Runs

| Run | Condición | Resultado |
| --- | --- | --- |
| 1 | Tras soft-block sostenido de 60.13 | 18/18 challenge en búsqueda #1; recovery ≤5 min falló → **D DESCARTAR** (estado contaminado) |
| **2 (definitivo)** | Tras clear manual (click humano; sin automatizar) | Datos con capacidad real; **alta varianza** → **C EXPERIMENTAL** |

El clear fue **humano**. No se automatizó bypass ni CAPTCHA solving.

## Método (run 2)

- 6 intervalos × 3 sesiones = 18 sesiones, orden mezclado  
- Queries 60.13; máx. 15 búsquedas o primer CHALLENGE  
- Recovery separado: espera 60s y 5 min tras challenge  

## Resultados agregados (run 2)

| Interval | Success | Mean capacity | Capacities (3 sesiones) |
| --- | ---: | ---: | --- |
| 1s | 33% | 0.7 | 0, 1, 1 |
| **5s** | **78%** | **7.3** | **10, 11, 1** |
| 10s | 33% | 5.0 | **15**, 0, 0 |
| 20s | 17% | 0.3 | 1, 0, 0 |
| 30s | 48% | 4.7 | **13**, 0, 1 |
| 60s | 17% | 0.3 | 1, 0, 0 |

Mejores sesiones aisladas: 15/15 @10s; 13/14 @30s; 10–11 @5s.  
Otras réplicas del mismo intervalo: challenge inmediato.

### Correlación (observación)

| Par | r | Nota |
| --- | --- | --- |
| intervalo ↔ success rate | −0.49 | correlación moderada **en sentido contrario** a la hipótesis |
| intervalo ↔ capacity | −0.40 | sin evidencia suficiente |
| intervalo ↔ time-to-challenge | 0.23 | sin evidencia suficiente |

**No** se observa “a más intervalo, menos bloqueo”. La señal dominante es **varianza entre sesiones**, no un umbral de pacing estable.

### Recovery (run 2)

| Wait | Tras espera |
| --- | --- |
| 60s | **temporary** — 8 hits de nuevo |
| 5 min | **temporary** — 8 hits de nuevo |

El challenge **puede** levantarse con espera (y, según el usuario, también con un click manual). No implica que el pacing lo evite de forma fiable.

## Distinción metodológica

| Tipo | Afirmación |
| --- | --- |
| OBSERVACIÓN | Capacidades 0–15 en el mismo intervalo; recovery ≤5 min a veces restaura SERP |
| CORRELACIÓN | No hay evidencia de que intervalos mayores mejoren capacidad (r negativo/débil) |
| HIPÓTESIS | Bloqueo depende más de estado/reputación acumulada que del intervalo solo |
| CAUSALIDAD | **No demostrada** |

## Decisión

**C — EXPERIMENTAL**

Brave Web **no** es un segundo provider estable sin fricción:

1. Alta varianza sesión a sesión.  
2. El pacing 1–60s **no** valida la hipótesis de estabilidad.  
3. Recovery/click pueden reabrir acceso, pero no son política de producto automática.

**Siguiente:** evaluar **Mojeek** bajo el mismo protocolo Electron.

## Artefactos

```bash
npm run research:benchmark:60.13.1
```

- `research/phase-60.13.1-brave-pacing/raw.json` (run 2)
- `research/phase-60.13.1-brave-pacing/summary.md`
- `research/phase-60.13.1-brave-pacing/chart-*.svg`

## Relacionado

- PHASE 60.13 — Brave adapter (CASE B PARCIAL)
- PHASE 60.12 — Electron primary
