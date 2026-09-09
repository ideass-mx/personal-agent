# PHASE 61.2.1 — Diagnóstico profundo de `RUNTIME_HEALTH_TIMEOUT`

**Estado:** DIAGNOSTIC (instrumentación lista; **sin fix especulativo**)  
**Fecha:** 2026-09-09  
**Continúa:** `phase-61.1-local-inference.md`  
**Artefacto:** `research/phase-61.2.1-runtime-health-timeout.json`

## Pregunta de cierre

> ¿Por qué `llama-server` / Qwen3 4B no llegó al estado READY dentro del tiempo esperado?

**Respuesta en este host (Linux de desarrollo):**  
`CAUSE_NOT_IDENTIFIED` para el incidente de usuario `PA-64B2B87C3FE8` — no hay bitácora local reproducible aquí.  
La fase **añade observabilidad** para poder responder con evidencia en el host donde ocurre (típicamente Windows con GGUF instalado).

---

## Environment

```text
OS (agent workspace): Linux
architecture: x86_64
runtime oficial: llama-server b10537 (CPU)
model: Qwen3 4B (qwen3-4b)
quantization: Q4_K_M (~2.33 GiB)
```

El error reportado por el usuario incluye proveedor `local` / modelo `qwen3-4b` y hora `2026-09-09T00:15:51.962Z` — coherente con el camino LocalProvider → LocalRuntimeManager.

## Execution (incidente reportado)

```text
diagnosticId: PA-64B2B87C3FE8
executionId:   (no disponible en el payload de cliente)
timestamp:     2026-09-09T00:15:51.962Z
stage:         LLM_REQUEST
component:     LLM_PROVIDER
errorCode:     RUNTIME_HEALTH_TIMEOUT
mensaje UX:    El motor local tardó demasiado en estar listo.
```

### Lookup histórico

En este workspace **no** existe SQLite de producto con eventos para `PA-64B2B87C3FE8`.

Antes de 61.2.1, aunque existiera el id, la reconstrucción completa era **imposible**:

| Evento esperado | ¿Se registraba? |
| --- | --- |
| `LLM_REQUEST_STARTED` (LocalProvider) | Sí (diagnostics store) |
| `runtime_starting` | No |
| `process_spawned` + PID hijo | No (stdout/stderr descartados; lock guardaba `process.pid` del Gateway) |
| `health_attempt` / status / ECONNREFUSED | No |
| `runtime_ready` / `RUNTIME_HEALTH_TIMEOUT` con timeline | Solo el error de producto al cliente |

**Información que faltaba (ahora instrumentada):** PID del hijo, exit code, stdout/stderr sanitizados, intentos de health, puerto, args, RAM libre antes/después.

---

## Health (comportamiento actual — **no modificado**)

Implementación en `gateway/src/local-llm/runtime-manager.ts` → `pollHealth`:

| Campo | Valor |
| --- | --- |
| URL | `GET http://127.0.0.1:{port}/health` |
| Método | GET |
| Timeout por intento | 2000 ms (`AbortSignal.timeout`) |
| Intervalo entre intentos | ~400 ms |
| Éxito | `res.ok` (HTTP 2xx) |
| Connection refused | catch → reintento hasta deadline |
| HTTP 503 / no-2xx | reintento hasta deadline (no se trata como éxito) |
| Proceso salió | `detail: process_exited` → falla |
| Deadline | `LOCAL_LLM_HEALTH_TIMEOUT_MS` (**default 120_000 ms**) |

**Nota:** el timeout de producto **no** es 10 s; el default es **120 s**. Si el incidente ocurrió ~60–120 s después del send, es consistente con este deadline. Aumentarlo sin evidencia sigue fuera de alcance de esta fase.

## Args esperados vs reales

```text
expected (código actual):
  -m <modelPath>
  --host 127.0.0.1
  --port <ephemeral>
  --ctx-size 4096
  -np 1

cwd: dirname(binaryPath)
```

La corrida live escribe `actual args` en el JSON.

## Runtime / Process / Model (checklist)

Para una corrida live (`PERSONAL_AGENT_LOCAL_LLM_LIVE=1`):

```text
binary exists / path / version (manifest)
model exists / size / checksum (catálogo)
PID hijo
port
startup duration / health attempts
stdout/stderr sanitizados
exit code si muere
RAM free before/after
conteo procesos llama-server before/during/after (=0 huérfanos)
```

## Classification A–H

La heurística `classifyRuntimeFailure()` mapea evidencia a:

| Caso | Significado |
| --- | --- |
| A | no arrancó (spawn falló) |
| B | arrancó y murió |
| C | vivo pero no escucha |
| D | escucha / cargando (p.ej. 503) sin READY a tiempo |
| E | indicios de carga pero health no reconoce |
| F | gap Provider↔Manager (no aplicable si ensureReady lanza el mismo error) |
| G | timeout posiblemente corto vs startup real |
| H | health OK pero inferencia falla |
| CAUSE_NOT_IDENTIFIED | evidencia insuficiente |

## Root cause (incidente PA-64B2B87C3FE8)

```text
CAUSE_NOT_IDENTIFIED
```

**Por qué:** no hay timeline del proceso en el host del incidente; este entorno de desarrollo no tiene el GGUF/runtime del usuario ni la bitácora SQLite original.

**Qué sí sabemos del código (evidencia estática):**

1. `RUNTIME_HEALTH_TIMEOUT` solo se lanza tras `pollHealth` fallido en `startProcess` (deadline configurado, default 120s).
2. Hasta 61.2.1, **no** se conservaban logs del hijo → no se podía distinguir A–H.
3. El lock file usa PID del **Gateway**, no del `llama-server` hijo (pista de ownership; no prueba causa raíz).

## Cómo reproducir con evidencia

```bash
# En el PC donde falla (Windows con modelo instalado):
PERSONAL_AGENT_LOCAL_LLM_LIVE=1 npm run research:diagnose:61.2.1

# Opcional: correlacionar id previo
PERSONAL_AGENT_DIAGNOSTIC_ID=PA-64B2B87C3FE8 \
PERSONAL_AGENT_LOCAL_LLM_LIVE=1 \
npm run research:diagnose:61.2.1
```

El script:

1. inspecciona binario + modelo  
2. arranca runtime vía `LocalRuntimeManager`  
3. registra timeline + stdout/stderr sanitizados  
4. si READY → inferencia mínima `"Say hello."`  
5. detiene el proceso y verifica conteo (sin huérfanos)  
6. escribe JSON (+ resumen live en `research/…-last-run.md`)  

## Tests

`gateway/tests/agent/local-llm-61.2.1.test.ts`:

- A process_spawned  
- B crash / exit  
- C runtime_ready  
- D RUNTIME_HEALTH_TIMEOUT  
- E recovery 503→200  
- F diagnosticId correlation  
- G secret redaction  

## Qué NO se hizo (alcance)

- No se aumentó el timeout  
- No se cambió Qwen3 4B / no Ollama / no Cloud fallback  
- No se reescribió la arquitectura  
- No se “arregló” el error ocultándolo  

## Definition of Done

- [x] Instrumentación spawn/health/stdout-stderr sanitizado  
- [x] Correlación diagnosticId  
- [x] Tests A–G  
- [x] Script `npm run research:diagnose:61.2.1`  
- [x] Artefacto JSON + este reporte  
- [x] Lookup de `PA-64B2B87C3FE8` intentado (no encontrado aquí)  
- [ ] Reproducción live en el Windows del usuario (pendiente de ejecución local)  
- [x] Sin fix especulativo de timeout  

**Principio:** observabilidad → timeline → evidencia → root cause → **después** corrección mínima.
