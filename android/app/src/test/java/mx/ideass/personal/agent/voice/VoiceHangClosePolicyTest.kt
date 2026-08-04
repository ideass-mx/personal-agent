package mx.ideass.personal.agent.voice

import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

/**
 * Contrato hangUp: UI cierra sin esperar titulado; titulado respeta anti-"N".
 */
class VoiceHangClosePolicyTest {

    @Test
    fun uiNotifiesBeforeAudioCleanup() {
        assertTrue(VoiceHangClosePolicy.notifyUiBeforeAudioCleanup())
        assertTrue(VoiceHangClosePolicy.titleRunsOffCriticalPath())
    }

    @Test
    fun immediateSteps_coverWakeStopIdleNotifyAndEarcon() {
        val immediate = VoiceHangClosePolicy.immediateSteps()
        assertTrue(immediate.contains(VoiceHangClosePolicy.ImmediateStep.ReleaseScreenWake))
        assertTrue(immediate.contains(VoiceHangClosePolicy.ImmediateStep.StopListening))
        assertTrue(immediate.contains(VoiceHangClosePolicy.ImmediateStep.SetUiIdle))
        assertTrue(immediate.contains(VoiceHangClosePolicy.ImmediateStep.NotifySessionEnded))
        assertTrue(immediate.contains(VoiceHangClosePolicy.ImmediateStep.PlayCloseEarcon))
        assertEquals(
            listOf(VoiceHangClosePolicy.DeferredStep.ReleaseScoAndMicAfterEarconHold),
            VoiceHangClosePolicy.deferredSteps(),
        )
        // Notify antes del cleanup diferido de audio (contrato).
        assertTrue(VoiceHangClosePolicy.notifyUiBeforeAudioCleanup())
    }

    @Test
    fun hangReasons_allUseSameImmediateContract() {
        for (reason in HangReason.entries) {
            assertTrue(
                "reason=$reason",
                VoiceHangClosePolicy.notifyUiBeforeAudioCleanup(),
            )
            assertTrue(
                "reason=$reason",
                VoiceHangClosePolicy.titleRunsOffCriticalPath(),
            )
        }
    }

    @Test
    fun delayedInFlightReply_titleWaitsButClosePathDoesNot() = runBlocking {
        val provider = primedProvider()
        val key = registerStreak(provider, "Conversación de voz — 10:00")
        val chat = HangCloseFakeChat(connected = true)
        chat.autoReply(key, "Titulo corto")

        var idleReleased = false
        val titleJob = async {
            runStreakTitleAfterHang(
                sessionProvider = provider,
                chatConnection = chat,
                recordUserPrompt = { _, _ -> },
                waitForSessionIdle = { _, _ ->
                    delay(80)
                    idleReleased = true
                    true
                },
                sessionKey = key,
                provisionalName = "Conversación de voz — 10:00",
                firstUserUtterance = "consulta del clima",
                titlePrompt = "Dame solo un título",
                replyTimeoutMs = 2_000L,
            )
        }

        // Cierre inmediato (policy): no espera al titulado ni al AssistantDone.
        assertTrue(VoiceHangClosePolicy.notifyUiBeforeAudioCleanup())
        assertFalse(idleReleased)

        val applied = withTimeout(3_000L) { titleJob.await() }
        assertTrue(idleReleased)
        assertEquals("Titulo corto", applied)
    }

    @Test
    fun inFlightNotIdle_doesNotSendTitlePrompt() = runBlocking {
        val provider = primedProvider()
        val key = registerStreak(provider, "Conversación de voz — 10:00")
        val chat = HangCloseFakeChat(connected = true)
        var recorded = 0

        val applied = runStreakTitleAfterHang(
            sessionProvider = provider,
            chatConnection = chat,
            recordUserPrompt = { _, _ -> recorded += 1 },
            waitForSessionIdle = { _, _ -> false },
            sessionKey = key,
            provisionalName = "Conversación de voz — 10:00",
            firstUserUtterance = "sabes qué me pasó ayer",
            titlePrompt = "Dame solo un título",
            replyTimeoutMs = 50L,
        )

        assertEquals(0, recorded)
        assertNull(chat.lastSent)
        assertEquals("sabes qué me pasó ayer", applied)
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

private class HangCloseFakeChat(
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
    override suspend fun probe(address: String, token: String, deviceName: String) =
        Result.success(1L)

    override fun sendUserMessage(text: String, conversationId: String?) {
        lastSent = text to conversationId
        val reply = autoReply ?: return
        val (sessionKey, body) = reply
        scope.launch {
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
