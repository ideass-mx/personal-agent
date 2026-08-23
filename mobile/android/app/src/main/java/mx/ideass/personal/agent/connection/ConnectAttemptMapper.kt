package mx.ideass.personal.agent.connection

import mx.ideass.personal.agent.network.ConnectionState

/** Fase de intento de conexión en la pantalla de configuración. */
sealed interface ConnectAttemptUi {
    data object Connecting : ConnectAttemptUi
    data class Pairing(val deviceIdShort: String?) : ConnectAttemptUi
    data object Connected : ConnectAttemptUi
    data class Failed(val message: String, val code: String? = null) : ConnectAttemptUi
}

/**
 * Proyecta [ConnectionState] a la UI del intento de conexión.
 * [ConnectAttemptUi.Connected] solo cuando el estado es [ConnectionState.Conectado]
 * (tras hello-ok).
 */
fun mapConnectionStateToAttempt(
    state: ConnectionState,
    deviceIdShort: String? = null,
): ConnectAttemptUi = when (state) {
    is ConnectionState.Conectado -> ConnectAttemptUi.Connected
    is ConnectionState.Emparejando -> ConnectAttemptUi.Pairing(deviceIdShort)
    is ConnectionState.Error -> ConnectAttemptUi.Failed(state.message, state.code)
    is ConnectionState.Reconectando,
    is ConnectionState.SinConfigurar,
    -> ConnectAttemptUi.Connecting
}

/** Navegar al chat solo tras hello-ok → [ConnectionState.Conectado]. */
fun shouldNavigateToChat(state: ConnectionState): Boolean =
    state is ConnectionState.Conectado

fun shortDeviceId(deviceId: String): String {
    val trimmed = deviceId.trim()
    if (trimmed.length <= 12) return trimmed
    return trimmed.take(8)
}
