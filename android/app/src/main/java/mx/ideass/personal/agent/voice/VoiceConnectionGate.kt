package mx.ideass.personal.agent.voice

import android.util.Log
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import mx.ideass.personal.agent.network.ChatConnection
import mx.ideass.personal.agent.network.ConnectionState

/**
 * Reconexión bajo demanda al invocar racha: si el socket está caído,
 * [reconnectNow] y espera al **evento** de resolución (Conectado / Error),
 * no a un reloj fijo. El [timeoutMs] es solo techo de seguridad ante cuelgue.
 */
object VoiceConnectionGate {
    /**
     * Techo por defecto (ms). Preferir
     * `R.integer.voice_connection_gate_timeout_ms` en runtime.
     */
    const val SAFETY_CEILING_MS: Long = 12_000L

    /** @deprecated Usar [SAFETY_CEILING_MS]. */
    const val RECONNECT_WAIT_MS: Long = SAFETY_CEILING_MS

    /**
     * true si ya hay sesión autenticada, o si tras [ChatConnection.reconnectNow]
     * se alcanza [ConnectionState.Conectado] antes del techo.
     *
     * @param onWaiting feedback opcional (earcon «conectando») solo si hace falta esperar.
     */
    suspend fun ensureConnected(
        connection: ChatConnection,
        timeoutMs: Long = SAFETY_CEILING_MS,
        onWaiting: (() -> Unit)? = null,
    ): Boolean {
        if (connection.isConnected()) return true
        Log.i(TAG, "esperando conexión (techo ${timeoutMs}ms)")
        onWaiting?.invoke()
        connection.reconnectNow()
        val ok = awaitConnected(
            state = connection.connectionState,
            isConnected = connection::isConnected,
            timeoutMs = timeoutMs,
            skipStaleTerminal = true,
        )
        if (ok) {
            Log.i(TAG, "conexión lista")
        } else {
            Log.w(TAG, "sin conexión tras techo/error → offline")
        }
        return ok
    }

    /**
     * Espera pura (testeable): Conectado → true; Error / SinConfigurar / techo → false.
     *
     * Con [skipStaleTerminal], ignora un Conectado/Error/Emparejando residual de la
     * sesión anterior justo tras [ChatConnection.reconnectNow] (misma idea que el
     * handshake de ConnectionViewModel).
     */
    suspend fun awaitConnected(
        state: StateFlow<ConnectionState>,
        isConnected: () -> Boolean,
        timeoutMs: Long,
        skipStaleTerminal: Boolean = false,
    ): Boolean {
        if (isConnected()) return true
        val baseline = state.value
        val waitForChange = skipStaleTerminal && (
            baseline is ConnectionState.Conectado ||
                baseline is ConnectionState.Error ||
                baseline is ConnectionState.Emparejando
            )
        var passedBaseline = !waitForChange
        val reached = withTimeoutOrNull(timeoutMs) {
            state.first { candidate ->
                if (!passedBaseline) {
                    if (candidate == baseline) return@first false
                    passedBaseline = true
                }
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

    private const val TAG = "VoiceConnectionGate"
}
