package mx.ideass.personal.agent.gateway.session

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
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
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

class SessionProviderTest {
    @Test
    fun resolve_reusesPersistedAcrossReconnects() = runBlocking {
        val provider = InMemorySessionProvider()
        val config = GatewayConfig(url = "wss://gw")
        val hello = sampleHello(mainSessionKey = "agent:main:main")

        val first = provider.resolveForConnection(config, hello)
        assertEquals("agent:main:main", first.sessionKey)

        // Segunda “conexión”: mismos defaults del hello, pero no debe crear otra sesión.
        val hello2 = sampleHello(mainSessionKey = "agent:main:other")
        val second = provider.resolveForConnection(config, hello2)
        assertEquals(first, second)
        assertNotEquals("agent:main:other", second.sessionKey)
    }

    @Test
    fun resolve_prefersConfigOverHelloDefaults() = runBlocking {
        val provider = InMemorySessionProvider()
        val config = GatewayConfig(
            url = "wss://gw",
            defaultSessionKey = "agent:custom:key",
            defaultAgentId = "custom",
        )
        val hello = sampleHello(mainSessionKey = "agent:main:main")
        val session = provider.resolveForConnection(config, hello)
        assertEquals("agent:custom:key", session.sessionKey)
        assertEquals("custom", session.agentId)
        // La principal del server sigue en el catálogo.
        val main = provider.knownSessions.value.single { it.isMain }
        assertEquals("agent:main:main", main.sessionKey)
        assertEquals(MAIN_SESSION_DISPLAY_NAME, main.displayName)
    }

    @Test
    fun setActive_changesSessionFromConfig() = runBlocking {
        val provider = InMemorySessionProvider()
        val hello = sampleHello(mainSessionKey = "agent:main:main")
        provider.resolveForConnection(GatewayConfig(url = "wss://gw"), hello)

        provider.setActive("agent:main:work", "work")
        val again = provider.resolveForConnection(
            GatewayConfig(url = "wss://gw"),
            sampleHello(mainSessionKey = "agent:main:main"),
        )
        assertEquals("agent:main:work", again.sessionKey)
        assertEquals("work", again.agentId)
    }

    @Test
    fun resolve_mainAlwaysPresentInCatalog() = runBlocking {
        val provider = InMemorySessionProvider()
        provider.resolveForConnection(
            GatewayConfig(url = "wss://gw"),
            sampleHello(mainSessionKey = "agent:main:main"),
        )
        val known = provider.knownSessions.value
        assertTrue(known.any { it.isMain && it.sessionKey == "agent:main:main" })
        assertEquals(1, known.count { it.isMain })
    }

    @Test
    fun reconnect_doesNotChangeActiveOrMintKeys() = runBlocking {
        val provider = InMemorySessionProvider()
        provider.resolveForConnection(
            GatewayConfig(url = "wss://gw"),
            sampleHello(mainSessionKey = "agent:main:main"),
        )
        val created = provider.registerAndActivate(
            sessionKey = "agent:main:dashboard:${UUID.randomUUID()}",
            displayName = "Trabajo",
            agentId = "main",
        )
        val beforeKeys = provider.knownSessions.value.map { it.sessionKey }.toSet()
        val beforeActive = provider.activeSession.value

        // Reconexión con otro mainSessionKey en hello: no toca la activa.
        provider.resolveForConnection(
            GatewayConfig(url = "wss://gw"),
            sampleHello(mainSessionKey = "agent:main:other"),
        )
        assertEquals(beforeActive, provider.activeSession.value)
        assertEquals(created.sessionKey, provider.activeSession.value?.sessionKey)
        // Solo se añade/actualiza la nueva principal; no se inventan dashboard keys.
        val after = provider.knownSessions.value
        assertTrue(after.any { it.isMain && it.sessionKey == "agent:main:other" })
        assertFalse(after.any { it.isMain && it.sessionKey == "agent:main:main" })
        assertTrue(after.any { it.sessionKey == created.sessionKey })
        assertTrue(after.map { it.sessionKey }.containsAll(beforeKeys + "agent:main:other"))
    }

    @Test
    fun activeSurvivesRestartSnapshot() = runBlocking {
        val provider = InMemorySessionProvider()
        provider.resolveForConnection(
            GatewayConfig(url = "wss://gw"),
            sampleHello(mainSessionKey = "agent:main:main"),
        )
        val dashKey = "agent:main:dashboard:${UUID.randomUUID()}"
        provider.registerAndActivate(dashKey, "Personal", "main")

        val snapshotKnown = provider.knownSessions.value
        val snapshotActive = provider.activeSession.value?.sessionKey
        assertEquals(dashKey, snapshotActive)

        // Simula matar proceso: nuevo provider rehidratado desde persistencia.
        val restored = InMemorySessionProvider()
        restored.restoreSnapshot(snapshotKnown, snapshotActive)
        assertEquals(dashKey, restored.activeSession.value?.sessionKey)
        assertEquals("Personal", restored.knownSessions.value.find { it.sessionKey == dashKey }?.displayName)

        // Reconexión no cambia la activa restaurada.
        restored.resolveForConnection(
            GatewayConfig(url = "wss://gw"),
            sampleHello(mainSessionKey = "agent:main:main"),
        )
        assertEquals(dashKey, restored.activeSession.value?.sessionKey)
        assertNotNull(restored.knownSessions.value.singleOrNull { it.isMain })
    }

