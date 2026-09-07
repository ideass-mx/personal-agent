# PHASE 57.7 — Remote Access Hardening

**Estado:** IMPLEMENTED  
**Fecha:** 2026-09-06  
**Contrato:** [`identity-trust-model.md`](./identity-trust-model.md)  
**Sesión:** [`session-identity.md`](./session-identity.md)  
**Devices:** [`trusted-devices.md`](./trusted-devices.md)  
**Tools:** [`tool-policy.md`](./tool-policy.md)

## Premisa

```text
Conocer la IP y el puerto del Gateway nunca concede acceso al Personal Agent.
La red es transporte.
La identidad, confianza y autorización son independientes del transporte.
```

```text
Loopback = default
LAN = explicit opt-in
LAN ≠ trust
Tailscale ≠ identity
IP ≠ identity
HUB_TOKEN ≠ product identity
Trusted Device = trust boundary  
AuthSession = session  
**Device Ed25519** = identidad criptográfica (PHASE 57.8); private key solo en el device  
Tool Policy = action safety
```

## Modelo (sin cambio de cadena)

```text
User
  ↓
PersonalAgent
  ↓
Trusted Device
  ↓
AuthSession
  ↓
Tool Safety Policy
  ↓
Tool
```

Transporte posible: `localhost` | LAN | Tailscale | VPN | remote — **no** cambia la identidad del User.

## Bind / opt-in

| Config | Efecto |
|--------|--------|
| `HUB_HOST` omitido / `127.0.0.1` | Default. Solo loopback. |
| `HUB_HOST=0.0.0.0` u otra interfaz | **REMOTE_ACCESS_ENABLED** (explícito). |

`0.0.0.0` es dirección de bind, **no** “seguro”.

Al habilitar remote:

```text
REMOTE_ACCESS_ENABLED { bindHost, port }
```

Sin secretos en logs/diagnostics.

## Clasificación de endpoints (no RBAC)

| Clase | Ejemplos | Regla |
|-------|----------|-------|
| `PUBLIC_LOCAL` | `/health` | Loopback: diagnóstico Desktop. Off-loopback: `{ ok: true }` mínimo. |
| `OWNER_LOCAL` | setup, pairing, browser mint | Loopback + `install_compat`. |
| `OWNER_REMOTE` | `/v1/devices` | Trusted Device o browser AuthSession (owner). |
| `INTERNAL` | workspaces, diagnostics, artifacts | Auth; `install_compat` solo local. |

Código: `gateway/src/http/remote-access.ts` (`ENDPOINT_EXPOSURE_NOTES`).

## Autenticación remota

**Rechazado** solo por conocer IP/puerto/LAN/Wi‑Fi/Tailscale.

**Aceptado** para producto remoto:

```text
Trusted Device + AuthSession ACTIVE + owner
  → UserContext → AgentRuntime
```

### HUB_TOKEN (`install_compat`)

Sigue existiendo para compatibilidad de instalación.

```text
HUB_TOKEN en loopback  → install_compat (Desktop / host)
HUB_TOKEN en peer remoto → RECHAZADO
```

**Deuda de migración explícita:** copiar `Authorization: Bearer <HUB_TOKEN>` a otra máquina **no** debe convertirla en Trusted Device. PHASE 57.7 lo limita a loopback. No es identidad criptográfica de Device (eso es PHASE 57.8).

### WebSocket

```text
WS remoto
  → auth device | cookie browser
  → AuthSession activa
  → UserContext
  → AgentRuntime

WS + auth install (HUB_TOKEN) remoto → RECHAZADO
pairing_request remoto → permitido (flujo PHASE 52)
```

### Browser

```text
mint / activate → OWNER_LOCAL (loopback)
cookie HttpOnly SameSite=Strict → AuthSession kind=browser
```

Web JS **no** recibe `HUB_TOKEN`, device secret, ni AuthSession token.

CORS / Origin ≠ autenticación. Mutaciones con cookie: `SameSite=Strict` (sin CSRF framework nuevo en esta fase).

## Revocación (igual 57.4)

```text
Device revoked → AuthSessions revoked → WS killed → reconnect remoto rechazado
```

## Tool Safety (igual 57.5)

Remote access **no** cambia `ALLOWED` / `CONFIRMATION_REQUIRED` / `DENIED`.  
No hay bypass de `evaluateToolSafety` por venir de LAN.

## Tailscale / firewall

- **No** integración Tailscale en 57.7 (transporte futuro, no identidad).
- **No** reglas automáticas de firewall del SO.

## Límites de identidad de Device

```text
PHASE 57.7 → remote access hardening con identidad Device/sesión actual
PHASE 57.8 → cryptographic Device identity
```

## Diagnostics permitidos

`REMOTE_ACCESS_ENABLED`, `REMOTE_AUTH_REJECTED`, (`REMOTE_SESSION_*` cuando aplique).

Metadata: timestamp, diagnosticId, sessionId, deviceId, reason, transport, bindHost, port.  
**No:** tokens, cookies, API keys, prompts, contenido de conversación.

## Fuera de alcance

OAuth/OIDC, cloud identity, passkeys, multi-user/RBAC, crypto Device/Node, Tailscale product, exposición pública a Internet, nuevo bearer global, nuevo pairing, policy UI.
