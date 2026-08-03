package mx.ideass.personal.agent.gateway.auth

/**
 * Payload canónico de firma de dispositivo.
 * Equivalente a `buildDeviceAuthPayloadV3` en
 * `packages/gateway-client/src/device-auth.ts` (tag `v2026.7.1`).
 */
object DeviceAuthPayload {
    fun buildV3(
        deviceId: String,
        clientId: String,
        clientMode: String,
        role: String,
        scopes: List<String>,
        signedAtMs: Long,
        token: String?,
        nonce: String,
        platform: String?,
        deviceFamily: String?,
    ): String {
        val scopeString = scopes.joinToString(",")
        val authToken = token.orEmpty()
        val platformNorm = normalizeMetadataField(platform)
        val deviceFamilyNorm = normalizeMetadataField(deviceFamily)
        return listOf(
            "v3",
            deviceId,
            clientId,
            clientMode,
            role,
            scopeString,
            signedAtMs.toString(),
            authToken,
            nonce,
            platformNorm,
            deviceFamilyNorm,
        ).joinToString("|")
    }

    /**
     * Normalización cross-runtime (TS/Swift/Kotlin): trim + lowercasing
     * solo de ASCII A–Z (byte + 32), sin locale.
     */
    fun normalizeMetadataField(value: String?): String {
        val trimmed = value?.trim().orEmpty()
        if (trimmed.isEmpty()) return ""
        val out = StringBuilder(trimmed.length)
        for (ch in trimmed) {
            if (ch in 'A'..'Z') {
                out.append((ch.code + 32).toChar())
            } else {
                out.append(ch)
            }
        }
        return out.toString()
    }
}
