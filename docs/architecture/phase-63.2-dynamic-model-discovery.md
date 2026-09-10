# PHASE 63.2 — Dynamic model discovery

## Objetivo

Separar **conexión** de **modelo** para que un `modelId` retirado no
marque un proveedor válido como desconectado.

```text
CONNECT
  ↓
VALIDATE (credencial)
  ↓
DISCOVER (listModels del proveedor)
  ↓
COMPATIBILITY (filtrar no-chat / embeddings / …)
  ↓
RECOMMEND (ranking determinista local)
  ↓
READY
```

> Provider connection status is independent from model availability.

## Conceptos

| Concepto | Pregunta |
|----------|----------|
| Connection | ¿Personal Agent puede autenticarse con esta inteligencia? |
| Model | ¿Qué modelo disponible debe usar ahora? |

Estados mínimos:

```text
Connection: connected | not_configured | auth_failed | unavailable
Model:      available | unavailable | not_discovered | discovery_unsupported
Selection:  recommended | specific
```

## Flujo externo (BYOK)

1. El usuario pega la API key (Credential Store).
2. Gateway valida autenticación vía el endpoint oficial de modelos
   (p. ej. `GET /v1/models` OpenAI-compat, Anthropic Models API,
   OpenRouter catalog).
3. Se normalizan y filtran modelos incompatibles obvios.
4. Se elige un modelo recomendado de forma determinista.
5. Si `modelSelection = recommended`, se actualiza `modelId`.
6. Si `modelSelection = specific` y el modelo desapareció:
   la conexión permanece; el modelo queda `unavailable`
   (el usuario elige otro; el probe de conectividad puede usar la
   recomendación sin cambiar el pin).

No hay fallback automático entre inteligencias
(Local ↛ Cloud ↛ OpenAI …).

## Personal Agent Cloud

Personal Agent Cloud es la **fuente de verdad** de su modelo
recomendado (hoy: constantes del Gateway / Cloud SOT).

El cliente Web/Desktop **no** debe depender de un ID de tercero
hardcodeado como única opción. Consume lo que el Gateway expone en
`GET /v1/setup/providers/personal-agent-cloud/models`.

## Local

Sin discovery remoto. Sigue el catálogo instalado (Qwen3 4B, etc.).

`supportsModelDiscovery = false` / `modelStatus = discovery_unsupported`.

## API

| Endpoint | Uso |
|----------|-----|
| `POST /v1/setup/llm` | Conectar key → discovery → recommended |
| `POST /v1/setup/providers/:id/test` | Validate + discover + probe con modelo resuelto |
| `GET /v1/setup/providers/:id/models` | Catálogo descubierto (`?refresh=1` fuerza) |
| `POST /v1/setup/intelligence/model` | Pin explícito (`specific`) |

Nunca se devuelven API keys ni session tokens.

## Recomendación

Orden de preferencia (simple, documentado):

1. Modelos de chat (excluye embeddings / audio / imagen …)
2. Tools cuando el metadata lo indica
3. Structured output
4. Context window adecuado
5. Preferencias suaves por proveedor (desempate, no catálogo cerrado)
6. Orden estable por `id`

## Caché

`config/provider-models-cache.json` (~30 min). Sin polling en
background. Refresh al conectar, al probar, al abrir Administrar o
con «Actualizar modelos».

## Seguridad

Keys solo en Credential Store. Respuestas HTTP y diagnostics: metadata
segura. URLs autenticadas no se registran con secretos.

## Tests

`gateway/tests/providers/phase63.2-model-discovery.test.ts`
