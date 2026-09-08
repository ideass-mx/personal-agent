# Setup State + Host + Web Onboarding (Fases 2–7)

**Estado:** IMPLEMENTED  
**Fecha:** 2026-09-04

## Happy path oficial

```text
Installer → Electron host → Gateway → Node → AgentRuntime → AGENT_READY
  → Web onboarding → LLM (multi-provider catalog) → verify real → READY → Chat
  → (opcional) Android / acceso remoto
```

Sin Tailscale, Android, pairing, HUB_TOKEN manual, ANTHROPIC_API_KEY en boot ni MCP manual en el camino crítico.

## Gateway

- `setup_state` SQLite + `GET/POST /v1/setup/*`
- `GET /v1/setup/providers` — catálogo; `available=false` si no hay impl. real
- Credenciales LLM: `credentials/llm/{provider}.api_key` (+ legacy `credentials/anthropic.api_key`)
- `POST /v1/setup/llm` acepta `{ provider, credential }` (nunca echo del secreto)
- `POST /v1/setup/verify` → `LLMProvider.stream` (llamada real; injectable en tests)
- `ANTHROPIC_API_KEY` opcional al boot
- **AGENT_READY** no requiere LLM, Tailscale ni Android

## Providers

- `gateway/src/providers/registry.ts` — **local** + Anthropic `available`; OpenAI/Google `available: false`
- Default de producto (PHASE 61): modelo local Qwen3 4B — ver `docs/architecture/phase-61-local-llm.md`
- Anthropic es opcional; no se exige API key en instalación nueva

## Electron

Default: `bootHostMode()` — Gateway local, health, Console, sesión inyectada.  
Legacy: `PERSONAL_AGENT_LEGACY_ONBOARDING=1`.

## Web

`OnboardingWizard`: providers desde API; post-READY pantallas opcionales Android (pairing HTTP) y acceso remoto (`desktopApi` si existe).

## Installer

Solo instala. `installer/windows/info-before.txt` — copy humano. No configura LLM/Tailscale/Android.

## Tests

- `gateway/tests/setup/setup-state.test.ts`
- `gateway/tests/setup/providers-setup.test.ts`
- `gateway/tests/architecture/agent-ready-without-optional.test.ts`
- `gateway/tests/architecture/installer-copy.test.ts`
- `web/tests/setup-onboarding.test.ts`
- `desktop/tests/host-boot.test.cjs`
- `desktop/tests/host-mode-regression.test.cjs`

## E2E (Windows limpio)

Ver `docs/architecture/happy-path-e2e.md`.
