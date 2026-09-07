# Trusted Devices (PHASE 57.6)

**Estado:** IMPLEMENTED  
**Contrato:** [`identity-trust-model.md`](./identity-trust-model.md), [`session-identity.md`](./session-identity.md)

## Modelo

```text
1 User → 1 PersonalAgent → N Devices → N AuthSessions
```

| Concepto | Es | No es |
|----------|----|-------|
| Device | Identidad / confianza / auditoría / revocación | Rol, User, Node |
| AuthSession | Mecanismo interno | Objeto de UI |
| Owner | `PersonalAgent.userId === UserContext.userId` | RBAC por Device |

Todos los Devices trusted del owner comparten la autoridad del PersonalAgent.

## UI

Configuración → Conexiones → **Dispositivos** (`web/`).

Muestra: nombre, plataforma, estado, dispositivo actual, última actividad.  
No muestra tokens, session ids, hashes ni scopes.

## API

| Método | Ruta | AuthZ |
|--------|------|-------|
| GET | `/v1/devices` | `requireAgentOwner` |
| POST | `/v1/devices/:deviceId/revoke` | `requireAgentOwner` + `revokeTrustedDevice` (57.4) |

Revoke:

```text
Device REVOKED → AuthSessions revoked → WS killed
```

User / PersonalAgent intactos.

## Tool Safety vs CapabilityExecutor

```text
AgentRuntime.evaluateToolSafety  → AUTHORITATIVE
CapabilityExecutor.authorize     → technical backstop (deny-by-omission)
```

No segunda política contradictoria.

## Identidad criptográfica (PHASE 57.8)

Trusted Device puede llevar `publicKey` Ed25519 (`identity_status=crypto_enrolled`).

Auth preferida remota:

```text
device_auth_challenge → firma DeviceAuth → AuthSession
```

Legacy (`credential_hash` sin publicKey) sigue válido hasta enroll.  
Ver [`device-cryptographic-identity.md`](./device-cryptographic-identity.md).

## Fuera de alcance

OAuth, Device crypto OS backends (en curso parcial), RBAC, multi-user.

Remote access: ver [`remote-access.md`](./remote-access.md) (PHASE 57.7).
LAN ≠ Trusted Device.
