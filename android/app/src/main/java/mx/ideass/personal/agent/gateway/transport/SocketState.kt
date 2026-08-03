package mx.ideass.personal.agent.gateway.transport

/** Estado del socket de transporte (sin semántica de pairing aún). */
sealed interface SocketState {
    data object Idle : SocketState

    data object Connecting : SocketState

    data object Open : SocketState

    data class Closed(
        val code: Int,
        val reason: String,
        val remote: Boolean,
    ) : SocketState

    data class Failed(
        val message: String,
        val cause: Throwable? = null,
    ) : SocketState
}
