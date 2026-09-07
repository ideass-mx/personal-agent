# PHASE 57.11-B — Android Device Identity Security Review

**Status:** PASS WITH FIXES  
**Fecha:** 2026-09-06  
**Alcance:** revisión de seguridad del modelo actual (no nueva arquitectura).

Modelo preservado (decisión 57.11-A):

```text
Ed25519 (software / BouncyCastle)
  + MasterKey AES-256-GCM (Android Keystore)
  + EncryptedSharedPreferences
```

Protocolo PHASE 57.8 sin cambios. No se implementó Android Keystore Ed25519.

## Reviewed

- `DeviceIdentityStore`
- `Ed25519DeviceCrypto` / `DeviceIdentity`
- `KeystoreEncryptedStringStore` / `SecureStringStore`
- `HubClient.completePairingFromQr`
- `SignedConnectParamsFactory`
- `AppPreferences` (deviceId auxiliar)
- `AndroidManifest` + backup / data extraction
- Dependencias `security-crypto` + `bcprov`
- Tests unitarios de identidad / pairing wire

## Findings

1. **MasterKey** — `MasterKey.Builder` + `AES256_GCM`; sin passphrase hard-coded ni derivación desde deviceId/QR/HUB_TOKEN. **PASS.**
2. **EncryptedSharedPreferences** — AES256_SIV (keys) + AES256_GCM (values); archivo `gateway_device_identity`; private key solo ahí (JSON campo `privateKeyPkcs8Base64`). **PASS.**
3. **Private key leakage (logs / wire)** — pairing envía `publicKey` SPKI + `keyAlgorithm`; no hay `privateKey` en `ClientMessage.PairingRequest`. Logs de identidad: `device_identity_unavailable` sin material. **PASS.**
4. **Persistencia / coherencia** — `loadOrCreate` + cache; `deviceId` = SHA-256(raw public). Firmas locales verifican el par. **PASS** (tras fix de corrupción).
5. **Uninstall/reinstall** — al desinstalar, app data + Keystore de la app se eliminan → nueva identidad al reinstalar. **ACCEPTABLE** (sin copia externa de private key).
6. **Concurrency** — `loadOrCreate` es `@Synchronized`. **PASS.**
7. **Corrupt storage silent regen (antes)** — JSON ilegible / campos vacíos → `null` → **nueva identidad en silencio**. Riesgo de desalineación con Gateway. **FIXED.**
8. **Backup** — `allowBackup=true` sin exclusiones; blob ESP + tokens podían entrar en Auto Backup / device transfer (MasterKey no viaja; estado confuso). **FIXED** (exclusión XML).
9. **deviceId duplicado** — copia en DataStore (`AppPreferences`) para auth Hub legado / pairing sync. No es private key. **NECESARIA** (protocolo); no se eliminó.

## Changes

1. `DeviceIdentityStore`: corrupción / incompleto / keypair mismatch → `IllegalStateException` (no regenerar).
2. `Ed25519DeviceCrypto.keyPairMatches`: coherencia local sign+verify.
3. `backup_rules.xml` + `data_extraction_rules.xml`: excluir `gateway_device_identity` y `gateway_device_tokens`.
4. Tests: `DeviceIdentityStoreTest` + ampliación `Ed25519DeviceCryptoTest`.

## Remaining risks

- Private key materializada en RAM (cache de proceso + decode en `signPayload`). Aceptable bajo el modelo 57.11-A; no es Keystore Ed25519 no-exportable.
- `AppPreferences` DataStore (tokens Hub/Gateway, deviceId) sigue en backup salvo exclusión futura; no contiene la private Ed25519.
- Paths Hub `getOrCreateDeviceId()` pueden crear UUID antes de pairing; pairing alinea con `setDeviceId(crypto.deviceId)`.
- `security-crypto` MasterKey/ESP deprecados en 1.1; siguen siendo el puente estable en minSdk 29.
- Limitación conocida 57.11-A: Android Keystore + Ed25519 no es requisito de producto.

## Decision

```text
Mantener el modelo actual.
Corregir solo fail-safe de corrupción y exclusión de backup.
NO proceder a AndroidDeviceKeyStore (Keystore Ed25519).
NO cambiar protocolo ni algoritmo.
```
