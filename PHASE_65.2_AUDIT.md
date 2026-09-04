# PHASE 65.2 — AUDIT (Fix PREFLIGHT recovery loop)

Fecha: 2026-09-04.

## Síntoma

Tras «Begin Setup» en la app empaquetada Windows:

```text
PREFLIGHT → scenario=RECOVERY → tailscalePhase=MISSING → networkReady=false
→ PREFLIGHT → PREFLIGHT (transition) → … (indefinido)
```

La UI no avanzaba a un estado de red accionable.

## Root cause (exacto)

### 1. `PREFLIGHT → PREFLIGHT` (código)

En `desktop/main.js` handler `run-preflight`:

1. `setOnboardingState(PREFLIGHT)` — si ya estaba en PREFLIGHT → log `transition from=PREFLIGHT to=PREFLIGHT`
2. Tras `runPreflight`, otra vez `setOnboardingState(PREFLIGHT, { scenario })` → **segundo** self-loop

Eso implementaba “polling” / persistencia vía `transition(PREFLIGHT)`, prohibido por invariante.

### 2. Por qué `scenario=RECOVERY` en instalación fresca

`classifyInstallScenario` trataba como “instalación existente”:

- **binarios del producto** (siempre presentes tras Inno) → `anyExisting=true`
- **`onboardingState=PREFLIGHT`** (forzado justo antes del classify) → `incompleteOnboarding=true` → **RECOVERY**
- **`hasPairing=true`**: `getUiSnapshot()` llamaba `getHubToken()` → `ensureHubToken()` creaba `HUB_TOKEN` al primer refresh de UI, sin first-run real

Combinación: layout Inno + PREFLIGHT + credencial eager = RECOVERY falso.

### 3. Por qué la UI “no avanzaba”

Tras preflight el estado **permanecía** en `PREFLIGHT`.  
`publishState` → renderer `onState` → `resumeFromState(PREFLIGHT)` → **vuelve a `fr-welcome`**.  
El usuario pulsa otra vez Begin Setup → mismo ciclo (apariencia de bucle infinito).

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `desktop/main.js` | `run-preflight` avanza a estado de red; no eager HUB_TOKEN en snapshot |
| `desktop/lib/preflight.cjs` | `resolvePostPreflightState()` |
| `desktop/lib/onboarding.cjs` | PREFLIGHT→PREFLIGHT = `patch`, no `transition` |
| `desktop/lib/install-scenario.cjs` | NEW vs RECOVERY sin binaries-only / PREFLIGHT / pairing-only |
| `desktop/renderer/app.js` | Tras preflight → UI de red (`goNetworkOrReady`) |
| `desktop/tests/onboarding-unit.test.cjs` | Regresiones PHASE 65.2 |

## Transiciones afectadas

```text
ANTES:  * → PREFLIGHT → PREFLIGHT (loop)
DESPUÉS:
  PREFLIGHT (entry / welcome)
    → run-preflight
    → NETWORK_INSTALLING     (Tailscale MISSING)
    → NETWORK_AUTHENTICATION (AUTH_REQUIRED)
    → NETWORK_VERIFYING      (CONNECTED / READY pending verify)
    → ERROR                  (NO_DOWNGRADE)
```

`NETWORK_READY` sigue siendo gate duro vía `verify-secure-network` (`phase === READY`).

## Fix (resumen)

1. Tras preflight, **siempre** salir de PREFLIGHT hacia un estado `NETWORK_*` (o ERROR).
2. No clasificar PREFLIGHT ni layout Inno ni HUB_TOKEN aislado como RECOVERY.
3. No crear HUB_TOKEN en `getUiSnapshot`.
4. UI: mostrar pantalla de red existente cuando Tailscale falta.

## Tests

Desktop: 29 pass (incl. 6 casos PHASE 65.2).  
Gateway 714, Node 240 (+3 skip), packaging 8, typecheck, build, smoke:package — PASS.

## Packaged Windows

Verificación del Setup.exe instalado en máquina Windows limpia: **NOT_EXECUTED** en este host Linux (esperado).  
Lógica cubierta por unit tests + smoke package Linux.

## Seguridad

- Sin bypass Tailscale.
- Sin debilitar `NETWORK_READY`.
- Logs sin secretos (`reason` sanitizado / redaction existente).
