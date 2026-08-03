package mx.ideass.personal.agent.gateway.auth

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/** Token de dispositivo emitido en hello-ok, acotado por gateway/device/role. */
data class DeviceAuthEntry(
    val token: String,
    val role: String,
    val scopes: List<String>,
    val updatedAtMs: Long,
)

@Serializable
private data class DeviceAuthMetadata(
    val scopes: List<String> = emptyList(),
    val updatedAtMs: Long = 0L,
)

/**
 * Persistencia cifrada del `deviceToken` (nunca loguear el valor).
 */
class DeviceTokenStore(
    private val secureStore: SecureStringStore,
    private val json: Json = Json { ignoreUnknownKeys = true },
) {
    fun loadEntry(gatewayId: String, deviceId: String, role: String): DeviceAuthEntry? {
        val token = secureStore.getString(tokenKey(gatewayId, deviceId, role))
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: return null
        val meta = secureStore.getString(metadataKey(gatewayId, deviceId, role))
            ?.let { raw ->
                runCatching { json.decodeFromString(DeviceAuthMetadata.serializer(), raw) }
                    .getOrNull()
            }
        return DeviceAuthEntry(
            token = token,
            role = normalizeRole(role),
            scopes = meta?.scopes.orEmpty(),
            updatedAtMs = meta?.updatedAtMs ?: 0L,
        )
    }

    fun saveToken(
        gatewayId: String,
        deviceId: String,
        role: String,
        token: String,
        scopes: List<String> = emptyList(),
    ) {
        val trimmed = token.trim()
        require(trimmed.isNotEmpty()) { "device_token_blank" }
        secureStore.putString(tokenKey(gatewayId, deviceId, role), trimmed)
        secureStore.putString(
            metadataKey(gatewayId, deviceId, role),
            json.encodeToString(
                DeviceAuthMetadata.serializer(),
                DeviceAuthMetadata(
                    scopes = normalizeScopes(scopes),
                    updatedAtMs = System.currentTimeMillis(),
                ),
            ),
        )
    }

    fun clearToken(gatewayId: String, deviceId: String, role: String) {
        secureStore.remove(tokenKey(gatewayId, deviceId, role))
        secureStore.remove(metadataKey(gatewayId, deviceId, role))
    }

    private fun tokenKey(gatewayId: String, deviceId: String, role: String): String =
        "gateway.deviceToken.${normalizeGatewayId(gatewayId)}.${normalizeDeviceId(deviceId)}.${normalizeRole(role)}"

    private fun metadataKey(gatewayId: String, deviceId: String, role: String): String =
        "gateway.deviceTokenMeta.${normalizeGatewayId(gatewayId)}.${normalizeDeviceId(deviceId)}.${normalizeRole(role)}"

    private fun normalizeGatewayId(gatewayId: String): String =
        gatewayId.trim().also { require(it.isNotEmpty()) { "gateway_id_blank" } }

    private fun normalizeDeviceId(deviceId: String): String = deviceId.trim().lowercase()

    private fun normalizeRole(role: String): String = role.trim().lowercase()

    private fun normalizeScopes(scopes: List<String>): List<String> =
        scopes.map { it.trim() }.filter { it.isNotEmpty() }.distinct().sorted()

    companion object {
        const val PREFS_NAME: String = "gateway_device_tokens"
    }
}