    @Test
    fun registerWithoutActivating_doesNotChangeActive() = runBlocking {
        val provider = InMemorySessionProvider()
        provider.resolveForConnection(
            GatewayConfig(url = "wss://gw"),
            sampleHello(mainSessionKey = "agent:main:main"),
        )
        provider.setActive("agent:main:work", "main")
        val activeBefore = provider.activeSession.value

        val key = "agent:main:dashboard:${UUID.randomUUID()}"
        val known = provider.registerWithoutActivating(key, "Rápidas", "main")

        assertEquals(key, known.sessionKey)
        assertEquals("Rápidas", known.displayName)
        assertEquals(activeBefore, provider.activeSession.value)
        assertEquals("agent:main:work", provider.activeSession.value?.sessionKey)
        assertTrue(provider.knownSessions.value.any { it.sessionKey == key })
    }

    @Test
    fun updateDisplayName_renamesWithoutTouchingKeyOrActive() = runBlocking {
        val provider = InMemorySessionProvider()
        provider.resolveForConnection(
            GatewayConfig(url = "wss://gw"),
            sampleHello(mainSessionKey = "agent:main:main"),
        )
        provider.setActive("agent:main:work", "main")
        val key = "agent:main:dashboard:${UUID.randomUUID()}"
        provider.registerWithoutActivating(key, "Conversación de voz — 10:30", "main")
        val activeBefore = provider.activeSession.value

        val updated = provider.updateDisplayName(key, "Consulta del clima")
        assertNotNull(updated)
        assertEquals(key, updated!!.sessionKey)
        assertEquals("Consulta del clima", updated.displayName)
        assertEquals(
            "Consulta del clima",
            provider.knownSessions.value.find { it.sessionKey == key }?.displayName,
        )
        assertEquals(activeBefore, provider.activeSession.value)
        assertEquals("agent:main:work", provider.activeSession.value?.sessionKey)
    }

    @Test
    fun updateDisplayName_persistsAcrossSnapshotRestore() = runBlocking {
        val provider = InMemorySessionProvider()
        provider.resolveForConnection(
            GatewayConfig(url = "wss://gw"),
            sampleHello(mainSessionKey = "agent:main:main"),
        )
        val key = "agent:main:dashboard:${UUID.randomUUID()}"
        provider.registerWithoutActivating(key, "Provisional", "main")
        provider.updateDisplayName(key, "Título final")

        val restored = InMemorySessionProvider()
        restored.restoreSnapshot(
            known = provider.knownSessions.value,
            activeKey = provider.activeSession.value?.sessionKey,
        )
        assertEquals(
            "Título final",
            restored.knownSessions.value.find { it.sessionKey == key }?.displayName,
        )
        assertEquals(key, restored.knownSessions.value.find { it.sessionKey == key }?.sessionKey)
    }

    @Test
    fun updateDisplayName_unknownKeyOrBlank_isSafeNoOp() = runBlocking {
        val provider = InMemorySessionProvider()
        provider.resolveForConnection(
            GatewayConfig(url = "wss://gw"),
            sampleHello(mainSessionKey = "agent:main:main"),
        )
        val before = provider.knownSessions.value
        val activeBefore = provider.activeSession.value

        assertEquals(null, provider.updateDisplayName("agent:main:dashboard:missing", "X"))
        assertEquals(null, provider.updateDisplayName("agent:main:main", "   "))
        assertEquals(null, provider.updateDisplayName("", "Nombre"))
        assertEquals(before, provider.knownSessions.value)
        assertEquals(activeBefore, provider.activeSession.value)
    }

    @Test
    fun registerAndActivate_acceptsDashboardKeyFormat() = runBlocking {
        val provider = InMemorySessionProvider()
        provider.resolveForConnection(
            GatewayConfig(url = "wss://gw"),
            sampleHello(mainSessionKey = "agent:main:main"),
        )
        val key = "agent:main:dashboard:${UUID.randomUUID()}"
        assertTrue(isDashboardSessionKey(key))

        val known = provider.registerAndActivate(key, "Domótica", "main")
        assertEquals(key, known.sessionKey)
        assertEquals("Domótica", known.displayName)
        assertEquals(key, provider.activeSession.value?.sessionKey)
        assertFalse(known.isMain)
        assertTrue(provider.knownSessions.value.any { it.isMain })
    }

    @Test
    fun agentIdFromSessionKey_parsesCanonical() {
        assertEquals("main", agentIdFromSessionKey("agent:main:main"))
        assertEquals("ops", agentIdFromSessionKey("agent:ops:dashboard:abc"))
        assertEquals(null, agentIdFromSessionKey("main"))
        assertEquals(null, agentIdFromSessionKey("agent:"))
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
