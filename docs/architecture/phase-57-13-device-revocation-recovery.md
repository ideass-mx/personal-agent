# PHASE 57.13 — E2E Device Revocation & Recovery

**Status:** PARTIAL (AUTOMATED PASS · Physical / real-socket E2E NOT RUN)  
**Fecha:** 2026-09-06  
**Base:** arquitectura PHASE 57.8–57.12 (sin rediseño)

## Environment

| Pieza | Prueba |
|-------|--------|
| Gateway | SQLite tmp + Hono `/v1/devices` + `/v1/device-auth/*` |
| Android | Protocol-level (`MemoryDeviceKeyStore` / sealed store) |
| WebSocket | Mock session + `killConnectionsForDevice` (no servidor WS físico) |
| Physical Android | NOT RUN |
| Remote / Tailscale | NOT RUN |

## Baseline

| Suite | Resultado |
|-------|-----------|
| Gateway | **835 pass** |
| Desktop | **52 pass** |
| Web | **21 pass** |
| Android unit | **BUILD SUCCESSFUL** |
| PHASE 57.12 | **4 pass** (sigue PASS) |
| PHASE 57.13 harness | **2 pass** |

## Initial Trust

```text
PASS — pairing + publicKey → trusted_devices ACTIVE crypto_enrolled
```

## Authentication

```text
PASS — challenge → Ed25519 sign → AuthSession authKind=device
```

## Revocation

```text
PASS — POST /v1/devices/:id/revoke (owner) → status REVOKED
Registro permanece (no se elimina); public_key limpiada.
```

## Session invalidation

```text
PASS — isSessionActive(AuthSession₁)=false
       resolveUserContextFromSessionId → null
```

## WebSocket invalidation

```text
PASS (mock) — killConnectionsForDevice cierra WS de A; authenticated=false
Real WebSocket server framing: NOT RUN
```

## Challenge after revoke

```text
PASS — issueDeviceAuthChallenge → DENIED (revoked)
       HTTP /v1/device-auth/challenge → error revoked
```

## HUB_TOKEN bypass

```text
PASS — install_compat sigue disponible en loopback (owner)
       NO emite challenge crypto para dispositivo REVOKED
       NO restaura trusted crypto vía HUB_TOKEN
```

## Device isolation

```text
PASS — revoke(A) → B sigue ACTIVE y puede re-autenticarse
```

## Session isolation

```text
PASS — Session A REVOKED; Session B ACTIVE; WS B no cerrado
```

## Re-pair

```text
PASS — Caso A: same deviceId + same publicKey (ON CONFLICT → ACTIVE)
Nueva deviceCredential; la anterior DENIED
```

## Recovery

```text
PASS — challenge/sign/AuthSession/UserContext tras re-pair
```

## Restart tests

| Caso | Resultado |
|------|----------|
| Android restart while revoked | PASS (identidad local sí; auth DENIED) |
| Gateway DB while revoked | PASS (status REVOKED persiste) |
| Android/store after recovery | PASS (nueva auth OK) |
| Gateway after recovery | PASS (SQLite ACTIVE + re-auth) |

## Tool Safety

```text
PASS — sin AuthSession válida no hay UserContext de sesión
       tras recovery: filesystem.read ALLOWED con UserContext device
Capas no fusionadas: Device Auth → UserContext → Tool Policy
```

## Physical E2E

**NOT RUN**

## Remote E2E

**NOT RUN**

## Code changes

```text
tests + documentation only
```

- `gateway/tests/identity/phase57-13-device-revocation-recovery.test.ts`
- `docs/architecture/phase-57-13-device-revocation-recovery.md`

## Security findings

None. No bypass de revocación detectado en el harness automatizado.

## Remaining risks

- Servidor WebSocket real (framing completo) no ejercitado.
- Hardware Android físico no ejercitado.
- `resolveDeviceAuthSession` no re-chequea REVOKED por sí solo; depende de `verifyDeviceCredential` / challenge path (comportamiento actual documentado y cubierto).

## Decision

```text
Sí: se puede revocar confianza por completo, invalidar sesiones/conexiones
del dispositivo, impedir challenge/credencial/HUB_TOKEN bypass, aislar
otros dispositivos, y recuperar solo vía pairing oficial.

Cerrar capa automatizada de PHASE 57.13.
Physical E2E diferido.
Sin cambios de producción.
```

## Harness

```bash
cd gateway && npx tsx --test tests/identity/phase57-13-device-revocation-recovery.test.ts
```
