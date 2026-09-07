# PHASE 57.12 — E2E Windows ↔ Android Device Trust

**Status:** PARTIAL (AUTOMATED PASS · Physical E2E NOT RUN)  
**Fecha:** 2026-09-06  
**Alcance:** validar arquitectura PHASE 57.8–57.11 sin rediseño.

## Environment

| Componente | Entorno de prueba |
|------------|-------------------|
| Gateway | Node + SQLite tmp (`PERSONAL_AGENT_DB`) |
| Windows Desktop | Unit tests Desktop + `ensure-host` HTTP en E2E |
| Android | Protocol-level vía `MemoryDeviceKeyStore` / sealed store; unit tests JVM |
| Transport | localhost (in-process Hono / identity APIs) |
| Remote / Tailscale | NOT RUN |
| Physical Android | NOT RUN |

## Baseline

| Suite | Resultado |
|-------|-----------|
| Gateway `npm test` | **831 pass** / 0 fail (pre-57.12) |
| Desktop `npm test` | **52 pass** |
| Android `:app:testDebugUnitTest` | **BUILD SUCCESSFUL** |
| Web `npm test` + typecheck | **21 pass** + typecheck OK |
| Gateway + `phase57-12-*.test.ts` | **4 pass** (este harness) |

No fallos preexistentes que bloquearan esta fase.

## Scenarios

Flujo demostrado (protocol-level / integration):

```text
Windows ensure-host (idempotent)
  → Android pairing (publicKey SPKI + Ed25519)
  → trusted_devices crypto_enrolled
  → challenge → Ed25519 sign → verify
  → AuthSession (authKind=device)
  → UserContext (user/agent/device/session)
  → AgentRuntime.runTurn + Tool Safety
  → wrong signature / wrong device / replay DENIED
  → Android-like restart (sealed keystore) → re-auth OK
  → DB persistence → re-auth OK
  → revoke → sessions + WS closed → challenge DENIED
  → old AuthSession DENIED
  → HUB_TOKEN no resucita device trust
  → re-pair same deviceId + same publicKey → ACTIVE again
  → legacy sin publicKey: credential OK, device_crypto challenge DENIED
```

## Test Matrix

| Scenario | Windows | Gateway | Android | Result |
| -------- | ------- | ------- | ------- | ------ |
| Host identity | ✓ | ✓ | — | **PASS** (integration) |
| Android identity | — | — | ✓ | **PASS** (unit 57.11-B + protocol sim) |
| Pairing | ✓ | ✓ | ✓ | **PASS** (protocol) |
| Public key registration | — | ✓ | ✓ | **PASS** |
| Challenge | — | ✓ | ✓ | **PASS** |
| Signature | — | ✓ | ✓ | **PASS** |
| AuthSession | — | ✓ | ✓ | **PASS** |
| UserContext | — | ✓ | ✓ | **PASS** |
| AgentRuntime | — | ✓ | ✓ | **PASS** (mock LLM turn) |
| Wrong signature | — | ✓ | ✓ | **PASS** |
| Wrong device | — | ✓ | ✓ | **PASS** |
| Replay | — | ✓ | ✓ | **PASS** |
| Android restart | — | ✓ | ✓ | **PASS** (sealed store sim + Android unit persist) |
| Gateway restart | — | ✓ | ✓ | **PASS** (SQLite persistence; same process) |
| Revoke | ✓ | ✓ | ✓ | **PASS** |
| Old session after revoke | — | ✓ | ✓ | **PASS** |
| Re-pair | ✓ | ✓ | ✓ | **PASS** (reuses same crypto identity) |
| Legacy device | — | ✓ | ✓ | **PASS** |
| Physical device E2E | — | — | device | **NOT RUN** |
| Remote E2E | — | — | — | **NOT RUN** |

## Security Assertions

```text
✓ private key never reaches Gateway (DB / HTTP / pairing JSON)
✓ wrong signature rejected
✓ wrong device rejected
✓ replay rejected
✓ revoked device rejected
✓ revoked session rejected
✓ trusted device survives Android-like restart
✓ deviceId / publicKey stable across restart sim
✓ challenge is device-bound + one-shot
✓ AuthSession belongs to correct user + agent + device
✓ UserContext authKind=device (not install_compat fallback)
✓ AgentRuntime receives that UserContext
✓ HUB_TOKEN does not bypass revoke / recreate device crypto trust
✓ legacy cannot use device_crypto challenge without publicKey
```

## Failures

None in automated suite.

## Fixes

```text
None (production).

Reason:
Existing PHASE 57.8–57.11 implementation satisfied the E2E chain.
Only test harness added: gateway/tests/identity/phase57-12-device-trust-e2e.test.ts
```

## Physical Device E2E

**NOT RUN** — no Android físico/emulador instrumentado en esta sesión.

## Remote E2E

**NOT RUN** — prioridad identidad/challenge/AuthSession en localhost.

## Remaining Risks

- Flujo WS completo (`device_auth_challenge` + `auth`/`device_crypto` en socket real) no se ejercitó como secuencia WebSocket de punta a punta (APIs identity + HTTP sí).
- QR HTTP `/v1/pairing/sessions` no se montó en este harness (pairing store sí = mismo registro de confianza).
- Reinicio real de proceso Gateway/Android no se midió; se validó persistencia SQLite + sealed keystore + unit persist Android.
- Private key en RAM en Android (modelo 57.11-A/B) permanece aceptado.

## Decision

```text
Arquitectura Windows ↔ Android device trust: VALIDADA a nivel protocolo/integración.
NO se cambió producción.
NO se rediseñó identidad / pairing / Ed25519.
Physical E2E: diferido hasta hardware disponible.
PHASE 57.12 = PARTIAL (AUTOMATED PASS).
```

## Harness

```bash
cd gateway && npx tsx --test tests/identity/phase57-12-device-trust-e2e.test.ts
```
