package mx.ideass.personal.agent.service

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import mx.ideass.personal.agent.network.ConnectionState
import javax.inject.Inject
import javax.inject.Singleton

data class ConnectionHealth(
    val state: ConnectionState = ConnectionState.SinConfigurar,
    /** Epoch ms en que se alcanzó [ConnectionState.Conectado]; null si no está conectado. */
    val connectedSinceMs: Long? = null,
    /** Epoch ms del último mensaje del hub (cualquier tipo). */
    val lastMessageReceivedMs: Long? = null,
)

/** Métricas de salud de la conexión, alimentadas solo por [AgentService]. */
@Singleton
class ConnectionHealthTracker @Inject constructor() {
    private val _health = MutableStateFlow(ConnectionHealth())
    val health: StateFlow<ConnectionHealth> = _health.asStateFlow()

    fun onConnectionState(state: ConnectionState) {
        _health.update { current ->
            val since = when (state) {
                is ConnectionState.Conectado -> current.connectedSinceMs ?: System.currentTimeMillis()
                else -> null
            }
            current.copy(state = state, connectedSinceMs = since)
        }
    }

    fun onMessageReceived() {
        _health.update { it.copy(lastMessageReceivedMs = System.currentTimeMillis()) }
    }
}
