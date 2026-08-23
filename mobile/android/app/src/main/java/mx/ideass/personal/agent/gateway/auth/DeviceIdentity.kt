package mx.ideass.personal.agent.gateway.auth

import kotlinx.serialization.Serializable

/** Identidad Ed25519 del dispositivo frente al Gateway. */
@Serializable
data class DeviceIdentity(
    val deviceId: String,
    val publicKeyRawBase64: String,
    val privateKeyPkcs8Base64: String,
    val createdAtMs: Long,
)
