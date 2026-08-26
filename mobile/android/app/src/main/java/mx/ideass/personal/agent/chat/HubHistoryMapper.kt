package mx.ideass.personal.agent.chat

import mx.ideass.personal.agent.workspace.ConversationMessageDto

/** Convierte mensajes HTTP del Gateway Hub en burbujas de chat. */
object HubHistoryMapper {
    fun toChatMessages(messages: List<ConversationMessageDto>): List<ChatMessage> =
        messages.mapNotNull { row ->
            val fromUser = when (row.role.trim().lowercase()) {
                "user" -> true
                "assistant" -> false
                else -> return@mapNotNull null
            }
            val text = row.content.trim()
            if (text.isEmpty()) return@mapNotNull null
            ChatMessage(
                id = row.id,
                text = text,
                fromUser = fromUser,
                queued = false,
                streaming = false,
            )
        }
}
