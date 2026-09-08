# PHASE 61.1 — Local Inference Runtime

**Estado:** IMPLEMENTED (baseline)  
**Fecha:** 2026-09-08  
**Continúa:** `phase-61-local-llm.md`

> Numerate: distinto de Resource Resolution (`PHASE_61_*`). Este doc es
> **Local Inference Runtime**.

## Pregunta de cierre

> ¿Puede Personal Agent ejecutar realmente Qwen3 4B vía `llama-server`
> administrado, sin API key, sin Ollama y sin CUDA obligatorio?

**Sí**, cuando el runtime y el GGUF están instalados en el equipo.

## Arquitectura

```text
AgentRuntime
    ↓
LocalProvider
    ↓
LocalLLMRuntime (managed)
    ↓
LocalRuntimeManager
    ↓
llama-server (child process)
    ↓
Qwen3 4B GGUF
```

`AgentRuntime` no conoce procesos, puertos ni rutas.

## Runtime oficial

| Campo | Valor |
| --- | --- |
| Binario | `llama-server` (ggml-org/llama.cpp) |
| Pin | **b10537** |
| Windows | `llama-b10537-bin-win-cpu-x64.zip` |
| SHA-256 (win) | `48d02dfd…124c4dec` |
| Linux (dev) | `llama-b10537-bin-ubuntu-x64.tar.gz` |
| SHA-256 (linux) | `47963587…d1ac0f` |

**Experimental:** `node-llama-cpp` (opcional).  
**No oficial:** Ollama / LM Studio.

## Lifecycle

```text
COLD → STARTING → READY → BUSY → IDLE → STOPPING → STOPPED
                     ↘ CRASHED / FAILED
```

- Lazy start en el **primer** `ensureReady` / generate (no al boot del Gateway).
- Idle timeout: `LOCAL_LLM_IDLE_TIMEOUT_MS` (default 5 min) → stop proceso (no borra GGUF).
- Cola serial: un generate a la vez.
- Ownership: lock file bajo `…/runtime/llama-server/llama-server.lock`.
- Gateway shutdown llama `runtime.shutdown()` → mata hijo.

## Almacenamiento

```text
$PERSONAL_AGENT_DATA_DIR/runtime/llama-server/{version}/{platform-arch}/
$PERSONAL_AGENT_DATA_DIR/models/…
```

## HTTP

| Ruta | Rol |
| --- | --- |
| `GET /v1/local-llm/runtime` | instalado / estado / manifest |
| `POST /v1/local-llm/runtime/install` | descarga + SHA-256 + extract |
| `GET /v1/local-llm/status` | modelo + runtime |

## Prioridad de resolución

1. `PERSONAL_AGENT_LOCAL_LLM_FAKE=1`
2. `PERSONAL_AGENT_LOCAL_LLM_URL` (pruebas externas)
3. **llama-server administrado** (oficial)
4. node-llama-cpp (experimental)
5. `MODEL_RUNTIME_UNAVAILABLE`

## Capabilities

Sin cambios: `toolCalling: false`, `streaming: true`.

Sin fallback silencioso a Anthropic.

## Tests

- Fake/CI: `gateway/tests/agent/local-llm-61.1.test.ts`
- Live opt-in: `PERSONAL_AGENT_LOCAL_LLM_LIVE=1` + runtime/modelo instalados
  (ver `research/phase-61.1-local-inference/`)

## Benchmark

Scaffold: `research/phase-61.1-local-inference/README.md`  
Ejecutar y rellenar métricas en el entorno real (no inventar).
