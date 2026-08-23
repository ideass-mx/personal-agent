package mx.ideass.personal.agent.gateway.auth

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Persistencia cifrada de la identidad Ed25519 del dispositivo.
 * La MasterKey vive en Android Keystore; el material Ed25519 viaja cifrado en reposo.
 */
class DeviceIdentityStore(
    private val secureStore: SecureStringStore,
    private val json: Json = Json { ignoreUnknownKeys = true },
) {
    @Volatile
    private var cached: DeviceIdentity? = null

    @Synchronized
    fun loadOrCreate(): DeviceIdentity {
        cached?.let { return it }
        val existing = load()
        if (existing != null) {
            val derived = runCatching {
                Ed25519DeviceCrypto.deviceIdFromPublicKeyRawBase64(existing.publicKeyRawBase64)
            }.getOrNull()
            val identity = if (derived != null && derived != existing.deviceId) {
                existing.copy(deviceId = derived).also { save(it) }
            } else {
                existing
            }
            cached = identity
            return identity
        }
        val fresh = Ed25519DeviceCrypto.generate()
        save(fresh)
        cached = fresh
        return fresh
    }

    fun signPayload(payload: String, identity: DeviceIdentity = loadOrCreate()): String =
        Ed25519DeviceCrypto.signPayload(payload, identity)

    fun publicKeyBase64Url(identity: DeviceIdentity = loadOrCreate()): String =
        Ed25519DeviceCrypto.publicKeyBase64Url(identity)

    private fun load(): DeviceIdentity? {
        val raw = secureStore.getString(KEY_IDENTITY) ?: return null
        return runCatching {
            json.decodeFromString(DeviceIdentity.serializer(), raw)
        }.getOrNull()?.takeIf {
            it.deviceId.isNotBlank() &&
                it.publicKeyRawBase64.isNotBlank() &&
                it.privateKeyPkcs8Base64.isNotBlank()
        }
    }

    private fun save(identity: DeviceIdentity) {
        secureStore.putString(
            KEY_IDENTITY,
            json.encodeToString(DeviceIdentity.serializer(), identity),
        )
    }

    companion object {
        const val PREFS_NAME: String = "gateway_device_identity"
        private const val KEY_IDENTITY: String = "identity.v1"
    }
}
