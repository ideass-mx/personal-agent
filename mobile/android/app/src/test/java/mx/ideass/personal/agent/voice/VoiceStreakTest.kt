package mx.ideass.personal.agent.voice

import mx.ideass.personal.agent.gateway.config.GatewayConfig
import mx.ideass.personal.agent.gateway.protocol.GatewayAuthMode
import mx.ideass.personal.agent.gateway.protocol.GatewayRoles
import mx.ideass.personal.agent.gateway.protocol.HelloOk
import mx.ideass.personal.agent.gateway.protocol.HelloOkAuth
import mx.ideass.personal.agent.gateway.protocol.HelloOkFeatures
import mx.ideass.personal.agent.gateway.protocol.HelloOkPolicy
import mx.ideass.personal.agent.gateway.protocol.HelloOkServer
import mx.ideass.personal.agent.gateway.protocol.OperatorScopes
import mx.ideass.personal.agent.gateway.protocol.SessionDefaults
import mx.ideass.personal.agent.gateway.protocol.Snapshot
import mx.ideass.personal.agent.gateway.protocol.StateVersion
import mx.ideass.personal.agent.gateway.session.InMemorySessionProvider
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

class VoiceStreakNamesTest {
    @Test
    fun formatProvisional_insertsHourMinute() {
        assertEquals(
            "Conversación de voz — 21:05",
            VoiceStreakNames.formatProvisional(
                template = "Conversación de voz — %1\$s",
                hourMinute = "21:05",
            ),
        )
    }
}

/**
 * La creación de racha usa registerWithoutActivating (vía createNamedSession activate=false).
 * Aquí se valida el contrato de catálogo sin Gateway real.
 */
class VoiceStreakCatalogTest {
    @Test
    fun twoStreaks_areDistinctSessions_withoutChangingActive() = runBlocking {
        val provider = InMemorySessionProvider()
        provider.resolveForConnection(
            GatewayConfig(url = "wss://gw"),
            sampleHello("agent:main:main"),
        )
        provider.setActive("agent:main:work", "main")
        val activeBefore = provider.activeSession.value

        val a = "agent:main:dashboard:${UUID.randomUUID()}"
        val b = "agent:main:dashboard:${UUID.randomUUID()}"
        val nameA = VoiceStreakNames.formatProvisional("Conversación de voz — %1\$s", "10:00")
        val nameB = VoiceStreakNames.formatProvisional("Conversación de voz — %1\$s", "10:01")
        provider.registerWithoutActivating(a, nameA, "main")
        provider.registerWithoutActivating(b, nameB, "main")

        assertNotEquals(a, b)
        assertEquals(nameA, provider.knownSessions.value.find { it.sessionKey == a }?.displayName)
        assertEquals(nameB, provider.knownSessions.value.find { it.sessionKey == b }?.displayName)
        assertEquals(activeBefore, provider.activeSession.value)
        assertEquals("agent:main:work", provider.activeSession.value?.sessionKey)
        assertTrue(provider.knownSessions.value.any { it.sessionKey == a })
        assertTrue(provider.knownSessions.value.any { it.sessionKey == b })
        assertFalse(provider.activeSession.value?.sessionKey == a)
        assertFalse(provider.activeSession.value?.sessionKey == b)
    }

    @Test
    fun inConversationOrigin_keepsExistingKeyAndDisplayName() = runBlocking {
        val provider = InMemorySessionProvider()
        provider.resolveForConnection(
            GatewayConfig(url = "wss://gw"),
            sampleHello("agent:main:main"),
        )
        val work = "agent:main:dashboard:work-x"
        provider.registerWithoutActivating(work, "Trabajo", "main")
        provider.setActive(work, "main")
        val knownBefore = provider.knownSessions.value.size
        val nameBefore = provider.knownSessions.value.find { it.sessionKey == work }!!.displayName

        val plan = VoiceOriginPolicy.bindPlan(VoiceOrigin.InConversation(work))
        assertEquals(VoiceBindPlan.UseExisting(work), plan)
        assertFalse(VoiceOriginPolicy.titlesOnHang(plan))

        // Simula colgar in-conversation: no create, no rename.
        assertEquals(knownBefore, provider.knownSessions.value.size)
        assertEquals(
            nameBefore,
            provider.knownSessions.value.find { it.sessionKey == work }?.displayName,
        )
        assertEquals(work, provider.activeSession.value?.sessionKey)
    }

    private fun sampleHello(mainSessionKey: String): HelloOk = HelloOk(
        protocol = 4,
        server = HelloOkServer(version = "2026.7.1", connId = "c"),
        features = HelloOkFeatures(methods = emptyList(), events = emptyList()),
        snapshot = Snapshot(
            presence = emptyList(),
            health = buildJsonObject { put("ok", JsonPrimitive(true)) },
            stateVersion = StateVersion(0, 0),
            uptimeMs = 1,
            sessionDefaults = SessionDefaults(
                defaultAgentId = "main",
                mainKey = "main",
                mainSessionKey = mainSessionKey,
            ),
            authMode = GatewayAuthMode.TOKEN,
        ),
        auth = HelloOkAuth(
            role = GatewayRoles.OPERATOR,
            scopes = OperatorScopes.CHAT_MINIMAL,
        ),
        policy = HelloOkPolicy(1, 1, 30_000),
    )
}
