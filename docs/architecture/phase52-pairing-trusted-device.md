# PHASE 52 — Pairing Session, Trusted Device & Identity

**Estado:** IMPLEMENTED (protocol + Hub + Desktop QR + Android URI) · field = NOT EXECUTED  
**Fecha:** 2026-08-29  

## Auditoría `HUB_TOKEN` (antes)

| Rol ambiguo | Realidad |
|-------------|----------|
| Generación | Desktop `ensureHubToken()` → `secrets.json` |
| Auth WS | `auth.token` comparado con `config.hubToken` |
| HTTP Bearer | Workspace/History |
| Pairing UX | Copiar token + URL LAN |
| Persistencia Android | DataStore `hub_token` |

No era Pairing Session ni Trusted Device.

## Separación

```text
Agent Identity (agentId)
        ↓
Pairing Session (temporary, hashed secret, TTL 5m)
        ↓
QR personalagent://pair?...
        ↓
Android pairing_request
        ↓
Desktop Confirm
        ↓
Trusted Device + deviceCredential
        ↓
Session auth (authKind=device)
```

### Legacy

`HUB_TOKEN` / `authKind=install` permanece como **legacy install credential** para:

- boot del Hub;
- Bearer HTTP (pairing control + workspace);
- Android antiguo.

**No** va en el QR.

### agentId

Canonical: `agentId` en `secrets.json`. Migra `agentHostId` → `agentId`. Env: `PERSONAL_AGENT_ID` (+ alias `PERSONAL_AGENT_HOST_ID`).

## QR

```text
personalagent://pair?v=1&agent=<agentId>&endpoint=<ws>&session=<id>&secret=<tmp>
```

TTL: **5 minutos**. Single-use. Solo hash en SQLite.

## Recovery

Si Desktop se cierra con QR pendiente: el secreto plaintext no se recupera (solo hash). Al reabrir → **nuevo** Pairing Session + nuevo QR.

## Diagrama

```text
Desktop Agent
     │ create temporary pairing session
     ▼
    QR
     │
     ▼
Android Scanner / paste URI
     │ pairing_request
     ▼
Agent Runtime (Hub)
     │ user confirmation
     ▼
Trusted Device
     │ authKind=device
     ▼
Android Connected
```
