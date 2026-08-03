package mx.ideass.personal.agent.chat

import mx.ideass.personal.agent.gateway.session.KnownSession
import mx.ideass.personal.agent.gateway.session.MAIN_SESSION_DISPLAY_NAME
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionsViewModelTest {
    @Test
    fun buildSessionRows_marksActiveAndMain() {
        val known = listOf(
            KnownSession(
                sessionKey = "agent:main:main",
                displayName = MAIN_SESSION_DISPLAY_NAME,
                agentId = "main",
                isMain = true,
                createdAtMs = 1L,
            ),
            KnownSession(
                sessionKey = "agent:main:dashboard:abc",
                displayName = "Trabajo",
                agentId = "main",
                isMain = false,
                createdAtMs = 2L,
            ),
        )
        val rows = buildSessionRows(known, activeKey = "agent:main:dashboard:abc")
        assertEquals(2, rows.size)
        assertTrue(rows[0].isMain)
        assertFalse(rows[0].isActive)
        assertEquals("Trabajo", rows[1].displayName)
        assertTrue(rows[1].isActive)
        assertFalse(rows[1].isMain)
    }

    @Test
    fun buildSessionRows_emptyActive_noneMarked() {
        val known = listOf(
            KnownSession(
                sessionKey = "agent:main:main",
                displayName = MAIN_SESSION_DISPLAY_NAME,
                isMain = true,
                createdAtMs = 1L,
            ),
        )
        val rows = buildSessionRows(known, activeKey = null)
        assertFalse(rows.single().isActive)
    }
}
