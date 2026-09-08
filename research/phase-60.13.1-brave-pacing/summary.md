# PHASE 60.13.1 — Brave pacing summary

**Fecha:** 2026-09-08T17:26:24.247Z  
**Run:** 2 (post clear manual; definitivo)  
**Pacing case:** `D_HIGH_VARIANCE`  
**Personal Agent decision:** **C — EXPERIMENTAL**  
**Producción:** UNCHANGED

> Run 1 (host ya bloqueado tras 60.13) quedó invalidado para pacing: 18/18 challenge en #1.  
> Este summary refleja el **rerun** tras un clear humano (click); sin automatizar bypass.

## Hipótesis

> A mayor intervalo entre búsquedas, menor probabilidad de challenge/block.

## Observación (no causalidad)

- Interval vs success rate: correlación moderada (r=-0.49) — **sentido contrario** a la hipótesis
- Interval vs sustained capacity: sin evidencia suficiente (r=-0.40)
- Interval vs time-to-challenge: sin evidencia suficiente (r=0.23)

## Agregados por intervalo

| Interval | Success rate | Sustained capacity | Time to challenge | Real density | Capacities |
| --- | --- | --- | --- | --- | --- |
| 1000ms | 33% | 0.7 | 52s | 1.92/min | caps=[0,1,1] |
| 5000ms | 78% | 7.3 | 92s | 4.90/min | caps=[10,11,1] |
| 10000ms | 33% | 5.0 | 51s | 2.31/min | caps=[15,0,0] |
| 20000ms | 17% | 0.3 | 58s | 1.35/min | caps=[1,0,0] |
| 30000ms | 48% | 4.7 | 194s | 1.51/min | caps=[13,0,1] |
| 60000ms | 17% | 0.3 | 71s | 1.14/min | caps=[1,0,0] |

## Sesiones

| Interval | Session | Searches | Success | First Challenge | Capacity | Success% |
| --- | --- | --- | --- | --- | --- | --- |
| 5000ms | i5000-r3 | 11 | 10 | 11 | 10 | 91% |
| 5000ms | i5000-r2 | 12 | 11 | 12 | 11 | 92% |
| 10000ms | i10000-r3 | 15 | 15 | — | 15 | 100% |
| 30000ms | i30000-r1 | 14 | 13 | 14 | 13 | 93% |
| 5000ms | i5000-r1 | 2 | 1 | 2 | 1 | 50% |
| 30000ms | i30000-r3 | 1 | 0 | 1 | 0 | 0% |
| 1000ms | i1000-r2 | 1 | 0 | 1 | 0 | 0% |
| 60000ms | i60000-r2 | 2 | 1 | 2 | 1 | 50% |
| 20000ms | i20000-r2 | 2 | 1 | 2 | 1 | 50% |
| 20000ms | i20000-r3 | 1 | 0 | 1 | 0 | 0% |
| 30000ms | i30000-r2 | 2 | 1 | 2 | 1 | 50% |
| 60000ms | i60000-r1 | 1 | 0 | 1 | 0 | 0% |
| 1000ms | i1000-r3 | 2 | 1 | 2 | 1 | 50% |
| 60000ms | i60000-r3 | 1 | 0 | 1 | 0 | 0% |
| 10000ms | i10000-r2 | 1 | 0 | 1 | 0 | 0% |
| 1000ms | i1000-r1 | 2 | 1 | 2 | 1 | 50% |
| 10000ms | i10000-r1 | 1 | 0 | 1 | 0 | 0% |
| 20000ms | i20000-r1 | 1 | 0 | 1 | 0 | 0% |

## Recovery

| Wait | Resultado |
| --- | --- |
| 60s | **temporary** — 8 hits |
| 5 min | **temporary** — 8 hits |

## Conclusión

**C — EXPERIMENTAL.** El pacing 1–60s no valida “más intervalo ⇒ más estable”. Domina la **varianza entre sesiones**. Seguir con **Mojeek**.

## Artefactos

- `research/phase-60.13.1-brave-pacing/raw.json`
- `docs/architecture/phase-60.13.1-brave-pacing.md`
- `chart-interval-vs-*.svg`
