package mx.ideass.personal.agent.network

/**
 * Eventos de chat normalizados para la UI/store.
 * Independiente del wire (hub casero vs Gateway OpenClaw).
 *
 * [sessionKey] enruta al hilo correcto. Null = sesión activa (hub legacy).
 */
sealed interface ChatInbound {
    val sessionKey: String?

    data class AssistantDelta(
        val text: String,
        val replace: Boolean = false,
        override val sessionKey: String? = null,
    ) : ChatInbound

    data class AssistantDone(
        /** Para Gateway es la sessionKey del evento. */
        val conversationId: String,
    ) : ChatInbound {
        override val sessionKey: String get() = conversationId
    }

    data class Error(
        val code: String,
        val message: String,
        override val sessionKey: String? = null,
    ) : ChatInbound
}
