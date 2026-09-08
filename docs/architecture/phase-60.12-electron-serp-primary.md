# PHASE 60.12 — Electron SERP Primary + Runtime Optimization

**Estado:** completo  
**Fecha:** 2026-09-08  
**Default producción:** `electron-duckduckgo` (sin feature flag)

## Objetivo

1. Convertir `electron-duckduckgo` en el provider principal de `research.search`.
2. Optimizar el lifecycle de Electron (warm reuse + idle timeout).

## Arquitectura

```text
AgentRuntime
      ↓
research.search()     (MCP invariante)
      ↓
ResearchEngine
      ↓
Electron SERP Provider   (SearchProvider)
      ↓
Electron SERP Runtime    (stdio → electron-main.cjs)
      ↓
BrowserWindow show:false
      ↓
DuckDuckGo SERP
```


## Lifecycle

```text
COLD → STARTING → READY → BUSY → IDLE
                              ↓ idle timeout
                         STOPPING → STOPPED
```

- Una sola `BrowserWindow` reutilizada por sesión.
- Cola serial (`concurrency = 1`).
- Crash → `FAILED` → recreación en la siguiente búsqueda.
- Cancelación vía `AbortSignal` sin cerrar todo Electron.

## Configuración

| Variable | Rol |
| --- | --- |
| `ELECTRON_SERP_IDLE_TIMEOUT_MS` | Idle shutdown (default **300000** = 5 min) |
| `ELECTRON_SERP_ENABLED` | **Deprecated** — ResearchEngine la ignora |

Detalles internos (no config de usuario): BrowserWindow, userDataDir, queue, estados.

## Estrategia adoptada

**CASE A** — hipótesis validada: **Strategy B** (research-triggered warm + idle timeout).

Evidencia 60.12 (esta máquina):

| Métrica | Cold | Warm (rest) |
| --- | --- | --- |
| avg latency | ~3711 ms | ~1476 ms |
| gain | — | **~2235 ms** |

- Stress 20/20 OK; procesos Electron 1→0 tras close; idle proxy cierra runtime.
- Default idle: **5 min** (`ELECTRON_SERP_IDLE_TIMEOUT_MS=300000`).
- Sin eager warm-up al arrancar el Agent.

```text
Research starts → Electron launch → search × N → idle → Electron close
```

## DOM / extraction

- Espera observable (`hasQ` + links ≥ 6 o challenge) en lugar de sleep fijo 1500 ms.
- Recovery structural/semantic solo si selector no produjo hits.

## Benchmark

```bash
npm run research:benchmark:60.12 -w @mxideass/node
```

Artefactos:

- `research/phase-60.12-runtime-optimization-raw.json`
- `research/phase-60.12-runtime-optimization-summary.md`

## Evidencia histórica


- providers/runtime experimentales y benchmarks 60.x anteriores;
- documentación de fases previas;

pero **no** en el default de `ResearchEngine` / `research.search` MCP.

## Relacionado

- PHASE 60.10 — ElectronSerpProvider
- PHASE 60.11 — integración experimental (opt-in)
- PHASE 60.12 — primary + optimization (este documento)
