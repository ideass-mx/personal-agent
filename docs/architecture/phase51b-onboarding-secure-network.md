# PHASE 51B — Onboarding red segura (Tailscale gate)

**Estado:** IMPLEMENTED (shell/onboarding) · field Windows/Android = NOT EXECUTED  
**Fecha:** 2026-08-28  

## Auditoría previa (realidad)

| Pieza | Tecnología | Rol |
|-------|------------|-----|
| Instalador de binarios | Inno Setup (`installer/windows/personal-agent.iss`) | Copia layout a `%LOCALAPPDATA%\Programs\PersonalAgent` |
| Onboarding / Control Center | Electron (`desktop/`) | First-run + supervisión del Hub |
| Agent Runtime | Hub hijo (`gateway/hub.cjs` vía `runtime/node/node.exe`) | **No** hay Windows Service |
| Pairing Android | `HUB_TOKEN` + WS `auth` | Persistido en `secrets.json` + SQLite devices |
| Tailscale (antes) | Solo docs / hábito de desarrollo | **Sin código de producto** |

Inno **no** ejecuta la máquina de estados: no puede hacer OAuth de Tailscale ni UI recuperable. El onboarding vive en el shell post-install.

## Regla

> Tailscale READY es prerrequisito para declarar el Agent Runtime operable / READY.

Orden: Preflight → Secure network → Agent init → Identity → Pairing → Capabilities → READY.

## Máquina de estados

Persistida en `%LOCALAPPDATA%\Ideass\PersonalAgent\config\onboarding.json`:

`PREFLIGHT` → `NETWORK_*` → `NETWORK_READY` → `AGENT_PROVISIONING` → `AGENT_INITIALIZING` → `AGENT_READY` → `PAIRING` → `CONFIGURING` → `READY` | `ERROR`

`AGENT_PROVISIONING` (antes `AGENT_INSTALLING`): config, identidad, directorios, validación — **no** instalación de binarios (Inno ya los copió). Persistencias antiguas con `AGENT_INSTALLING` migran automáticamente.

## Tailscale (fases estrictas)

| Fase | Significado |
|------|-------------|
| `MISSING` | CLI/instalación no disponible |
| `AUTH_REQUIRED` | Instalado; falta autenticación (o backend detenido sin red usable) |
| `CONNECTED` | Autenticado + Self + backend activo (Running/Starting), aún sin dirección Tailscale válida |
| `READY` | `BackendState=Running` + Self válido + ≥1 dirección Tailscale |

`NETWORK_READY` del onboarding **solo** si `phase === READY`.

## Escape de desarrollo

`PERSONAL_AGENT_SKIP_TAILSCALE=1` solo si el build **no** es producción (`NODE_ENV=production`, `PERSONAL_AGENT_PRODUCTION=1`, o Electron `app.isPackaged` / `ELECTRON_IS_PACKAGED=1`). En producto se ignora.

## No implementado (deuda consciente)

- Windows Service nativo (sigue siendo proceso supervisado por Electron)
- Elevación obligatoria / MSI de Tailscale embebido (se abre descarga oficial)
- QR criptográfico de pairing (sigue URL + token)
- Field validation Windows/Android real
