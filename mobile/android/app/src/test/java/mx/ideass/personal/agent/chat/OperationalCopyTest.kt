package mx.ideass.personal.agent.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OperationalCopyTest {

    @Test
    fun connectionLabels_readyVsOffline() {
        assertEquals(
            "Agente listo",
            OperationalCopy.connectionHeaderLabel(
                connected = true,
                reconnecting = false,
                unconfigured = false,
            ),
        )
        assertEquals(
            "Sin conexión",
            OperationalCopy.connectionHeaderLabel(
                connected = false,
                reconnecting = true,
                unconfigured = false,
            ),
        )
        assertEquals(
            "Sin configurar",
            OperationalCopy.connectionHeaderLabel(
                connected = false,
                reconnecting = false,
                unconfigured = true,
            ),
        )
    }

    @Test
    fun agentDisconnected_isHumanized() {
        val msg = OperationalCopy.humanizeInboundError("agent_disconnected", "agent_disconnected")
        assertTrue(msg.contains("PC"))
        assertFalse(msg.equals("agent_disconnected", ignoreCase = true))
        assertFalse(msg.startsWith("Error:"))
    }

    @Test
    fun genericError_keepsMessage() {
        assertEquals(
            "fallo de red",
            OperationalCopy.humanizeInboundError("internal", "fallo de red"),
        )
    }

    @Test
    fun emptyCopy_isNonBlank() {
        assertTrue(OperationalCopy.chatEmptyTitle().isNotBlank())
        assertTrue(OperationalCopy.chatEmptyBody().isNotBlank())
        assertTrue(OperationalCopy.historyLoading().isNotBlank())
        assertTrue(OperationalCopy.historyError().isNotBlank())
    }
}
