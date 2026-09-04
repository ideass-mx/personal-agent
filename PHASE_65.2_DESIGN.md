# PHASE 65.2 — DESIGN (PREFLIGHT exit + network actionable states)

## Principio

PHASE 65.2 corrige el bucle de onboarding. **No** rediseña arquitectura, MCP, Capability, Artifact ni Android.

Invariante:

```text
PREFLIGHT must not transition to PREFLIGHT.
```

## Flujo Begin Setup

```text
Begin Setup (renderer)
  → desktopApi.runPreflight (preload IPC)
  → main: run-preflight
       → runPreflight(classifyState)   # PREFLIGHT tratado como null para classify
       → resolvePostPreflightState()
       → setOnboardingState(NETWORK_* | ERROR, { reason, scenario })
       → log advance: PREFLIGHT → <next> reason=…
  → renderer: goNetworkOrReady()
       → fr-network (Tailscale missing/auth/connect)
       → o fr-network-ready tras verify OK
```

## resolvePostPreflightState

| Condición | Estado |
|-----------|--------|
| NO_DOWNGRADE | ERROR |
| Tailscale READY / networkReady | NETWORK_VERIFYING (luego verify → NETWORK_READY) |
| MISSING | NETWORK_INSTALLING |
| AUTH_REQUIRED | NETWORK_AUTHENTICATION |
| otro no-ready | NETWORK_VERIFYING |

Nunca devuelve `PREFLIGHT`.

## Install scenario (fresca vs recovery)

```text
userDataExisting =
  db | identity | firstRunComplete | midOnboarding (≠ PREFLIGHT)
  | (config && (identity|firstRun|db))

binaries alone → NEW
HUB_TOKEN alone → NEW
PREFLIGHT state → not mid-onboarding
mid NETWORK_* / AGENT_* / PAIRING / CONFIGURING → RECOVERY
```

## UI

Pantalla existente `fr-network`: mensaje si Tailscale no instalado.  
No nueva pantalla.

## Gates preservados

- `canStartAgentRuntime` exige `networkReady === true` + estado ≥ NETWORK_READY
- `verify-secure-network` solo marca NETWORK_READY si `phase === READY`
- Skip Tailscale solo en development builds

## Relación con fases

| Fase | Rol |
|------|-----|
| 51B | Máquina de estados + Tailscale gate |
| 65 | Field validation (sigue pendiente en hardware) |
| 65.2 | Fix bucle PREFLIGHT (esta fase) |

No proceder a PHASE 66 desde aquí.
