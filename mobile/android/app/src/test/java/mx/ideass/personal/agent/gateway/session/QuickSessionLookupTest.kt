package mx.ideass.personal.agent.gateway.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class QuickSessionLookupTest {
    @Test
    fun findExisting_prefersPersistedKey() {
        val key = "agent:main:dashboard:quick-1"
        val known = listOf(
            KnownSession(
                sessionKey = "agent:main:main",
                displayName = "Principal",
                isMain = true,
                createdAtMs = 1,
            ),
            KnownSession(
                sessionKey = key,
                displayName = "Rápidas",
                createdAtMs = 2,
            ),
            KnownSession(
                sessionKey = "agent:main:dashboard:other",
                displayName = "Rápidas",
                createdAtMs = 3,
            ),
        )
        val found = QuickSessionLookup.findExisting(
            known = known,
            displayName = "Rápidas",
            persistedKey = key,
        )
        assertEquals(key, found?.sessionKey)
    }

    @Test
    fun findExisting_fallsBackToDisplayName() {
        val known = listOf(
            KnownSession(
                sessionKey = "agent:main:dashboard:q",
                displayName = "Rápidas",
                createdAtMs = 1,
            ),
        )
        val found = QuickSessionLookup.findExisting(
            known = known,
            displayName = "Rápidas",
            persistedKey = null,
        )
        assertEquals("agent:main:dashboard:q", found?.sessionKey)
    }

    @Test
    fun findExisting_idempotentWhenAlreadyPresent() {
        val known = listOf(
            KnownSession(
                sessionKey = "agent:main:dashboard:q",
                displayName = "Rápidas",
                createdAtMs = 1,
            ),
        )
        val first = QuickSessionLookup.findExisting(known, "Rápidas", "agent:main:dashboard:q")
        val second = QuickSessionLookup.findExisting(known, "Rápidas", "agent:main:dashboard:q")
        assertEquals(first, second)
        assertEquals("agent:main:dashboard:q", first?.sessionKey)
    }

    @Test
    fun findExisting_returnsNullWhenMissing() {
        assertNull(
            QuickSessionLookup.findExisting(
                known = emptyList(),
                displayName = "Rápidas",
                persistedKey = null,
            ),
        )
    }
}
