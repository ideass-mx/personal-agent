# PHASE 60.12 — Runtime optimization summary

**Fecha:** 2026-09-08T15:33:10.193Z
**Decisión:** **CASE_A** — estrategia `B_research_session_warm_idle`

## Hipótesis

Research-triggered warm runtime + idle timeout (default **5 min** via `ELECTRON_SERP_IDLE_TIMEOUT_MS`).

## Cold (5× oneshot launch/search/close)

| avg | p50 | p95 |
| --- | --- | --- |
| 3711 ms | 2803 ms | 5961 ms |

## Warm (10× same session)

| first | avg rest | avg all | gain vs cold avg |
| --- | --- | --- | --- |
| 3505 ms | 1476 ms | 1679 ms | 2235 ms |

## Research session (5× search+fetch)

- total: **9377 ms**
- avg search: **1465 ms**
- avg fetch: **410 ms**

## Stress (20 serial)

- success: **20/20**
- avg: **1586 ms** (p50 1374, p95 3359)

## Memory (parent RSS MB)

- initial: **97.3 MB**
- after_warm_1: **86.7 MB**
- after_warm_5: **86.8 MB**
- after_warm_10: **86.8 MB**
- after_stress_20: **99.7 MB**
- after_close: **99.7 MB**

## Processes (electron-main.cjs)

- before: 0
- during: 1
- after close: 0
- cleanup: 72 ms

## Idle (proxies cortos → equivalentes 1 / 5 / 15 min)

- proxy_1min: configured 80ms (prod ~60000ms) → warmAfterIdle=false
- proxy_5min: configured 120ms (prod ~300000ms) → warmAfterIdle=false
- proxy_15min: configured 180ms (prod ~900000ms) → warmAfterIdle=false

## Quality

- warm success: **100%**
- warm avg top-3 score: **1.95** (target ≈ 2.3)
- warm avg results: **10.0**

## Producción

- Provider default: `electron-duckduckgo`
- `ELECTRON_SERP_ENABLED` **deprecated** (ignorado por ResearchEngine)
- Config útil: `ELECTRON_SERP_IDLE_TIMEOUT_MS` (default 300000)

## Artefactos

- `/home/tony/dev/ideass/personal-agent/research/phase-60.12-runtime-optimization-raw.json`
- `docs/architecture/phase-60.12-electron-serp-primary.md`
