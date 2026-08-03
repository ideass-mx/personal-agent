package mx.ideass.personal.agent.gateway.protocol

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Metadatos de cliente en `connect` (`ConnectParamsSchema.client`). */
@Serializable
data class GatewayClientInfo(
    val id: GatewayClientId,
    val displayName: String? = null,
    val version: String,
    val platform: String,
    val deviceFamily: String? = null,
    val modelIdentifier: String? = null,
    val mode: GatewayClientMode,
    val instanceId: String? = null,
)

/** Identidad firmada del dispositivo (`ConnectParamsSchema.device`). */
@Serializable
data class ConnectDevice(
    val id: String,
    val publicKey: String,
    val signature: String,
    val signedAt: Long,
    val nonce: String,
)

/** Credenciales de auth en `connect` (`ConnectParamsSchema.auth`). */
@Serializable
data class ConnectAuth(
    val token: String? = null,
    val bootstrapToken: String? = null,
    val deviceToken: String? = null,
    val password: String? = null,
    val approvalRuntimeToken: String? = null,
    val agentRuntimeIdentityToken: String? = null,
)

/** Parámetros del método RPC `connect` (`ConnectParamsSchema`). */
@Serializable
data class ConnectParams(
    val minProtocol: Int,
    val maxProtocol: Int,
    val client: GatewayClientInfo,
    val caps: List<String>? = null,
    val commands: List<String>? = null,
    val permissions: Map<String, Boolean>? = null,
    val pathEnv: String? = null,
    val role: String? = null,
    val scopes: List<String>? = null,
    val device: ConnectDevice? = null,
    val auth: ConnectAuth? = null,
    val locale: String? = null,
    val userAgent: String? = null,
)

@Serializable
data class HelloOkServer(
    val version: String,
    val connId: String,
)

@Serializable
data class HelloOkFeatures(
    val methods: List<String>,
    val events: List<String>,
    val capabilities: List<String>? = null,
)

@Serializable
data class HelloOkDeviceTokenEntry(
    val deviceToken: String,
    val role: String,
    val scopes: List<String>,
    val issuedAtMs: Long,
)

@Serializable
data class HelloOkAuth(
    val deviceToken: String? = null,
    val role: String,
    val scopes: List<String>,
    val issuedAtMs: Long? = null,
    val deviceTokens: List<HelloOkDeviceTokenEntry>? = null,
)

@Serializable
data class HelloOkPolicy(
    val maxPayload: Long,
    val maxBufferedBytes: Long,
    val tickIntervalMs: Long,
)

@Serializable
data class ControlUiTab(
    val pluginId: String,
    val id: String,
    val label: String,
    val description: String? = null,
    val icon: String? = null,
    val path: String? = null,
    val group: ControlUiTabGroup? = null,
    val order: Double? = null,
)

@Serializable
enum class ControlUiTabGroup {
    @SerialName("control")
    CONTROL,

    @SerialName("agent")
    AGENT,
}

/**
 * Payload exitoso de `connect` (`HelloOkSchema`).
 * Viaja dentro de `res.payload`, no como frame de nivel superior.
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class HelloOk(
    @EncodeDefault
    val type: String = "hello-ok",
    val protocol: Int,
    val server: HelloOkServer,
    val features: HelloOkFeatures,
    val snapshot: Snapshot,
    val controlUiTabs: List<ControlUiTab>? = null,
    val pluginSurfaceUrls: Map<String, String>? = null,
    val auth: HelloOkAuth,
    val policy: HelloOkPolicy,
)

/** Scopes mínimos de operator para chat. */
object OperatorScopes {
    const val READ: String = "operator.read"
    const val WRITE: String = "operator.write"
    const val ADMIN: String = "operator.admin"
    const val PAIRING: String = "operator.pairing"

    val CHAT_MINIMAL: List<String> = listOf(READ, WRITE)
}

/** Roles de conexión usados en runtime. */
object GatewayRoles {
    const val OPERATOR: String = "operator"
    const val NODE: String = "node"
}
