# PHASE 62 — Intelligence Modes (Local / Personal Agent Cloud / External BYOK)

## Objetivo

Introducir un modo explícito de inteligencia sin crear arquitecturas paralelas:

- `local`
- `personal-agent-cloud`
- `external`

Sin modo automático y sin fallback silencioso entre proveedores.

## Arquitectura

```text
AgentRuntime
   ↓
LLMProvider
   ↓
IntelligenceRouterProvider
   ├─ LocalProvider (llama-server gestionado por LocalLLMRuntime)
   ├─ PersonalAgentCloudProvider (API cloud)
   └─ External providers (BYOK)
```

`AgentRuntime` continúa desacoplado de OpenAI/Anthropic/xAI/OpenRouter/Groq/llama-server.

## Contratos

Se mantiene contrato común en `gateway/src/providers/types.ts`:

- `LLMRequest`
- `LLMEvent`
- `LLMProvider`
- `LLMCapabilities` (nuevo, opcional)

## Modelo de configuración

Se agrega `IntelligenceMode` y `LLMConnection` en `gateway/src/providers/intelligence.ts`.

Persistencia no-secreta:

- `.../config/intelligence.json`
  - `selectedConnectionId`
  - `connections[]` (sin API keys)

Secrets:

- Se guardan por provider en store local de credenciales existente (`llm-key.ts`).
- No se serializan en `intelligence.json`.

## Providers soportados en esta fase

- Local (`local`)
- Personal Agent Cloud (`personal-agent-cloud`)
- External/BYOK:
  - `openai`
  - `anthropic`
  - `xai`
  - `openrouter`
  - `groq`
  - `openai-compatible`

## Seguridad

- API keys BYOK permanecen en el dispositivo.
- `openai-compatible` valida `baseUrl` y aplica guardas SSRF (`assertUrlSafeForFetch`).
- No se exponen credenciales en respuestas HTTP de setup.

## Onboarding / Setup

`/v1/setup/providers` ahora devuelve:

- catálogo de providers
- conexiones disponibles
- conexión seleccionada
- disponibilidad local (incluye advertencia por hardware limitado)

`/v1/setup/intelligence/select` permite cambiar explícitamente el modo/conexión.

`/v1/setup/llm`:

- acepta Cloud sin API key de usuario;
- para BYOK guarda credencial + conexión (provider/model/baseUrl si aplica).

## Diagnóstico

El router registra metadatos por request:

- `mode`
- `provider`
- `model`

Sin secretos.

## Restricciones explícitas de la fase

- No fallback automático (`local ↔ cloud ↔ external`)
- No modo automático
- No cambio de arquitectura de AgentRuntime/MCP/Node

## Seguimiento

Auth Cloud de producción (challenge Ed25519 + sesión corta): **PHASE 62.1** —
`docs/architecture/phase-62.1-cloud-auth.md`.
`PERSONAL_AGENT_CLOUD_SESSION_TOKEN` es solo DEV/TEST (`PERSONAL_AGENT_CLOUD_DEV_AUTH=1`).
