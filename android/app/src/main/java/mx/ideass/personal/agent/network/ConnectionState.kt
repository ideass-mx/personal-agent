package mx.ideass.personal.agent.network

/** Estado de la conexión (hub o Gateway), visible en el header del chat. */
sealed interface ConnectionState {
    data object SinConfigurar : ConnectionState
    data object Conectado : ConnectionState
    data class Reconectando(val segundos: Int) : ConnectionState
    /** Dispositivo pendiente de aprobación en el Gateway. */
    data object Emparejando : ConnectionState
    /** Fallo de handshake/transporte con motivo visible en UI. */
    data class Error(
        val message: String,
        val code: String? = null,
    ) : ConnectionState
}
