package mx.ideass.personal.agent.network

/** Estado de la conexión con el hub, visible en el header del chat. */
sealed interface ConnectionState {
    data object SinConfigurar : ConnectionState
    data object Conectado : ConnectionState
    data class Reconectando(val segundos: Int) : ConnectionState
}
