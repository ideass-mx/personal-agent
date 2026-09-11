package mx.ideass.personal.agent.network

/**
 * Eventos de chat normalizados para la UI/store.
 * Independiente del wire (hub casero vs Gateway legacy).
 *
 * [sessionKey] enruta al hilo correcto. Null = sesión activa (hub legacy).
 * [runId] identifica el turno/run del stream (protocolo Gateway v4); null = legado mono-stream.
 */
sealed interface ChatInbound {
    val sessionKey: String?
    val runId: String?

    data class AssistantDelta(
        val text: String,
        val replace: Boolean = false,
        override val sessionKey: String? = null,
        override val runId: String? = null,
    ) : ChatInbound

    data class AssistantDone(
        /** Para Gateway es la sessionKey del evento. */
        val conversationId: String,
        override val runId: String? = null,
    ) : ChatInbound {
        override val sessionKey: String get() = conversationId
    }

    data class ConfirmRequest(
        val confirmationId: String,
        val toolCallId: String,
        val toolName: String,
        val inputJson: String,
        val conversationId: String,
        override val runId: String? = null,
    ) : ChatInbound {
        override val sessionKey: String get() = conversationId
    }

    data class ToolProgress(
        val phase: String,
        val toolCallId: String,
        val toolName: String,
        val conversationId: String,
        val detail: String? = null,
        override val runId: String? = null,
    ) : ChatInbound {
        override val sessionKey: String get() = conversationId
    }

    data class Error(
        val code: String,
        val message: String,
        override val sessionKey: String? = null,
        override val runId: String? = null,
    ) : ChatInbound
}
