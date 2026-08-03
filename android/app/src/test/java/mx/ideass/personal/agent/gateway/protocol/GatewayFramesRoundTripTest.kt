package mx.ideass.personal.agent.gateway.protocol

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GatewayFramesRoundTripTest {

    @Test
    fun requestFrame_roundTrip() {
        val params = buildJsonObject {
            put("sessionKey", JsonPrimitive("agent:main:main"))
            put("message", JsonPrimitive("hola"))
            put("idempotencyKey", JsonPrimitive("idem-1"))
        }
        val frame: GatewayFrame = GatewayFrame.Request(
            id = "req-1",
            method = RpcMethods.CHAT_SEND,
            params = params,
        )

        val encoded = GatewayJson.encodeToString(frame)
        val decoded = GatewayJson.decodeFromString<GatewayFrame>(encoded)

        assertTrue(decoded is GatewayFrame.Request)
        val req = decoded as GatewayFrame.Request
        assertEquals("req-1", req.id)
        assertEquals(RpcMethods.CHAT_SEND, req.method)
        assertEquals("hola", req.params?.jsonObject?.get("message")?.jsonPrimitive?.content)
        assertTrue(encoded.contains("\"type\":\"req\""))
        assertFalse(encoded.contains("\"type\":\"res\""))
    }

    @Test
    fun responseFrame_okAndError_roundTrip() {
        val ok: GatewayFrame = GatewayFrame.Response(
            id = "r1",
            ok = true,
            payload = buildJsonObject { put("runId", JsonPrimitive("run-9")) },
        )
        val okDecoded = GatewayJson.decodeFromString<GatewayFrame>(GatewayJson.encodeToString(ok))
        assertTrue(okDecoded is GatewayFrame.Response)
        assertTrue((okDecoded as GatewayFrame.Response).ok)
        assertEquals("run-9", okDecoded.payload?.jsonObject?.get("runId")?.jsonPrimitive?.content)

        val err: GatewayFrame = GatewayFrame.Response(
            id = "r2",
            ok = false,
            error = ErrorShape(
                code = GatewayErrorCodes.INVALID_REQUEST,
                message = "bad",
                retryable = true,
                retryAfterMs = 500,
            ),
        )
        val errDecoded = GatewayJson.decodeFromString<GatewayFrame>(GatewayJson.encodeToString(err))
            as GatewayFrame.Response
        assertFalse(errDecoded.ok)
        assertEquals(GatewayErrorCodes.INVALID_REQUEST, errDecoded.error?.code)
        assertEquals(500L, errDecoded.error?.retryAfterMs)
        assertNull(errDecoded.payload)
    }

    @Test
    fun eventFrame_connectChallenge_roundTrip() {
        val challenge = ConnectChallengePayload(nonce = "nonce-abc", ts = 1_700_000_000_000L)
        val frame: GatewayFrame = GatewayFrame.Event(
            event = GatewayEvents.CONNECT_CHALLENGE,
            payload = GatewayJson.encodeToJsonElement(challenge),
            seq = 1,
        )

        val decoded = GatewayJson.decodeFromString<GatewayFrame>(GatewayJson.encodeToString(frame))
            as GatewayFrame.Event
        assertEquals(GatewayEvents.CONNECT_CHALLENGE, decoded.event)
        assertEquals(1L, decoded.seq)

        val payload = GatewayJson.decodeFromJsonElement<ConnectChallengePayload>(decoded.payload!!)
        assertEquals("nonce-abc", payload.nonce)
        assertEquals(1_700_000_000_000L, payload.ts)
    }

    @Test
    fun eventFrame_tick_roundTrip() {
        val tick = TickEventPayload(ts = 42)
        val frame: GatewayFrame = GatewayFrame.Event(
            event = GatewayEvents.TICK,
            payload = GatewayJson.encodeToJsonElement(tick),
        )
        val decoded = GatewayJson.decodeFromString<GatewayFrame>(GatewayJson.encodeToString(frame))
            as GatewayFrame.Event
        val payload = GatewayJson.decodeFromJsonElement<TickEventPayload>(decoded.payload!!)
        assertEquals(42L, payload.ts)
    }

    @Test
    fun requestWithoutParams_omitsNullFields() {
        val frame: GatewayFrame = GatewayFrame.Request(id = "x", method = "health")
        val encoded = GatewayJson.encodeToString(frame)
        assertFalse(encoded.contains("params"))
        val decoded = GatewayJson.decodeFromString<GatewayFrame>(encoded) as GatewayFrame.Request
        assertNull(decoded.params)
        // JsonNull no debe colarse
        assertTrue(decoded.params !is JsonNull)
    }

    @Test
    fun unknownKeys_areIgnored() {
        val raw = """
            {
              "type":"event",
              "event":"tick",
              "payload":{"ts":9,"futureField":true},
              "extraTop":1
            }
        """.trimIndent()
        val decoded = GatewayJson.decodeFromString<GatewayFrame>(raw) as GatewayFrame.Event
        assertEquals(GatewayEvents.TICK, decoded.event)
        assertEquals(9L, decoded.payload?.jsonObject?.get("ts")?.jsonPrimitive?.long)
    }
}
