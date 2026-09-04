# Happy path E2E — entorno Windows limpio

**Objetivo:** validar Fases 5–7 de extremo a extremo.

## Estado inicial

```text
No Tailscale
No Android
No LLM credential
No ANTHROPIC_API_KEY
No previous onboarding (sin setup_state / credentials previos)
```

## Flujo

```text
Installer
  ↓
Electron (host mode)
  ↓
Gateway + Node + AgentRuntime
  ↓
AGENT_READY  (sin LLM)
  ↓
Web onboarding
  ↓
Anthropic (único available)
  ↓
Verificación real LLM
  ↓
READY
  ↓
(Opcional) Android / acceso remoto — omitibles
  ↓
Chat
```

## Resultado esperado

```text
PASS
```

## Automatización en CI

- Gateway: `providers-setup` + `agent-ready-without-optional`
- Desktop: `host-mode-regression` (sin Tailscale/LLM en boot)
- Web: `setup-onboarding`
- Installer: `installer-copy` (copy + iss)

La corrida empaquetada completa en Windows limpio es **field gate** (máquina Windows). En Linux se documenta como `NOT_EXECUTED` para el instalador ISCC, pero los contratos anteriores deben PASS.
