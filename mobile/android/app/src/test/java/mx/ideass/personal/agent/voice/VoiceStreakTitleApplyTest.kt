package mx.ideass.personal.agent.voice

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.delay
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
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
import mx.ideass.personal.agent.network.ChatConnection
import mx.ideass.personal.agent.network.ChatInbound
import mx.ideass.personal.agent.network.ConnectionState
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.util.UUID

class VoiceStreakTitleApplyTest {
    private val prompt =
        "Dame solo un título de máximo 6 palabras para esta conversación. Responde únicamente el título."

    @Test
    fun parseableAgentReply_renames() = runBlocking {
        val provider = primedProvider()
        val key = registerStreak(provider, "Conversación de voz — 10:00")
        val chat = FakeTitleChatConnection(connected = true)
        chat.autoReply(key, "\"Consulta del clima\".")

        val applied = runStreakTitleAfterHang(
            sessionProvider = provider,
            chatConnection = chat,
            recordUserPrompt = { _, _ -> },
            waitForSessionIdle = { _, _ -> true },
            sessionKey = key,
            provisionalName = "Conversación de voz — 10:00",
            firstUserUtterance = "cómo está el clima",
            titlePrompt = prompt,
            replyTimeoutMs = 2_000L,
        )

        assertEquals("Consulta del clima", applied)
        assertEquals(
            "Consulta del clima",
            provider.knownSessions.value.find { it.sessionKey == key }?.displayName,
        )
    }

    @Test
    fun offline_usesFallbackA() = runBlocking {
        val provider = primedProvider()
        val key = registerStreak(provider, "Conversación de voz — 10:00")
        val chat = FakeTitleChatConnection(connected = false)

        val applied = runStreakTitleAfterHang(
            sessionProvider = provider,
            chatConnection = chat,
            recordUserPrompt = { _, _ -> },
            waitForSessionIdle = { _, _ -> true },
            sessionKey = key,
            provisionalName = "Conversación de voz — 10:00",
            firstUserUtterance = "cómo está el clima hoy",
            titlePrompt = prompt,
        )

        assertEquals("cómo está el clima hoy", applied)
        assertEquals(
            "cómo está el clima hoy",
            provider.knownSessions.value.find { it.sessionKey == key }?.displayName,
        )
        assertNull(chat.lastSent)
    }

    @Test
    fun timeout_usesFallbackA() = runBlocking {
        val provider = primedProvider()
        val key = registerStreak(provider, "Conversación de voz — 10:00")
        val chat = FakeTitleChatConnection(connected = true)
        // No emite respuesta → timeout.

        val applied = runStreakTitleAfterHang(
            sessionProvider = provider,
            chatConnection = chat,
            recordUserPrompt = { _, _ -> },
            waitForSessionIdle = { _, _ -> true },
            sessionKey = key,
            provisionalName = "Conversación de voz — 10:00",
            firstUserUtterance = "recordatorio del dentista",
            titlePrompt = prompt,
            replyTimeoutMs = 50L,
        )

        assertEquals("recordatorio del dentista", applied)
    }

    @Test
    fun manuallyRenamed_isNotOverwritten() = runBlocking {
        val provider = primedProvider()
        val provisional = "Conversación de voz — 10:00"
        val key = registerStreak(provider, provisional)
        provider.updateDisplayName(key, "Nombre a mano")
        val chat = FakeTitleChatConnection(connected = true)
        chat.autoReply(key, "Titulo del agente")

        val applied = runStreakTitleAfterHang(
            sessionProvider = provider,
            chatConnection = chat,
            recordUserPrompt = { _, _ -> },
            waitForSessionIdle = { _, _ -> true },
            sessionKey = key,
            provisionalName = provisional,
            firstUserUtterance = "algo",
            titlePrompt = prompt,
            replyTimeoutMs = 2_000L,
        )

        assertNull(applied)
        assertEquals(
            "Nombre a mano",
            provider.knownSessions.value.find { it.sessionKey == key }?.displayName,
        )
    }

