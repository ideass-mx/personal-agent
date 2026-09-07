# PHASE 57.2 — Identity Foundation

**Estado:** IMPLEMENTED  
**Fecha:** 2026-09-06  
**Contrato:** [`identity-trust-model.md`](./identity-trust-model.md)  
**Auditoría:** [`identity-trust-audit.md`](./identity-trust-audit.md)

## Qué existe actualmente (antes)

- `HUB_TOKEN` = autoridad de instalación (HTTP/WS `install`).
- `PERSONAL_AGENT_ID` / Desktop `agentId` = identidad de instalación (pairing QR).
- `AgentDefinition.id` = identidad **lógica** del runtime LLM (`personal-assistant`) — distinta.
- `trusted_devices` = Device emparejado (PHASE 52), sin `userId`/`agentId` explícitos.
- Sesión WS efímera; cookie browser tratada como install.

## Qué se implementó

| Pieza | Ubicación |
|-------|-----------|
| Migración SQLite | `db/migrations/009_identity_foundation.sql` |
| Tipos `User`, `PersonalAgent`, `UserContext` | `gateway/src/identity/types.ts` |
| Persistencia | `gateway/src/identity/store.ts` |
| `ensureLocalIdentity()` | `gateway/src/identity/ensure-local.ts` |
| `resolveUserContext()` | `gateway/src/identity/context.ts` |
| Boot Gateway | `startServer` → migrations + ensure |
| Propagación | WS `runTurn({ userContext })` → Runtime diagnostics |
| Device ownership | columnas `user_id`/`agent_id` + backfill + approve pairing |

## Identidad local

En boot (o primer `ensureLocalIdentity`):

```text
User.id        = "local-user"          # fijo; NO Windows USERNAME/SID/hostname
PersonalAgent  = PERSONAL_AGENT_ID     # si existe
               | "personal-agent"      # default
PersonalAgent.userId = User.id
```

Idempotente: reinicios **no** regeneran filas.

## Relaciones

```text
User (local-user)
  └── PersonalAgent (install agentId)
        └── Device (trusted_devices.user_id / agent_id)
```

Device ≠ Node. Node crypto/auth **no** está en esta fase.

## UserContext

```text
{
  userId,
  agentId,
  deviceId?,
  nodeId?,
  sessionId?,
  authKind?: "install_compat" | "device" | "browser",
  permissions?
}
```

- Auth WS `install` → `authKind: "install_compat"` (HUB_TOKEN **no** es `userId`).
- Auth WS `device` → `authKind: "device"`.
- Cookie browser → `authKind: "browser"`.

## Compatibilidad HUB_TOKEN

- Sigue validando HTTP Bearer y WS `authKind=install`.
- Documentado como **install_compat**.
- Tests afirman `userId !== HUB_TOKEN`.

## Distinción PersonalAgent vs AgentDefinition

| | PersonalAgent.id | AgentDefinition.id |
|--|------------------|-------------------|
| Rol | Dueño de instalación / producto | Runtime LLM lógico |
| Ejemplo | UUID Desktop o `personal-agent` | `personal-assistant` |

No unificar estos IDs.

**Nota histórica:** PHASE 4 documentaba identidad de Agent como *implícita*. Eso queda **superseded** para User / PersonalAgent / UserContext (PHASE 57.2). Sigue vigente que no hay multi-agent selection ni Node = Agent.

## Deliberadamente fuera de alcance (57.7+)

- ~~Scopes reales de cookie ≠ install admin~~ → **57.3**
- ~~Session registry + revoke kill~~ → **57.3**
- ~~Owner + device revoke cascade + loopback default~~ → **57.4**
- ~~Tool Safety Policy (ALLOWED/CONFIRM/DENIED + HITL)~~ → **57.5**
- ~~Trusted Devices UI~~ → **57.6**
- Remote access / LAN  
- Node identity criptográfica  
- OAuth / cloud / multi-user  
- Security center completo  

Ver [`trusted-devices.md`](./trusted-devices.md).

## Tests

`gateway/tests/identity/phase57-2-identity-foundation.test.ts`
