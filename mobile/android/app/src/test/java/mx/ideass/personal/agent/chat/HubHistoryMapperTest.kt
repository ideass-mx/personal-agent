package mx.ideass.personal.agent.chat

import mx.ideass.personal.agent.workspace.ConversationMessageDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HubHistoryMapperTest {
    @Test
    fun mapsUserAndAssistantRows() {
        val messages = HubHistoryMapper.toChatMessages(
            listOf(
                ConversationMessageDto(
                    id = "m_1",
                    conversationId = "c_1",
                    role = "user",
                    content = "hola",
                    createdAt = "2026-01-01T00:00:00Z",
                ),
                ConversationMessageDto(
                    id = "m_2",
                    conversationId = "c_1",
                    role = "assistant",
                    content = "respuesta",
                    createdAt = "2026-01-01T00:00:01Z",
                ),
            ),
        )
        assertEquals(2, messages.size)
        assertTrue(messages[0].fromUser)
        assertEquals("m_1", messages[0].id)
        assertEquals("hola", messages[0].text)
        assertEquals(false, messages[1].fromUser)
    }
}