    @Test
    fun inFlightReply_waitsThenSendsTitlePrompt() = runBlocking {
        val provider = primedProvider()
        val key = registerStreak(provider, "Conversación de voz — 10:00")
        val chat = FakeTitleChatConnection(connected = true)
        chat.autoReply(key, "Titulo corto")
        var waitCalls = 0
        var recorded = 0

        val applied = runStreakTitleAfterHang(
            sessionProvider = provider,
            chatConnection = chat,
            recordUserPrompt = { _, _ -> recorded += 1 },
            waitForSessionIdle = { _, _ ->
                waitCalls += 1
                true
            },
            sessionKey = key,
            provisionalName = "Conversación de voz — 10:00",
            firstUserUtterance = "sabes qué me pasó",
            titlePrompt = prompt,
            replyTimeoutMs = 2_000L,
        )

        assertEquals(1, waitCalls)
        assertEquals(1, recorded)
        assertEquals("Titulo corto", applied)
        assertEquals(prompt, chat.lastSent?.first)
    }

    @Test
    fun inFlightTimeout_usesFallbackWithoutSendingTitlePrompt() = runBlocking {
        val provider = primedProvider()
        val key = registerStreak(provider, "Conversación de voz — 10:00")
        val chat = FakeTitleChatConnection(connected = true)
        var recorded = 0

        val applied = runStreakTitleAfterHang(
            sessionProvider = provider,
            chatConnection = chat,
            recordUserPrompt = { _, _ -> recorded += 1 },
            waitForSessionIdle = { _, _ -> false },
            sessionKey = key,
            provisionalName = "Conversación de voz — 10:00",
            firstUserUtterance = "sabes qué me pasó ayer en la oficina",
            titlePrompt = prompt,
            replyTimeoutMs = 50L,
        )

        assertEquals(0, recorded)
        assertNull(chat.lastSent)
        assertEquals("sabes qué me pasó ayer en la oficina", applied)
    }

    private suspend fun primedProvider(): InMemorySessionProvider {
        val provider = InMemorySessionProvider()
        provider.resolveForConnection(
            GatewayConfig(url = "wss://gw"),
            sampleHello("agent:main:main"),
        )
        return provider
    }

    private suspend fun registerStreak(
        provider: InMemorySessionProvider,
        name: String,
    ): String {
        val key = "agent:main:dashboard:${UUID.randomUUID()}"
        provider.registerWithoutActivating(key, name, "main")
        return key
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

private class FakeTitleChatConnection(
    private var connected: Boolean,
) : ChatConnection {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val _inbound = MutableSharedFlow<ChatInbound>(extraBufferCapacity = 16)
    private val _state = MutableStateFlow(ConnectionState.SinConfigurar)
    var lastSent: Pair<String, String?>? = null
        private set
    private var autoReply: Pair<String, String>? = null

    override val connectionState: StateFlow<ConnectionState> = _state
    override val inbound: SharedFlow<ChatInbound> = _inbound

    override fun start() = Unit
    override fun reconnectNow() = Unit
    override fun isConnected(): Boolean = connected
    override fun sendConfirmResponse(confirmationId: String, approved: Boolean) = Unit
    override suspend fun probe(address: String, token: String, deviceName: String) =
        Result.success(1L)

    override fun sendUserMessage(text: String, conversationId: String?) {
        lastSent = text to conversationId
        val reply = autoReply ?: return
        val (sessionKey, body) = reply
        scope.launch {
            // Dar tiempo a que el collector del titulado se suscriba.
            delay(20)
            _inbound.emit(
                ChatInbound.AssistantDelta(
                    text = body,
                    replace = true,
                    sessionKey = sessionKey,
                ),
            )
            _inbound.emit(ChatInbound.AssistantDone(sessionKey))
        }
    }

    fun autoReply(sessionKey: String, text: String) {
        autoReply = sessionKey to text
    }
}
