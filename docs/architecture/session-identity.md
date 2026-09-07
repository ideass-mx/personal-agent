# PHASE 57.3 — Session Identity & Scopes

**Estado:** IMPLEMENTED  
**Fecha:** 2026-09-06  
**Contrato:** [`identity-trust-model.md`](./identity-trust-model.md)  
**Fundación:** [`identity-foundation.md`](./identity-foundation.md)

## Qué es Session (producto)

**AuthSession** (`auth_sessions`) es la relación autenticada temporal:

```text
credential / transport proof
        ↓
AuthSession (product Session)
        ↓
UserContext
```

No es:

| Entidad | Rol |
|---------|-----|
| WS `Session` (`ws_*`) | Conexión efímera + HITL binding |
| `pairing_sessions` | Flujo PHASE 52 |
| Cookie / `HUB_TOKEN` | Prueba de transporte, **no** identidad |

Código: `gateway/src/identity/auth-session*.ts`. Tabla: migración `010_auth_sessions.sql`.

## Modelo

```text
AuthSession
├── id (as_…)
├── userId
├── agentId
├── deviceId?
├── nodeId?
├── clientName?
├── authKind: install_compat | device | browser
├── scopes: user | agent | device | node
├── status: ACTIVE | REVOKED | EXPIRED
├── createdAt / lastSeenAt
├── expiresAt?
└── revokedAt?
```

Scopes = **binding de entidad** (no permisos granulares por tool).

## Session ≠ Device ≠ Node

- **Device** = superficie de interacción (`trusted_devices`).
- **Node** = entorno de ejecución (sin crypto identity aún).
- **Session** = relación autenticada temporal con User/PersonalAgent.

## UserContext

Derivado **solo en servidor** desde AuthSession:

```text
Session.userId/agentId/deviceId/sessionId
        ↓
UserContext (mismo conjunto)
```

El cliente no puede imponer `userId` / `agentId`.

## Flujos

### Device (PHASE 57.8)

```text
device_auth_challenge / auth device_crypto
  → verify Ed25519 (publicKey en Gateway)
  → AuthSession kind=device
```

Legacy `authKind: device` (credential opaca) permanece para migración.  
Private key nunca llega al Gateway. Ver [`device-cryptographic-identity.md`](./device-cryptographic-identity.md).

### Browser

```text
Host POST /v1/host/browser-sessions (install)
  → one-shot launch
  → GET loopback consume
  → HttpOnly cookie (proof)
  → AuthSession kind=browser
  → WS/HTTP: kind=browser (≠ install)
```

### HUB_TOKEN (`install_compat`)

```text
Bearer HUB_TOKEN (loopback)
  → resolve/reuse AuthSession install_compat
  → UserContext.authKind=install_compat

Bearer HUB_TOKEN (peer remoto, PHASE 57.7)
  → RECHAZADO (no es Trusted Device)
```

`HUB_TOKEN ≠ userId ≠ sessionId ≠ deviceId`. Ver [`remote-access.md`](./remote-access.md).

### WebSocket

```text
auth install|device | cookie browser
  → AuthSession
  → connection.authSessionId
  → cada mensaje exige isSessionActive
  → UserContext desde AuthSession → AgentRuntime
```

### HTTP

```text
authenticateHttpRequest
  → principal { kind, authSessionId, userContext }
```

Setup/pairing/browser-mint: `requireOwnerHost` = **owner** + transporte `install_compat` (no `kind===install` como sinónimo de owner).

## Revocation + WS kill

```text
revokeSession(sessionId)
  → status=REVOKED
  → killConnectionsForAuthSession → ws.close()
```

### Device revoke (PHASE 57.4)

```text
Owner (host / install_compat)
  → revokeTrustedDevice(deviceId, UserContext)
  → trusted_devices REVOKED
  → AuthSessions(deviceId) REVOKED
  → WS(deviceId) close()
```

User / PersonalAgent **no** se revocan. Device ≠ rol.

## Owner model (PHASE 57.4)

```text
1 User → 1 PersonalAgent → N Devices → N AuthSessions
```

- Owner: `PersonalAgent.userId === UserContext.userId`
- Devices trusted del mismo owner = misma autoridad de producto
- Sin RBAC por Device
- Policy de tools = capa futura distinta

## Expiración

| kind | Política |
|------|----------|
| `browser` | TTL 12h (cookie) |
| `device` | TTL 12h |
| `install_compat` | **sin auto-expire** local; revoke o rotar `HUB_TOKEN` |

Decisión explícita: el flujo local host no debe romperse con expiración agresiva del principal de instalación.

## Qué queda para 57.7+

- Remote Access Hardening (loopback → opt-in; Trusted Device obligatorio)
- Opt-in remoto documentado (`HUB_HOST`) + `/health` acotado
- Node session crypto
- Policy editor (opcional)

## Tests

- `gateway/tests/identity/phase57-3-session-identity.test.ts`
- `gateway/tests/identity/phase57-4-owner-device-revoke.test.ts`
