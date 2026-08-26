package mx.ideass.personal.agent.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

// ── Cliente → Servidor ────────────────────────────────────────────────

@Serializable
sealed interface ClientMessage {

    @Serializable
    @SerialName("auth")
    data class Auth(
        val token: String,
        val deviceId: String,
        val deviceName: String? = null,
    ) : ClientMessage

    @Serializable
    @SerialName("user_message")
    data class UserMessage(
        val text: String,
        val conversationId: String? = null,
    ) : ClientMessage

    @Serializable
    @SerialName("confirm_response")
    data class ConfirmResponse(
        val confirmationId: String,
        val approved: Boolean,
    ) : ClientMessage

    @Serializable
    @SerialName("ping")
    data object Ping : ClientMessage
}

// ── Servidor → Cliente ────────────────────────────────────────────────

@Serializable
sealed interface ServerMessage {

    @Serializable
    @SerialName("auth_ok")
    data class AuthOk(val deviceId: String) : ServerMessage

    @Serializable
    @SerialName("assistant_chunk")
    data class AssistantChunk(
        val text: String,
        val conversationId: String? = null,
    ) : ServerMessage

    @Serializable
    @SerialName("assistant_done")
    data class AssistantDone(
        val messageId: String,
        val conversationId: String,
    ) : ServerMessage

    @Serializable
    @SerialName("confirm_request")
    data class ConfirmRequest(
        val confirmationId: String,
        val toolCallId: String,
        val toolName: String,
        val input: JsonElement,
        val conversationId: String,
    ) : ServerMessage

    @Serializable
    @SerialName("pong")
    data object Pong : ServerMessage

    @Serializable
    @SerialName("error")
    data class Error(
        val code: String,
        val message: String,
        val conversationId: String? = null,
    ) : ServerMessage
}
