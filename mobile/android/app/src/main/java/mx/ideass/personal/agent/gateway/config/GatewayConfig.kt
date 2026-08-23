package mx.ideass.personal.agent.gateway.config

/**
 * Configuración inyectable del Gateway (marca blanca).
 * Sin URLs/tokens/nombres de sesión hardcodeados en el cliente.
 */
data class GatewayConfig(
    val url: String,
    /** Identificador estable del endpoint para acotar tokens (p. ej. host:port). */
    val gatewayStableId: String? = null,
    val authMode: ClientAuthMode = ClientAuthMode.TOKEN,
    val sharedToken: String? = null,
    val password: String? = null,
    val bootstrapToken: String? = null,
    val tlsFingerprint: String? = null,
    val clientVersion: String = "0.1.0",
    val clientDisplayName: String? = null,
    val platform: String = "android",
    val deviceFamily: String? = null,
    val modelIdentifier: String? = null,
    val instanceId: String? = null,
    val locale: String? = null,
    val userAgent: String? = null,
    val scopes: List<String> = emptyList(),
    val defaultAgentId: String? = null,
    val defaultSessionKey: String? = null,
    val enableNodeRole: Boolean = false,
    val connectChallengeTimeoutMs: Long = DEFAULT_CONNECT_CHALLENGE_TIMEOUT_MS,
    val connectRequestTimeoutMs: Long = DEFAULT_CONNECT_REQUEST_TIMEOUT_MS,
    val rpcTimeoutMs: Long = DEFAULT_RPC_TIMEOUT_MS,
    val rpcTimeoutRetries: Int = DEFAULT_RPC_TIMEOUT_RETRIES,
    val pingIntervalSeconds: Long = DEFAULT_PING_INTERVAL_SECONDS,
) {
    fun gatewayId(): String {
        val explicit = gatewayStableId?.trim()?.takeIf { it.isNotEmpty() }
        if (explicit != null) return explicit
        return url.trim().ifEmpty { "default" }
    }

    companion object {
        /** Alineado con `DEFAULT_PREAUTH_HANDSHAKE_TIMEOUT_MS` del tag. */
        const val DEFAULT_CONNECT_CHALLENGE_TIMEOUT_MS: Long = 15_000

        const val DEFAULT_CONNECT_REQUEST_TIMEOUT_MS: Long = 15_000

        const val DEFAULT_RPC_TIMEOUT_MS: Long = 30_000

        /** Reintentos adicionales tras timeout (métodos con idempotency key). */
        const val DEFAULT_RPC_TIMEOUT_RETRIES: Int = 1

        const val DEFAULT_PING_INTERVAL_SECONDS: Long = 30

        const val DEFAULT_GATEWAY_PORT: Int = 18_789
    }
}

/** Modo de credencial que aporta el cliente (config local). */
enum class ClientAuthMode {
    NONE,
    TOKEN,
    PASSWORD,
}
