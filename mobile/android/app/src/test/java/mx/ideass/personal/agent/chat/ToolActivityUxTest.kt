package mx.ideass.personal.agent.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ToolActivityUxTest {

    @Test
    fun preparing_whenPendingReplyWithoutConfirm() {
        val state = ToolActivityUx.resolveVisible(
            conversationId = "c1",
            hasPendingReply = true,
            hasStreaming = false,
            pendingConfirmForConversation = false,
            executingToolName = null,
        )
        assertEquals(ToolActivityPhase.Preparing, state?.phase)
        assertEquals("Preparando acción…", ToolActivityUx.statusLabel(state!!.phase))
    }

    @Test
    fun awaitingAuth_whenConfirmPending() {
        val state = ToolActivityUx.resolveVisible(
            conversationId = "c1",
            hasPendingReply = true,
            hasStreaming = false,
            pendingConfirmForConversation = true,
            executingToolName = "filesystem.write",
        )
        assertEquals(ToolActivityPhase.AwaitingAuth, state?.phase)
        assertEquals("Esperando autorización…", ToolActivityUx.statusLabel(state!!.phase))
        assertEquals("Escribir archivos", state.capabilityLabel)
    }

    @Test
    fun executing_afterApproval() {
        val state = ToolActivityUx.stateAfterConfirmResponse(
            conversationId = "c1",
            toolName = "filesystem.write",
            approved = true,
        )
        assertEquals(ToolActivityPhase.Executing, state.phase)
        assertEquals("Ejecutando…", ToolActivityUx.statusLabel(state.phase))
    }

    @Test
    fun failed_onReject() {
        val state = ToolActivityUx.stateAfterConfirmResponse(
            conversationId = "c1",
            toolName = "process.execute",
            approved = false,
        )
        assertEquals(ToolActivityPhase.Failed, state.phase)
        assertEquals("No se pudo completar la acción", ToolActivityUx.statusLabel(state.phase))
    }

    @Test
    fun hiddenWhileStreaming() {
        assertNull(
            ToolActivityUx.resolveVisible(
                conversationId = "c1",
                hasPendingReply = true,
                hasStreaming = true,
                pendingConfirmForConversation = false,
                executingToolName = "filesystem.read",
            ),
        )
    }

    @Test
    fun excelWindowsNote_onExcelTools() {
        val note = ToolActivityUx.excelWindowsNote("office.excel.write")
        assertTrue(note!!.contains("Windows"))
        val state = ToolActivityUx.stateForConfirmRequest("c1", "office.excel.read")
        assertEquals(note, state.platformNote)
    }

    @Test
    fun completedPhase_label() {
        assertEquals("Acción completada", ToolActivityUx.statusLabel(ToolActivityPhase.Completed))
    }
}
