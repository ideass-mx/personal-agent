package mx.ideass.personal.agent.voice

import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import mx.ideass.personal.agent.network.ChatConnection
import mx.ideass.personal.agent.network.ConnectionState

/**
 * Reconexión bajo demanda al invocar racha: si el socket está caído pero la
 * red vive, [reconnectNow] + espera corta antes de anunciar offline.
 */
object VoiceConnectionGate {
    /** Margen de espera tras disparar reconexión al invocar (3–5 s). */
    const val RECONNECT_WAIT_MS: Long = 4_000L

    /**
     * true si ya hay sesión autenticada, o si tras [ChatConnection.reconnectNow]
     * se alcanza [ConnectionState.Conectado] dentro de [timeoutMs].
     */
    suspend fun ensureConnected(
        connection: ChatConnection,
        timeoutMs: Long = RECONNECT_WAIT_MS,
    ): Boolean {
        if (connection.isConnected()) return true
        connection.reconnectNow()
        return awaitConnected(connection.connectionState, connection::isConnected, timeoutMs)
    }

    /**
     * Espera pura (testeable): terminal Conectado → true; Error terminal / timeout → false.
     */
    suspend fun awaitConnected(
        state: StateFlow<ConnectionState>,
        isConnected: () -> Boolean,
        timeoutMs: Long,
    ): Boolean {
        if (isConnected()) return true
        val reached = withTimeoutOrNull(timeoutMs) {
            state.first { candidate ->
                candidate is ConnectionState.Conectado ||
                    candidate is ConnectionState.Error ||
                    candidate is ConnectionState.SinConfigurar
            }
        }
        return when (reached) {
            is ConnectionState.Conectado -> true
            else -> isConnected()
        }
    }
}
