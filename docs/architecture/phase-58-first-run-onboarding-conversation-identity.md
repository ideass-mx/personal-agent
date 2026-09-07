# PHASE 58 / 58.1 — First Run, Onboarding, LLM Credentials & Dark UX

**Status:** PARTIAL (automatizado PASS; E2E Windows real pendiente)  
**Fecha:** 2026-09-07

## Modelo de estados

```text
PROFILE: name + profile_completed
LLM CONFIGURATION: provider + credential + llmConfigured
APPLICATION READY: profile_completed AND llmConfigured
```

No se mezclan. `state === READY` en SQLite **sin** clave real no es onboarding completo.

## Flujo

```text
Launch → ProfileName (si !profile_completed)
      → OnboardingWizard LLM (si !llmConfigured)
      → ConversationScreen (Personal Agent)
```

## Almacenamiento LLM

| Secret | Location |
|--------|----------|
| Anthropic key | `%LOCALAPPDATA%\Ideass\PersonalAgent\credentials\llm\anthropic.api_key` |
| Legacy | `...\credentials\anthropic.api_key` |
| Desktop secrets.json | ya **no** guarda `anthropicApiKey` (migra a credentials/llm) |

`gatewayEnv` siempre define `ANTHROPIC_API_KEY` (vacío si no hay key) para no heredar env del SO.

## Uninstall

1. `--shutdown-host` → `purgeInstallSecrets(productDataRoot())`
2. Inno `PurgeProductSecrets` (LOCALAPPDATA + APPDATA) con reintento
3. Opcional: borrar `data/` / logs / objects

## UX 58.1

- Header: nombre + **Plan Personal** (no “Tu agente”)
- Sin Home/`AgentSpaceScreen`
- Blank: “¿En qué te ayudo?” + composer centrado abajo + autofocus
- Tema oscuro por defecto (`tokens.css`)
