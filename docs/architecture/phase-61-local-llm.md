# PHASE 61 — Local LLM + Gateway + Web + Installer

**Estado:** IMPLEMENTED (baseline Qwen3 4B)  
**Fecha:** 2026-09-08

> **Nota de numeración:** en este repositorio existen documentos `PHASE_61_*`
> de *Resource Resolution* (Object Storage). Esta fase de producto
> **Local LLM** se documenta aquí como `phase-61-local-llm.md` para no
> mezclar ambos trabajos.

## Pregunta de cierre

> ¿Puede una instalación nueva conversar con un modelo local **sin API key**
> externa, con Qwen3 4B como default?

**Respuesta objetivo: YES** (chat vía LocalProvider cuando el modelo está
instalado y el runtime disponible).

## Arquitectura

```text
Web  →  Gateway  →  AgentRuntime  →  LLMProvider
                                      ├── LocalProvider  → LocalLLMRuntime → Qwen3 4B
                                      └── AnthropicProvider (opcional)
```

```text
HardwareDetector → HardwareProfile → ModelAdvisor → LocalModelManager
                                                       ↓
                                                    Qwen3 4B GGUF
```

## Modelo default

| Campo | Valor |
| --- | --- |
| `modelId` | `qwen3-4b` |
| Display | Qwen3 4B |
| Variante | Q4_K_M (CPU) |
| Pesos | [Qwen/Qwen3-4B-Instruct-2507](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) (Apache-2.0) |
| GGUF | [bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF](https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF) · `Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf` |
| SHA-256 | `2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e` (HF LFS oid) |
| Tamaño | 2 497 280 736 bytes |

**No se exige GPU ni CUDA.**

## Almacenamiento

```text
$PERSONAL_AGENT_DATA_DIR/models/   (o %LOCALAPPDATA%\Ideass\PersonalAgent\models)
```

Abstracción: `ModelStorage` (`gateway/src/local-llm/storage.ts`).

## Runtime

Prioridad (PHASE 61.1):

1. `PERSONAL_AGENT_LOCAL_LLM_FAKE=1` → fake (tests / CI)
2. `PERSONAL_AGENT_LOCAL_LLM_URL` → HTTP OpenAI-compatible externo (pruebas)
3. **`llama-server` administrado** (oficial) — ver `phase-61.1-local-inference.md`
4. `node-llama-cpp` (opcional, experimental)
5. Si no hay runtime → `MODEL_RUNTIME_UNAVAILABLE`

## Capabilities (Qwen3 4B en esta fase)

| Capability | Valor |
| --- | --- |
| streaming | true |
| toolCalling | **false** (no afirmar soporte fiable aún) |
| structuredOutput | false |
| vision | false |
| contextWindow | 8192 |

Sin fallback silencioso Local → Anthropic.

## Setup / Web

- Onboarding por defecto: detectar hardware → recomendar Qwen3 4B → descargar.
- No se pide API key en el camino crítico.
- Configuración → **Inteligencia**: modelo local + estado.
- Anthropic permanece en «configuración avanzada».

## HTTP

| Ruta | Rol |
| --- | --- |
| `GET /v1/local-llm/hardware` | resumen hardware |
| `GET /v1/local-llm/recommendation` | ModelAdvisor |
| `GET /v1/local-llm/models` | catálogo + instalados |
| `GET /v1/local-llm/status` | ready / not_installed |
| `POST /v1/local-llm/install` | descarga + valida + activa |
| `POST /v1/local-llm/activate` | modelo activo |

## Installer

Inno Setup solo crea directorios y copy humano. **No** pide API keys.
La lógica vive en Gateway (`HardwareDetector` / `ModelAdvisor`).

## Limitaciones conocidas

- Tool calling local no habilitado en PHASE 61.
- Descarga real requiere red la primera vez (~2.3 GB).
- `node-llama-cpp` es opcional; en CI se usa fake o URL.
- Research complejo puede requerir Claude más adelante (opt-in explícito).

## Tests

- `gateway/tests/agent/local-llm-61.test.ts`
- Extiende setup: arranque sin `ANTHROPIC_API_KEY`

## Seguridad

Logs: `modelId`, duración, códigos de error. **No** prompts, keys ni rutas con secretos.
