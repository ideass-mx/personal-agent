package mx.ideass.personal.agent.gateway.protocol

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** Forma laxa del resultado de `chat.history` en el tag (payload no tipado fuerte). */
@Serializable
data class ChatHistoryResult(
    val messages: List<JsonElement> = emptyList(),
    val sessionId: String? = null,
)
