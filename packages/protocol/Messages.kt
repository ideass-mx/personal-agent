/**
 * Protocolo personal-agent v1 — espejo Kotlin (kotlinx.serialization).
 * Fuente de verdad: PROTOCOL.md. Este archivo se adapta a él, nunca al revés.
 *
 * Uso en Android: copiar a mx.ideass.personal.agent.protocol y configurar Json con
 *   ignoreUnknownKeys = true   // regla 3 del protocolo
 *   classDiscriminator = "type"
 */
package mx.ideass.personal.agent.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

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
    data class AssistantChunk(val text: String) : ServerMessage

    @Serializable
    @SerialName("assistant_done")
    data class AssistantDone(
        val messageId: String,
        val conversationId: String,
    ) : ServerMessage

    @Serializable
    @SerialName("pong")
    data object Pong : ServerMessage

    @Serializable
    @SerialName("error")
    data class Error(val code: String, val message: String) : ServerMessage
}
