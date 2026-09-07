# PHASE 57.11-A — Android Keystore + Ed25519 (validación técnica)

**Estado:** VALIDATION COMPLETE — **no implementar 57.11-B todavía**  
**Fecha:** 2026-09-06  
**Producto:** `minSdk = 29` (`mobile/android/app/build.gradle.kts`)  
**Protocolo:** Ed25519 / SPKI / challenge-response (PHASE 57.8) — **sin cambios**

## Compatibilidad

```text
Android Keystore + Ed25519
minSdk 29: NOT SUPPORTED
```

(como **requisito de producto** para todos los dispositivos del floor minSdk 29)

Más preciso:

```text
API 29–32: NOT SUPPORTED (API / provider)
API 33–34: CONDITIONAL / frágil (NamedParameterSpec existe; Keystore no es contrato de producto)
API 35+ (Android V / CTS Curve25519Test): CONDITIONAL por dispositivo/provider
           — aún así NO elevamos minSdk ni fragmentamos el protocolo
```

## Pregunta

> ¿Puede Android Keystore custodiar y firmar nuestra identidad Ed25519 de forma utilizable con minSdk 29?

**Respuesta:** No como infraestructura única del producto.

## Evidencia

### Documentación / AOSP / CTS

1. Comentario ya presente en `Ed25519DeviceCrypto.kt`: Ed25519 no fiable en Keystore con minSdk 29.
2. `NamedParameterSpec.ED25519` — API **33+** (no ayuda a API 29).
3. AOSP registra `KeyPairGenerator.Ed25519` / curvas 25519 en Keystore2 en líneas Android 13+; la madurez de firma Ed25519 en CTS (`Curve25519Test`) indica soporte esperado **desde Android V preview (API 35)**:
   - `"AndroidKeyStore supports key generation of curve Ed25519 from Android V preview"`.
4. CTS firma con `Signature.getInstance("Ed25519")` tras generar con `EC` + `ECGenParameterSpec("ed25519")` o `KeyPairGenerator("Ed25519")` — no aplica al rango 29–32.

### Código de producto actual (sigue vigente)

```text
Ed25519 (BouncyCastle software)
     ↓
PKCS8 cifrado en EncryptedSharedPreferences
     ↓
MasterKey AES en Android Keystore
```

Keystore hoy protege la **clave AES envolvente**, no la Ed25519 nativa no-exportable.

### Sonda técnica añadida (esta fase)

| Artefacto | Rol |
|-----------|-----|
| `AndroidKeystoreEd25519Validation.kt` | Conclusión de producto (JVM-safe) |
| `AndroidKeystoreEd25519Probe.kt` | Intentos generate / SPKI / sign / verify BC |
| `AndroidKeystoreEd25519ProbeTest` (unit) | Conclusión minSdk 29 + Ed25519 software |
| `AndroidKeystoreEd25519ProbeInstrumentedTest` | Ejecutar en device real si hay uno |

## Resultados por paso (contrato)

### Generación

| Ámbito | Resultado |
|--------|----------|
| API 29 (producto floor) | **FAILED / no esperado** — provider no ofrece Ed25519 Keystore utilizable |
| API 35+ (CTS) | Posible en dispositivos que pasan CTS; **no** es el floor del producto |

### Public key (SPKI DER)

Solo evaluable si la generación Keystore tuvo éxito. Formato Gateway: SPKI DER base64 (OID 1.3.101.112) — ya implementado en software vía `Ed25519DeviceCrypto.publicKeySpkiBase64`.

### Firma `sign(challenge)`

Requiere clave Keystore Ed25519 + `Signature.getInstance("Ed25519")`. No disponible de forma fiable en minSdk 29.

### Verificación

El stack actual (BouncyCastle / Gateway Node) verifica firmas Ed25519 del path software. No se cambió Gateway.

## Dispositivos / API levels **realmente** ejercidos en esta sesión

| Entorno | Qué se ejecutó |
|---------|----------------|
| Análisis AOSP/CTS + código repo | Sí |
| Unit test JVM (`AndroidKeystoreEd25519ProbeTest`) | Sí (conclusión de producto + Ed25519 software) |
| Emulador/dispositivo físico instrumentado | **No ejecutado en esta sesión** (sin device CI conectado aquí) |

Para corrida local con device:

```bash
cd mobile/android
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=\
mx.ideass.personal.agent.gateway.auth.AndroidKeystoreEd25519ProbeInstrumentedTest
```

Buscar en logcat: `PHASE_57_11A_*`.

## Limitaciones

- Soporte Keystore Ed25519 **depende de API level** (floor práctico ≈ 35 según CTS).
- Incluso en API altas, puede variar por **OEM / TEE / provider**.
- **StrongBox** no es requisito y no se evaluó como obligatorio.
- Cambiar a RSA/ECDSA rompería PHASE 57.8 — **descartado**.

## Alternativas (solo evaluación — sin implementar)

| Opción | Descripción | Recomendación 57.11-A |
|--------|-------------|----------------------|
| **A** | Android Keystore Ed25519 nativo | **No** para minSdk 29 |
| **B** | Keystore AES envuelve material Ed25519 software | Ya es el modelo actual (EncryptedSharedPreferences + MasterKey) |
| **C** | Mantener EncryptedSharedPreferences | **Sí — continuar** hasta cambiar minSdk o aceptar fragmentación |

## Criterio 57.11-B

```text
PHASE 57.11-B — AndroidDeviceKeyStore (Keystore Ed25519 nativo)
→ NO PROCEDER
```

Motivo: no se demostró `generate` + `getPublicKey(SPKI)` + `sign` con Android Keystore **manteniendo Ed25519 y minSdk 29** de forma fiable para el producto.

## Principio

No adoptar Keystore Ed25519 solo por “más seguro en abstracto”.  
Prioridad: **seguridad correcta + compatibilidad (minSdk 29) + simplicidad**, sin romper el protocolo Ed25519.
