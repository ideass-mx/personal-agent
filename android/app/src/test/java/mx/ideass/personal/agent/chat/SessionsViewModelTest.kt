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
        assertFalse(rows[0].selectable)
        assertEquals("Trabajo", rows[1].displayName)
        assertTrue(rows[1].isActive)
        assertFalse(rows[1].isMain)
        assertTrue(rows[1].selectable)
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

    @Test
    fun buildSessionRows_selectionMarksNonMainOnly() {
        val known = sampleCatalog()
        val rows = buildSessionRows(
            known,
            activeKey = "agent:main:main",
            selectedKeys = setOf("agent:main:main", "agent:main:dashboard:a", "missing"),
        )
        assertFalse(rows.single { it.isMain }.selected)
        assertTrue(rows.single { it.sessionKey == "agent:main:dashboard:a" }.selected)
        assertFalse(rows.single { it.sessionKey == "agent:main:dashboard:b" }.selected)
    }

    @Test
    fun filterDeletableKeys_excludesMain() {
        val known = sampleCatalog()
        val filtered = filterDeletableKeys(
            known,
            listOf("agent:main:main", "agent:main:dashboard:a", "ghost"),
        )
        assertEquals(setOf("agent:main:dashboard:a"), filtered)
    }

    @Test
    fun allDeletableKeys_survivesSelectAllWithoutMain() {
        val known = sampleCatalog()
        val all = allDeletableKeys(known)
        assertEquals(
            setOf("agent:main:dashboard:a", "agent:main:dashboard:b"),
            all,
        )
        assertFalse(all.contains("agent:main:main"))
        val rows = buildSessionRows(known, activeKey = null, selectedKeys = all)
        assertFalse(rows.single { it.isMain }.selected)
        assertTrue(rows.filter { it.selectable }.all { it.selected })
    }

    private fun sampleCatalog(): List<KnownSession> = listOf(
        KnownSession(
            sessionKey = "agent:main:main",
            displayName = MAIN_SESSION_DISPLAY_NAME,
            agentId = "main",
            isMain = true,
            createdAtMs = 1L,
        ),
        KnownSession(
            sessionKey = "agent:main:dashboard:a",
            displayName = "A",
            agentId = "main",
            isMain = false,
            createdAtMs = 2L,
        ),
        KnownSession(
            sessionKey = "agent:main:dashboard:b",
            displayName = "B",
            agentId = "main",
            isMain = false,
            createdAtMs = 3L,
        ),
    )
}
