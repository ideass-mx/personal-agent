package mx.ideass.personal.agent.chat

import mx.ideass.personal.agent.network.ChatInbound
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Flujo confirmación → ejecución → resultado (PHASE 42) sobre [ChatThreads]
 * + reglas puras de [ToolActivityUx]. Sin Hilt.
 */
class ToolActivityFlowTest {

    @Test
    fun confirmToExecution_flowLabels() {
        val approve = ToolActivityUx.stateAfterConfirmResponse(
            "c1",
            "filesystem.write",
            approved = true,
        )
        assertEquals(ToolActivityPhase.Executing, approve.phase)

        val reject = ToolActivityUx.stateAfterConfirmResponse(
            "c1",
            "filesystem.write",
            approved = false,
        )
        assertEquals(ToolActivityPhase.Failed, reject.phase)
    }

    @Test
    fun confirmRequest_doesNotAddBubble_regression() {
        val threads = ChatThreads()
        threads.setVisibleSession("c1")
        threads.appendUser("c1", "escribe", queued = false)
        threads.handleInbound(
            "c1",
            ChatInbound.ConfirmRequest(
                confirmationId = "cf_1",
                toolCallId = "call_1",
                toolName = "filesystem.write",
                inputJson = """{"path":"a.txt"}""",
                conversationId = "c1",
            ),
        )
        assertEquals(listOf("escribe"), threads.visibleMessages().map { it.text })
    }

    @Test
    fun assistantStream_hidesActivityChip() {
        val hidden = ToolActivityUx.resolveVisible(
            conversationId = "c1",
            hasPendingReply = true,
            hasStreaming = true,
            pendingConfirmForConversation = false,
            executingToolName = "filesystem.write",
        )
        assertEquals(null, hidden)
    }

    @Test
    fun conversationIsolation_hiddenSessionDoesNotMix() {
        val threads = ChatThreads()
        threads.setVisibleSession("visible")
        threads.appendUser("visible", "a", queued = false)
        threads.appendUser("hidden", "b", queued = false)
        assertTrue(threads.hasAssistantWork("hidden"))
        assertTrue(threads.hasAssistantWork("visible"))
        assertFalse(threads.hasStreaming("visible"))
    }

    @Test
    fun errorHumanCopy_regression() {
        val threads = ChatThreads()
        threads.setVisibleSession("c1")
        threads.handleInbound(
            "c1",
            ChatInbound.Error(code = "agent_disconnected", message = "agent_disconnected", sessionKey = "c1"),
        )
        assertTrue(threads.visibleMessages().last().text.contains("PC"))
    }
}
