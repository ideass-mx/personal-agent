# PHASE 63.1 — Provider Source-of-Truth + xAI / Grok

## Objetivo

1. Credential Store como **única fuente de verdad** de API keys BYOK.
2. Incorporar **xAI / Grok** (`grok-4.6`) en Mi proveedor.

## Credential source of truth

```text
Intelligence Center
        ↓
Credential Store (credentials/llm/{provider}.api_key)
        ↓
getEffectiveProviderApiKey()
        ↓
LLMProvider
```

### Environment variables

`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`
and `config.anthropicApiKey` are **development/test overrides only**.

They apply **only** when:

```text
PERSONAL_AGENT_DEV_PROVIDER_ENV=1
```

> Environment variables are development/test overrides only and never silently override user-managed credentials in production.

Disconnect (Intelligence Center) deletes the Credential Store entry. With DEV env disabled, the provider becomes `NOT_CONFIGURED` even if the env var remains set.

When both Store and DEV env exist, **Store wins**.

## Audit (pre-fix)

| Provider | Antes | Ahora |
|----------|-------|-------|
| Anthropic | ENV → file → config (ENV ganaba) | file; ENV solo DEV |
| OpenAI / xAI / Groq / OpenRouter | solo file | igual + DEV ENV opcional |
| Cloud | Cloud Session (62.1) | sin cambio |
| Local | N/A | sin cambio |

## xAI / Grok

- `provider = "xai"`
- `mode = "external"` (BYOK)
- `baseUrl = https://api.x.ai/v1`
- `modelId` default = `grok-4.6`
- Display: **xAI / Grok**
- Adapter: OpenAI-compatible (`streaming` + `toolCalling`; `vision=false` en el adapter actual)
- No scrape de grok.com / cookies

## Security

BYOK keys nunca van a Web ni a Personal Agent Cloud. Redactor existente aplica a logs/diagnostics.

## Tests

`gateway/tests/providers/phase63.1-provider-sot-xai.test.ts`
