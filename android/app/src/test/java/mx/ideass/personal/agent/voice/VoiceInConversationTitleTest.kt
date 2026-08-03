package mx.ideass.personal.agent.voice

import mx.ideass.personal.agent.gateway.session.InMemorySessionProvider
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
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Contrato del addendum: voz desde conversación abierta no crea ni titula.
 */
class VoiceInConversationTitleTest {
    @Test
    fun hangWithoutTitle_leavesDisplayNameIntact() = runBlocking {
        val provider = InMemorySessionProvider()
        provider.resolveForConnection(
            GatewayConfig(url = "wss://gw"),
            sampleHello("agent:main:main"),
        )
        val key = "agent:main:dashboard:open-1"
        provider.registerWithoutActivating(key, "Proyecto Alpha", "main")
        val knownCount = provider.knownSessions.value.size

        val plan = VoiceOriginPolicy.bindPlan(VoiceOrigin.InConversation(key))
        assertFalse(VoiceOriginPolicy.titlesOnHang(plan))

        // Sin scheduleStreakTitle: updateDisplayName no se llama.
        assertNull(
            // Simula resolveTitle de un titulado que no debe correr.
            if (VoiceOriginPolicy.titlesOnHang(plan)) {
                VoiceStreakTitleLogic.resolveTitle("Titulo agente", "hola")
            } else {
                null
            },
        )
        assertEquals(knownCount, provider.knownSessions.value.size)
        assertEquals(
            "Proyecto Alpha",
            provider.knownSessions.value.find { it.sessionKey == key }?.displayName,
        )
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
