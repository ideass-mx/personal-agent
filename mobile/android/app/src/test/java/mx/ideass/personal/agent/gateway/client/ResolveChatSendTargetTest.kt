package mx.ideass.personal.agent.gateway.client

import mx.ideass.personal.agent.gateway.session.ActiveSession
import mx.ideass.personal.agent.gateway.session.KnownSession
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ResolveChatSendTargetTest {
    @Test
    fun preferredKey_winsOverActive_withoutRequiringActiveMatch() {
        val active = ActiveSession(sessionKey = "agent:main:work", agentId = "main")
        val quick = "agent:main:dashboard:rapidas"
        val known = listOf(
            KnownSession(
                sessionKey = "agent:main:work",
                displayName = "Trabajo",
                agentId = "main",
                createdAtMs = 1,
            ),
            KnownSession(
                sessionKey = quick,
                displayName = "Rápidas",
                agentId = "main",
                createdAtMs = 2,
            ),
        )
        val target = resolveChatSendTarget(
            preferredSessionKey = quick,
            active = active,
            known = known,
        )
        assertEquals(quick, target?.sessionKey)
        assertEquals("main", target?.agentId)
        // La activa no se consulta como destino cuando hay preferred.
        assertEquals("agent:main:work", active.sessionKey)
    }

    @Test
    fun withoutPreferred_usesActive() {
        val active = ActiveSession(sessionKey = "agent:main:main", agentId = "main")
        val target = resolveChatSendTarget(
            preferredSessionKey = null,
            active = active,
            known = emptyList(),
        )
        assertEquals("agent:main:main", target?.sessionKey)
        assertEquals("main", target?.agentId)
    }

    @Test
    fun preferredWithoutKnown_parsesAgentFromKey() {
        val target = resolveChatSendTarget(
            preferredSessionKey = "agent:ops:dashboard:abc",
            active = ActiveSession(sessionKey = "agent:main:main", agentId = "main"),
            known = emptyList(),
        )
        assertEquals("agent:ops:dashboard:abc", target?.sessionKey)
        assertEquals("ops", target?.agentId)
    }

    @Test
    fun noPreferredAndNoActive_returnsNull() {
        assertNull(
            resolveChatSendTarget(
                preferredSessionKey = null,
                active = null,
                known = emptyList(),
            ),
        )
    }
}
