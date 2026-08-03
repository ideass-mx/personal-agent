package mx.ideass.personal.agent.gateway.client

import mx.ideass.personal.agent.gateway.protocol.HelloOk

/** Estados del handshake Gateway (sin reconexión ni pairing aún). */
sealed interface HandshakeState {
    data object Idle : HandshakeState

    data object WaitingChallenge : HandshakeState

    data object Connecting : HandshakeState

    data class Connected(
        val hello: HelloOk,
    ) : HandshakeState

    data class Failed(
        val reason: String,
        val cause: Throwable? = null,
    ) : HandshakeState
}
