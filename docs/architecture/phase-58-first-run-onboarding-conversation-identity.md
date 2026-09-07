# PHASE 58 / 58.1 / 58.4 — First Run, Onboarding, LLM Credentials & Dark UX

**Status:** PARTIAL (automatizado PASS; E2E Windows real pendiente)  
**Fecha:** 2026-09-07

## Modelo de estados

```text
PROFILE: name + profile_completed
LLM CONFIGURATION: provider + credential + llmConfigured
APPLICATION READY: profile_completed AND llmConfigured
```

No se mezclan. `state === READY` en SQLite **sin** clave real no es onboarding completo.
`READY` **sin** `profile_completed` tampoco salta el nombre (PHASE 58.4).

## Flujo

```text
Launch → ProfileName (si !profile_completed)
      → OnboardingWizard LLM (si !llmConfigured)
      → ConversationScreen (Personal Agent)
```

Ver también: `phase-58-4-onboarding-conversation-ux-titles.md` (composer + títulos semánticos).

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


## UX 58.1 / 58.4

- Header: nombre + **Plan Personal** (no “Tu agente”)
- Sin Home/`AgentSpaceScreen`
- Identidad de producto: **Personal Agent** (no Claude); modelo default `claude-sonnet-4-6`
- Onboarding: `AGENT_READY` → `llm_intro` (sin «Agente listo» prematuro)
- Blank: “¿En qué te ayudo?” + composer centrado (`.blank-state` / `.blank-state-content`; sin `blank-stage`; multilínea Enter/Shift+Enter; no `bottom: 0`) + autofocus
- Scroll: `.work-area:has(> .conversation-screen) { overflow: hidden }` (scroll en `.thread`)
- Títulos: seed determinista inmediato + upgrade LLM acotado; web hace poll (`refreshConversationsUntilTitled`) tras `assistant_done`
- Tema oscuro por defecto (`tokens.css`)
