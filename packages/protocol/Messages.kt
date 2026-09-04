/**
 * Protocolo personal-agent v1 — espejo Kotlin (kotlinx.serialization).
 * Fuente de verdad: PROTOCOL.md. Este archivo se adapta a él, nunca al revés.
 *
 * Uso en Android: copiar a mx.ideass.personal.agent.protocol y configurar Json con
 *   ignoreUnknownKeys = true
 *   classDiscriminator = "type"
 */
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
        val authKind: String? = null,
    ) : ClientMessage

    @Serializable
    @SerialName("pairing_request")
    data class PairingRequest(
        val pairingSessionId: String,
        val pairingSecret: String,
        val deviceId: String,
        val deviceName: String? = null,
        val platform: String? = null,
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
    @SerialName("pairing_pending")
    data class PairingPending(
        val pairingSessionId: String,
        val message: String,
    ) : ServerMessage

    @Serializable
    @SerialName("pairing_result")
    data class PairingResult(
        val pairingSessionId: String,
        val status: String,
        val deviceCredential: String? = null,
    ) : ServerMessage

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
