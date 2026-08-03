package mx.ideass.personal.agent.gateway.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Params de `device.pair.list`. */
@Serializable
data object DevicePairListParams

@Serializable
data class DevicePairApproveParams(
    val requestId: String,
)

@Serializable
data class DevicePairRejectParams(
    val requestId: String,
)

@Serializable
data class DevicePairRemoveParams(
    val deviceId: String,
)

/** Params de `device.pair.setupCode` (`DevicePairSetupCodeParamsSchema`). */
@Serializable
data class DevicePairSetupCodeParams(
    val publicUrl: String? = null,
    val preferRemoteUrl: Boolean? = null,
    val includeQr: Boolean? = null,
)

@Serializable
enum class DevicePairSetupCodeAuthLabel {
    @SerialName("token")
    TOKEN,

    @SerialName("password")
    PASSWORD,
}

/**
 * Resultado de `device.pair.setupCode`.
 * `auth` es solo etiqueta; la credencial del gateway no viaja aquí.
 */
@Serializable
data class DevicePairSetupCodeResult(
    val setupCode: String,
    val qrDataUrl: String? = null,
    val gatewayUrl: String,
    val gatewayUrls: List<String>? = null,
    val auth: DevicePairSetupCodeAuthLabel,
    val urlSource: String,
)

@Serializable
data class DevicePairRequestedEvent(
    val requestId: String,
    val deviceId: String,
    val publicKey: String,
    val displayName: String? = null,
    val platform: String? = null,
    val deviceFamily: String? = null,
    val clientId: String? = null,
    val clientMode: String? = null,
    val role: String? = null,
    val roles: List<String>? = null,
    val scopes: List<String>? = null,
    val remoteIp: String? = null,
    val silent: Boolean? = null,
    val isRepair: Boolean? = null,
    val ts: Long,
)

@Serializable
data class DevicePairResolvedEvent(
    val requestId: String,
    val deviceId: String,
    val decision: String,
    val ts: Long,
)
