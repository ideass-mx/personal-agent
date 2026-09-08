# PHASE 61.1 — Local inference benchmarks

Entorno real (no inventar números). Opt-in:

```bash
PERSONAL_AGENT_LOCAL_LLM_LIVE=1
# Runtime + GGUF ya instalados bajo PERSONAL_AGENT_DATA_DIR
```

## Checklist a medir

| Métrica | Cold | Warm | Notas |
| --- | --- | --- | --- |
| Runtime start (ms) | | | hasta `/health` |
| Model load (ms) | | | incluido en start si aplica |
| Time to first token (ms) | | | |
| Tokens/sec | | | |
| Generación total (ms) | | | prompt fijo |
| RAM before (MB) | | | |
| RAM after load (MB) | | | |
| RAM after stop (MB) | | | |
| CPU % peak | | | |

## Prompt de referencia

```text
Hola, ¿quién eres? Responde en una frase.
```

## Hardware de esta corrida

```text
CPU:
RAM:
OS:
Fecha:
llama.cpp build: b10537
model: qwen3-4b Q4_K_M
```

## Resultados

_Pendiente de ejecución en máquina real._
