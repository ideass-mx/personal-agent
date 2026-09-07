# PHASE 58.3 — Browser AuthSession + Local Setup Authorization

**Fecha:** 2026-09-07

## Root cause

La consola host usa cookie `pa_browser_auth` (AuthSession browser).  
`/v1/setup/*` exigía `requireOwnerHost` → solo `install_compat` → **403**.

## Fix

`requireLocalProductSetup()` (loopback + owner):

| Auth | Local | Remote |
|------|-------|--------|
| install_compat | OK | DENIED (`localhost_only`) |
| browser AuthSession | OK | DENIED (`localhost_only`) |
| device (no install/browser) | DENIED | DENIED |

`requireOwnerHost` sin cambios (pairing / browser mint).

## Rutas

| Route | Auth gate |
|-------|-----------|
| `GET /v1/setup/status` | requireLocalProductSetup |
| `GET /v1/setup/providers` | idem |
| `POST /v1/setup/transition` | idem |
| `POST /v1/setup/llm` | idem |
| `POST /v1/setup/verify` | idem |

Status sin key + SQLite READY → `state: LLM_REQUIRED`, `llmConfigured: false`.

## Host boot

`hostBootState` IDLE|BOOTING|READY|FAILED.  
`automatic_start` no re-entra si READY.  
`gateway_start` log: pid, already, startupId, reason.
