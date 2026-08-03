package mx.ideass.personal.agent.gateway.protocol

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatSessionsRoundTripTest {

    @Test
    fun chatSendAndHistory_paramsDiffer() {
        val send = ChatSendParams(
            sessionKey = "agent:main:main",
            agentId = "main",
            message = "hola",
            idempotencyKey = "idem-42",
            fastMode = JsonPrimitive(true),
        )
        val history = ChatHistoryParams(
            sessionKey = "agent:main:main",
            agentId = "main",
            limit = 50,
            offset = 0,
        )

        val sendJson = GatewayJson.encodeToString(send)
        val historyJson = GatewayJson.encodeToString(history)

        assertTrue(sendJson.contains("idempotencyKey"))
        assertTrue(sendJson.contains("\"message\":\"hola\""))
        assertFalse(historyJson.contains("idempotencyKey"))
        assertFalse(historyJson.contains("\"message\""))
        assertTrue(historyJson.contains("\"limit\":50"))

        assertEquals(send, GatewayJson.decodeFromString<ChatSendParams>(sendJson))
        assertEquals(history, GatewayJson.decodeFromString<ChatHistoryParams>(historyJson))
    }

    @Test
    fun chatEvent_deltaAndFinal_useStateDiscriminator() {
        val delta: ChatEvent = ChatEvent.Delta(
            runId = "run-1",
            sessionKey = "agent:main:main",
            seq = 1,
            deltaText = "Ho",
            replace = false,
        )
        val finalEvent: ChatEvent = ChatEvent.Final(
            runId = "run-1",
            sessionKey = "agent:main:main",
            agentId = "main",
            seq = 2,
            message = buildJsonObject {
                put("role", JsonPrimitive("assistant"))
                put("content", JsonPrimitive("Hola"))
            },
            stopReason = "stop",
        )

        val deltaEncoded = GatewayJson.encodeToString(delta)
        val finalEncoded = GatewayJson.encodeToString(finalEvent)

        assertTrue(deltaEncoded.contains("\"state\":\"delta\""))
        assertTrue(finalEncoded.contains("\"state\":\"final\""))
        assertFalse(deltaEncoded.contains("\"type\":\"delta\""))

        val deltaDecoded = GatewayJson.decodeFromString<ChatEvent>(deltaEncoded)
        val finalDecoded = GatewayJson.decodeFromString<ChatEvent>(finalEncoded)

        assertTrue(deltaDecoded is ChatEvent.Delta)
        assertEquals("Ho", (deltaDecoded as ChatEvent.Delta).deltaText)
        assertTrue(finalDecoded is ChatEvent.Final)
        assertEquals("stop", (finalDecoded as ChatEvent.Final).stopReason)
    }

    @Test
    fun chatEvent_insideGatewayEventFrame() {
        val chat: ChatEvent = ChatEvent.Error(
            runId = "r",
            sessionKey = "s",
            seq = 3,
            errorMessage = "boom",
            errorKind = ChatEventErrorKind.RATE_LIMIT,
        )
        val frame: GatewayFrame = GatewayFrame.Event(
            event = GatewayEvents.CHAT,
            payload = GatewayJson.encodeToJsonElement(chat),
            seq = 10,
        )
        val decodedFrame = GatewayJson.decodeFromString<GatewayFrame>(
            GatewayJson.encodeToString(frame),
        ) as GatewayFrame.Event
        val decodedChat = GatewayJson.decodeFromJsonElement<ChatEvent>(decodedFrame.payload!!)
            as ChatEvent.Error
        assertEquals(ChatEventErrorKind.RATE_LIMIT, decodedChat.errorKind)
        assertEquals("boom", decodedChat.errorMessage)
    }

    @Test
    fun sessionsCreateAndList_roundTrip() {
        val create = SessionsCreateParams(
            key = "agent:main:custom",
            agentId = "main",
            label = "móvil",
        )
        val list = SessionsListParams(
            limit = 20,
            agentId = "main",
            includeDerivedTitles = true,
        )
        assertEquals(create, GatewayJson.decodeFromString<SessionsCreateParams>(
            GatewayJson.encodeToString(create),
        ))
        assertEquals(list, GatewayJson.decodeFromString<SessionsListParams>(
            GatewayJson.encodeToString(list),
        ))
    }

    @Test
    fun devicePairSetupCode_roundTrip() {
        val result = DevicePairSetupCodeResult(
            setupCode = "SETUP-CODE",
            gatewayUrl = "wss://gateway.example:18789",
            auth = DevicePairSetupCodeAuthLabel.TOKEN,
            urlSource = "config",
        )
        val encoded = GatewayJson.encodeToString(result)
        val decoded = GatewayJson.decodeFromString<DevicePairSetupCodeResult>(encoded)
        assertEquals("SETUP-CODE", decoded.setupCode)
        assertEquals(DevicePairSetupCodeAuthLabel.TOKEN, decoded.auth)
        assertTrue(encoded.contains("\"auth\":\"token\""))
    }
}
