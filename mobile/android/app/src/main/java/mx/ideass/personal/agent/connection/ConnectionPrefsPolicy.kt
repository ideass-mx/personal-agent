package mx.ideass.personal.agent.connection

import mx.ideass.personal.agent.app.ConnectionBackend
import mx.ideass.personal.agent.gateway.config.ClientAuthMode
import mx.ideass.personal.agent.gateway.config.GatewayConfig
import mx.ideass.personal.agent.network.ConnectionState

/**
 * Lectura de la config persistida (mismo almacén/claves que escribe
 * [mx.ideass.personal.agent.app.AppPreferences]). No borra nada:
 * desconexión ≠ sin configurar.
 */
object ConnectionPrefsPolicy {

    fun backendFromStored(
        storedBackend: String?,
        gatewayUrl: String?,
        hubAddress: String?,
        hubToken: String?,
    ): ConnectionBackend {
        when (storedBackend) {
            "hub" -> return ConnectionBackend.HUB
            "gateway" -> return ConnectionBackend.GATEWAY
        }
        // Versiones que guardaron URL/token sin la clave de backend.
        if (!gatewayUrl.isNullOrBlank()) return ConnectionBackend.GATEWAY
        if (!hubAddress.isNullOrBlank() && !hubToken.isNullOrBlank()) {
            return ConnectionBackend.HUB
        }
        // First-run / prefs vacías: Hub es el camino feliz del MVP (PHASE 37).
        return ConnectionBackend.HUB
    }

    fun isConfigured(
        backend: ConnectionBackend,
        gatewayUrl: String?,
        hubAddress: String?,
        hubToken: String?,
    ): Boolean = when (backend) {
        ConnectionBackend.GATEWAY -> !gatewayUrl.isNullOrBlank()
        ConnectionBackend.HUB -> !hubAddress.isNullOrBlank() && !hubToken.isNullOrBlank()
    }

    fun toGatewayConfig(
        backend: ConnectionBackend,
        url: String?,
        token: String?,
        bootstrap: String?,
        agentId: String?,
        sessionKey: String?,
        deviceName: String?,
    ): GatewayConfig? {
        if (backend != ConnectionBackend.GATEWAY) return null
        val trimmedUrl = url?.trim().orEmpty()
        if (trimmedUrl.isBlank()) return null
        val trimmedToken = token?.trim()?.takeIf { it.isNotEmpty() }
        val trimmedBootstrap = bootstrap?.trim()?.takeIf { it.isNotEmpty() }
        return GatewayConfig(
            url = trimmedUrl,
            gatewayStableId = trimmedUrl,
            authMode = when {
                trimmedToken != null -> ClientAuthMode.TOKEN
                else -> ClientAuthMode.NONE
            },
            sharedToken = trimmedToken,
            bootstrapToken = trimmedBootstrap,
            defaultAgentId = agentId?.trim()?.takeIf { it.isNotEmpty() },
            defaultSessionKey = sessionKey?.trim()?.takeIf { it.isNotEmpty() },
            clientDisplayName = deviceName?.trim()?.takeIf { it.isNotEmpty() },
        )
    }

    /**
     * SinConfigurar solo si nunca hubo config. Con config persistida, un
     * estado residual «sin configurar» se muestra como reconexión.
     */
    fun effectiveConnectionState(
        raw: ConnectionState,
        configured: Boolean,
    ): ConnectionState {
        if (configured && raw is ConnectionState.SinConfigurar) {
            return ConnectionState.Reconectando(0)
        }
        return raw
    }
}

/** Valores para prellenar (o no) el formulario de conexión. */
data class ConnectionFormPrefill(
    val backend: ConnectionBackend,
    val address: String,
    val token: String,
    val bootstrapToken: String = "",
    val agentId: String = "",
    val sessionKey: String = "",
    val deviceName: String,
    val hasSavedConfig: Boolean,
)

fun connectionFormPrefill(
    backend: ConnectionBackend,
    gatewayUrl: String?,
    gatewayToken: String?,
    gatewayBootstrap: String?,
    gatewayAgentId: String?,
    gatewaySessionKey: String?,
    hubAddress: String?,
    hubToken: String?,
    deviceName: String?,
    fallbackDeviceName: String,
): ConnectionFormPrefill {
    val name = deviceName?.trim()?.takeIf { it.isNotEmpty() } ?: fallbackDeviceName
    val configured = ConnectionPrefsPolicy.isConfigured(
        backend = backend,
        gatewayUrl = gatewayUrl,
        hubAddress = hubAddress,
        hubToken = hubToken,
    )
    return when (backend) {
        ConnectionBackend.GATEWAY -> ConnectionFormPrefill(
            backend = backend,
            address = gatewayUrl?.trim().orEmpty(),
            token = gatewayToken.orEmpty(),
            bootstrapToken = gatewayBootstrap.orEmpty(),
            agentId = gatewayAgentId.orEmpty(),
            sessionKey = gatewaySessionKey.orEmpty(),
            deviceName = name,
            hasSavedConfig = configured,
        )
        ConnectionBackend.HUB -> ConnectionFormPrefill(
            backend = backend,
            address = hubAddress?.trim().orEmpty(),
            token = hubToken.orEmpty(),
            deviceName = name,
            hasSavedConfig = configured,
        )
    }
}
