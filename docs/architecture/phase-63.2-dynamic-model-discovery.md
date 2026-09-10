# PHASE 63.2 — Dynamic model discovery & static recommendations

## Regla

> **El proveedor dice qué existe. Personal Agent recomienda. El usuario selecciona.**

```text
AVAILABLE ≠ RECOMMENDED ≠ SELECTED
```

Un modelo seleccionado retirado **no** desconecta un proveedor válido.

## Flujo

```text
                  INTELLIGENCE
                       │
                       ▼
                    PROVIDER
                       │
                  credential
                       │
                       ▼
                  GET /models
                       │
                       ▼
              AVAILABLE MODELS
                       │
             ┌─────────┴─────────┐
             │                   │
             ▼                   ▼
      Static Recommendation   User Selection
      (∩ available only)      (config)
             │                   │
             └─────────┬─────────┘
                       ▼
                 SELECTED MODEL
```

## Availability (fuente de verdad)

Para BYOK externo, la API del proveedor (con la key del usuario) lista
los modelos accesibles:

| Provider | Endpoint |
|----------|----------|
| OpenAI / xAI / Gemini / Groq / OpenRouter / openai-compatible | `GET {base}/models` |
| Anthropic | `GET https://api.anthropic.com/v1/models` |

No hay catálogo completo hardcodeado en Personal Agent.
No se scrapean sitios ni catálogos de terceros.

Cuando `/models` autentica correctamente, **esa** llamada valida la
credencial (sin un segundo `GET /validate` ni chat probe obligatorio).

## Recommendation

Abstracción:

```ts
interface ModelRecommendationSource {
  getRecommendedModel(providerId: string): string | null;
}
```

Hoy: `StaticModelRecommendationSource` + `PROVIDER_MODEL_DEFAULTS`
(un ID por proveedor, centralizado).

Futuro (sin cambiar el resto):

```text
RemoteModelRecommendationSource → Personal Agent Model Catalog API
```

Validación obligatoria:

```text
staticRecommended ∈ availableModels  →  recommended = that id
otherwise                            →  recommended = null
```

Nunca mostrar como disponible un ID solo porque está en la config estática.

Si no hay recomendación válida, la UI permite elegir entre available.
En el primer connect, si hace falta un default, se usa el **primer**
modelo del orden del proveedor (no es “recomendado”).

## Selection

`modelId` + `modelSelection` (`recommended` | `specific`) en
`intelligence.json`.

Refresh:

- selected ∈ available → se conserva
- selected ∉ available → se conserva el `modelId` y
  `modelStatus = unavailable`; el proveedor **sigue conectado**
- no se cambia un modelo retirado en silencio (ni en modo
  `recommended` ni `specific`); el usuario elige otro o «Usar recomendado»

## Local / Cloud

- **Local:** Qwen3 4B / Model Manager. Sin `/models` externo.
- **Cloud:** SOT del Gateway/Cloud (`recommendedModel` / modelos Cloud).
  El Desktop no expone el proveedor subyacente de Cloud.

## Qué NO hace esta fase

- Capability discovery / probes
- Benchmarks / scoring / routing automático
- Marketplace de modelos
- Fallback entre inteligencias

## API

| Endpoint | Uso |
|----------|-----|
| `POST /v1/setup/llm` | Key → `/models` → recommended ∩ available |
| `POST /v1/setup/providers/:id/test` | Validate vía discovery |
| `GET /v1/setup/providers/:id/models?refresh=1` | Refresh catálogo |

Caché ligera (~30 min); «Actualizar modelos» fuerza refresh.

## Seguridad

Keys solo en Credential Store. Nunca a Web, logs, URLs ni Cloud BYOK.

## Tests

`gateway/tests/providers/phase63.2-model-discovery.test.ts`
