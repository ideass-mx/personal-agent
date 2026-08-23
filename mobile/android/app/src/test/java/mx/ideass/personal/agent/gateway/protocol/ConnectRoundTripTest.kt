package mx.ideass.personal.agent.gateway.protocol

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ConnectRoundTripTest {

    @Test
    fun connectParams_roundTrip_operatorUi() {
        val params = ConnectParams(
            minProtocol = GatewayProtocolVersion.CURRENT,
            maxProtocol = GatewayProtocolVersion.CURRENT,
            client = GatewayClientInfo(
                id = GatewayClientId.OPENCLAW_ANDROID,
                version = "0.1.0",
                platform = "android",
                mode = GatewayClientMode.UI,
                deviceFamily = "phone",
            ),
            role = GatewayRoles.OPERATOR,
            scopes = OperatorScopes.CHAT_MINIMAL,
            auth = ConnectAuth(bootstrapToken = "boot-secret"),
            device = ConnectDevice(
                id = "abc123",
                publicKey = "pk",
                signature = "sig",
                signedAt = 1_700_000_000_000L,
                nonce = "nonce-1",
            ),
        )

        val encoded = GatewayJson.encodeToString(params)
        val decoded = GatewayJson.decodeFromString<ConnectParams>(encoded)

        assertEquals(4, decoded.minProtocol)
        assertEquals(4, decoded.maxProtocol)
        assertEquals(GatewayClientId.OPENCLAW_ANDROID, decoded.client.id)
        assertEquals(GatewayClientMode.UI, decoded.client.mode)
        assertEquals(GatewayRoles.OPERATOR, decoded.role)
        assertEquals(listOf("operator.read", "operator.write"), decoded.scopes)
        assertEquals("boot-secret", decoded.auth?.bootstrapToken)
        assertEquals("nonce-1", decoded.device?.nonce)

        assertTrue(encoded.contains("\"id\":\"openclaw-android\""))
        assertTrue(encoded.contains("\"mode\":\"ui\""))
        assertTrue(encoded.contains("\"role\":\"operator\""))
    }

    @Test
    fun connectRequestFrame_embedsParams() {
        val params = ConnectParams(
            minProtocol = 4,
            maxProtocol = 4,
            client = GatewayClientInfo(
                id = GatewayClientId.OPENCLAW_ANDROID,
                version = "0.1.0",
                platform = "android",
                mode = GatewayClientMode.UI,
            ),
            role = GatewayRoles.OPERATOR,
            scopes = OperatorScopes.CHAT_MINIMAL,
            auth = ConnectAuth(deviceToken = "dev-tok"),
        )
        val frame: GatewayFrame = GatewayFrame.Request(
            id = "c1",
            method = RpcMethods.CONNECT,
            params = GatewayJson.encodeToJsonElement(params),
        )

        val decodedFrame = GatewayJson.decodeFromString<GatewayFrame>(
            GatewayJson.encodeToString(frame),
        ) as GatewayFrame.Request
        val decodedParams = GatewayJson.decodeFromJsonElement<ConnectParams>(decodedFrame.params!!)
        assertEquals("dev-tok", decodedParams.auth?.deviceToken)
        assertEquals(RpcMethods.CONNECT, decodedFrame.method)
    }

    @Test
    fun helloOk_roundTrip() {
        val hello = HelloOk(
            protocol = 4,
            server = HelloOkServer(version = "2026.7.1", connId = "conn-1"),
            features = HelloOkFeatures(
                methods = listOf(RpcMethods.CHAT_SEND, RpcMethods.CHAT_HISTORY),
                events = listOf(GatewayEvents.CHAT, GatewayEvents.TICK),
                capabilities = listOf("chat-send-routing-contract"),
            ),
            snapshot = Snapshot(
                presence = emptyList(),
                health = buildJsonObject { put("ok", JsonPrimitive(true)) },
                stateVersion = StateVersion(presence = 0, health = 0),
                uptimeMs = 12_000,
                sessionDefaults = SessionDefaults(
                    defaultAgentId = "main",
                    mainKey = "main",
                    mainSessionKey = "agent:main:main",
                ),
                authMode = GatewayAuthMode.TOKEN,
            ),
            auth = HelloOkAuth(
                deviceToken = "issued-token",
                role = GatewayRoles.OPERATOR,
                scopes = OperatorScopes.CHAT_MINIMAL,
                issuedAtMs = 1_700_000_000_000L,
            ),
            policy = HelloOkPolicy(
                maxPayload = 1_000_000,
                maxBufferedBytes = 2_000_000,
                tickIntervalMs = 30_000,
            ),
        )

        val encoded = GatewayJson.encodeToString(hello)
        val decoded = GatewayJson.decodeFromString<HelloOk>(encoded)

        assertEquals("hello-ok", decoded.type)
        assertEquals(4, decoded.protocol)
        assertEquals("issued-token", decoded.auth.deviceToken)
        assertEquals("agent:main:main", decoded.snapshot.sessionDefaults?.mainSessionKey)
        assertEquals(30_000L, decoded.policy.tickIntervalMs)
        assertEquals(GatewayAuthMode.TOKEN, decoded.snapshot.authMode)
        assertTrue(decoded.snapshot.health is JsonObject)
    }

    @Test
    fun helloOk_insideResponsePayload() {
        val hello = HelloOk(
            protocol = 4,
            server = HelloOkServer(version = "2026.7.1", connId = "c"),
            features = HelloOkFeatures(methods = emptyList(), events = emptyList()),
            snapshot = Snapshot(
                presence = emptyList(),
                health = buildJsonObject {},
                stateVersion = StateVersion(0, 0),
                uptimeMs = 1,
            ),
            auth = HelloOkAuth(role = "operator", scopes = emptyList()),
            policy = HelloOkPolicy(1, 1, 15_000),
        )
        val frame: GatewayFrame = GatewayFrame.Response(
            id = "connect-1",
            ok = true,
            payload = GatewayJson.encodeToJsonElement(hello),
        )
        val decoded = GatewayJson.decodeFromString<GatewayFrame>(GatewayJson.encodeToString(frame))
            as GatewayFrame.Response
        val payload = GatewayJson.decodeFromJsonElement<HelloOk>(decoded.payload!!)
        assertEquals("hello-ok", payload.type)
        assertEquals(
            "hello-ok",
            decoded.payload!!.jsonObject.getValue("type").jsonPrimitive.content,
        )
    }
}
