package mx.ideass.personal.agent.protocol

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HubConfirmProtocolTest {
    @Test
    fun decodeConfirmRequest() {
        val json =
            """{"type":"confirm_request","confirmationId":"cf_1","toolCallId":"call_1","toolName":"filesystem.write","input":{"path":"a.txt"},"conversationId":"c_1"}"""
        val msg = ProtocolJson.decodeFromString(ServerMessage.serializer(), json)
        assertTrue(msg is ServerMessage.ConfirmRequest)
        val req = msg as ServerMessage.ConfirmRequest
        assertEquals("cf_1", req.confirmationId)
        assertEquals("filesystem.write", req.toolName)
        assertEquals("c_1", req.conversationId)
    }

    @Test
    fun encodeConfirmResponse() {
        val encoded = ProtocolJson.encodeToString(
            ClientMessage.serializer(),
            ClientMessage.ConfirmResponse(confirmationId = "cf_1", approved = true),
        )
        assertTrue(encoded.contains("confirm_response"))
        assertTrue(encoded.contains("cf_1"))
        assertTrue(encoded.contains("true"))
    }

    @Test
    fun confirmRequestInputIsJson() {
        val msg = ServerMessage.ConfirmRequest(
            confirmationId = "cf_2",
            toolCallId = "call_2",
            toolName = "process.execute",
            input = JsonObject(mapOf("argv" to JsonPrimitive("ls"))),
            conversationId = "c_2",
        )
        val encoded = ProtocolJson.encodeToString(ServerMessage.serializer(), msg)
        val decoded = ProtocolJson.decodeFromString(ServerMessage.serializer(), encoded)
        assertTrue(decoded is ServerMessage.ConfirmRequest)
    }

    @Test
    fun decodeAssistantChunkWithConversationId() {
        val json =
            """{"type":"assistant_chunk","text":"hola","conversationId":"c_a"}"""
        val msg = ProtocolJson.decodeFromString(ServerMessage.serializer(), json)
        assertTrue(msg is ServerMessage.AssistantChunk)
        assertEquals("c_a", (msg as ServerMessage.AssistantChunk).conversationId)
    }

    @Test
    fun decodeErrorWithConversationId() {
        val json =
            """{"type":"error","code":"internal","message":"boom","conversationId":"c_a"}"""
        val msg = ProtocolJson.decodeFromString(ServerMessage.serializer(), json)
        assertTrue(msg is ServerMessage.Error)
        assertEquals("c_a", (msg as ServerMessage.Error).conversationId)
    }
}
