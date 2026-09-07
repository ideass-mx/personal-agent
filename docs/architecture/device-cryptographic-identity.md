# PHASE 57.8 — Device Cryptographic Identity

**Estado:** IMPLEMENTED  
**Fecha:** 2026-09-06  
**Contrato:** [`identity-trust-model.md`](./identity-trust-model.md)  
**Sesión:** [`session-identity.md`](./session-identity.md)  
**Devices:** [`trusted-devices.md`](./trusted-devices.md)  
**Remote:** [`remote-access.md`](./remote-access.md)

## Modelo

```text
User
  ↓
PersonalAgent
  ↓
Device
  ↓
Ed25519 identity
  ↓
AuthSession
  ↓
UserContext
  ↓
Tool Safety Policy
  ↓
Tool
```

```text
private key = device only
public key  = Gateway
```

`Device` sigue siendo la entidad. La criptografía es propiedad de identidad del Device — **no** existe `CryptographicDevice`.

## Algoritmo

**Ed25519** (Node `crypto` / abstracción multiplataforma).

No: X.509, CA, PKI, RSA, OAuth, JWT-as-identity, cloud IAM, blockchain.

## DeviceKeyStore

Paquete `@mxideass/device-crypto` (`packages/device-crypto/`):

```text
generate() → public identity
getPublicKey()
sign(payload) → signature
delete()
```

**Nunca** `getPrivateKey()` en la API pública.

| Plataforma | Backend |
|------------|---------|
| Tests | `MemoryDeviceKeyStore` |
| Windows (PHASE 57.9) | `WindowsDeviceKeyStore` — Ed25519 + **DPAPI** (`CryptProtectData`) |
| macOS | Keychain (futuro) |
| Linux | Secret Service (futuro) |
| Android | Android Keystore (futuro) |

## PHASE 57.10 — Enrollment & Pairing

Conecta PHASE 52 (pairing) + 57.8 (crypto) + 57.9 (WindowsDeviceKeyStore):

```text
Nuevo dispositivo → DeviceKeyStore.generate → publicKey en pairing_request
  → aprobación en Desktop → trusted_devices (deviceId + publicKey)
  → challenge / sign / verify
```

**Desktop host:** al boot, `ensureHostDeviceEnrollment` crea/carga `deviceId` + DeviceKeyStore e invoca `POST /v1/device-auth/ensure-host` (OWNER_LOCAL).

**Android:** `HubClient.completePairingFromQr` envía SPKI `publicKey` + `keyAlgorithm: Ed25519` (EncryptedSharedPreferences; no Android Keystore Ed25519).

**Legacy:** pairing sin `publicKey` sigue creando devices `legacy`.

UX sin jerga criptográfica. Sin estados CRYPTO_PENDING. Sin RBAC.

E2E físico Windows+Android: pendiente de validación en campo (tests deterministas en Gateway/Desktop cubren el contrato).

**Limitación CNG:** los KSP de Microsoft (Software / Platform Crypto Provider) **no** implementan Ed25519/EdDSA para firma. Curve25519 en CNG orienta ECDH, no EdDSA. **No** se cambió el protocolo a ECDSA/RSA.

**Solución mínima compatible con 57.8:**

```text
generate Ed25519 (Node crypto)
     ↓
PKCS8 DER
     ↓
DPAPI CryptProtectData (CurrentUser + entropy PersonalAgent.DeviceIdentity\n{deviceId})
     ↓
sealed.dpapi  (solo ciphertext)
meta.json     (deviceId + publicKey — sin secretos)
```

`sign()`: unprotect en memoria → firmar → descartar material. Sin `getPrivateKey()`.

Factory: `createDeviceKeyStore({ deviceId })` → Windows en `win32`, memory en tests/`forceMemory`.

El dominio **no** usa Windows username/SID/hostname/machine GUID como identidad.  
Identidad de producto: `deviceId + publicKey`.

## Persistencia Gateway

Migración `011_device_crypto.sql`:

- `trusted_devices.public_key` (SPKI DER base64)
- `trusted_devices.key_algorithm` (`Ed25519`)
- `trusted_devices.identity_status` (`legacy` | `crypto_enrolled`)
- `pairing_sessions.public_key` / `key_algorithm` (pendiente de approve)
- `device_auth_challenges` (challenge de un solo uso)

Índice único: misma `public_key` no puede estar en dos Devices **ACTIVE**.

**SQLite del Gateway no tiene columna ni valor de private key.**

## Mensaje firmado (domain separation)

UTF-8, líneas separadas por `\n`:

```text
PersonalAgent
DeviceAuth
1
{deviceId}
{challengeHex}
```

Helpers: `buildDeviceAuthMessage` en `@mxideass/device-crypto`.

No se firma el challenge desnudo.

## Challenge-response

```text
Device                         Gateway
  │──── device_auth_challenge ───▶│
  │◀─── challenge (aleatorio) ────│
  │──── auth device_crypto ───────▶│  (signature + challengeId)
  │◀─── auth_ok / AuthSession ─────│
```

Propiedades del challenge:

- 32 bytes aleatorios (hex)
- TTL corto (60s)
- un solo uso (consumed al verificar)
- atado a `deviceId`
- rechazo de replay / expirado / otro device

Protocolo WS: `packages/protocol/PROTOCOL.md`.  
HTTP: `POST /v1/device-auth/challenge|verify|enroll`.

## Pairing (PHASE 52)

```text
New Device → generate keypair → QR/pairing
  → owner approves → Gateway stores publicKey → Trusted Device
```

`pairing_request` puede incluir `publicKey` + `keyAlgorithm`.  
La private key **nunca** viaja.  
Sigue emitiéndose `deviceCredential` opaco (legacy compat).

## Migración de Devices legacy

```text
legacy (solo credential_hash)
    ↓  POST /v1/device-auth/enroll (+ Bearer device credential)
crypto_enrolled
```

No se genera private key en Gateway. No se invalidan Devices existentes automáticamente.

## AuthSession

La firma autentica al Device.  
**AuthSession** sigue siendo la unidad de sesión (no `signature = session`).

## Browser

Continúa con **HttpOnly cookie**. Sin WebCrypto/PKI de browser en esta fase.  
La identidad criptográfica pertenece al Device/host, no al JS de la Web app.

## HUB_TOKEN

Sigue siendo `install_compat`. Remoto → **REJECTED** (57.7).  
≠ identidad criptográfica de Device.

## Revocación (57.4)

```text
Device REVOKED → public_key cleared → AuthSessions revoked → WS killed
→ challenge / verify rechazados aunque la private key siga en el device
```

## Threat model

| Threat | Result |
|--------|--------|
| IP discovery | insufficient |
| LAN access | insufficient |
| Copied HUB_TOKEN (remote) | rejected |
| Copied publicKey | insufficient |
| Stolen private key | device compromise |
| Revoked device | rejected |
| Replay attack | rejected |
| Expired challenge | rejected |
| Unknown device | rejected |

**Límite:** la criptografía no protege un dispositivo cuyo SO esté completamente comprometido.

## Diagnostics (seguros)

`DEVICE_AUTH_STARTED` / `SUCCESS` / `FAILED` / `REPLAY_REJECTED` / `REVOKED`  
Metadata: diagnosticId, deviceId, sessionId, reason, timestamp.  
**No:** private key, challenge completo, signature raw, tokens.

## Fuera de alcance

PKI, OAuth, cloud identity, passkeys, RBAC, multi-user, Tailscale, Node identity, key escrow, rotación automática compleja, HSM.
