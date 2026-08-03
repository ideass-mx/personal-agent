package mx.ideass.personal.agent.gateway.client

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import mx.ideass.personal.agent.gateway.config.GatewayConfig
import mx.ideass.personal.agent.gateway.protocol.ConnectAuth
import mx.ideass.personal.agent.gateway.protocol.ConnectDevice
import mx.ideass.personal.agent.gateway.protocol.ConnectParams
import mx.ideass.personal.agent.gateway.protocol.GatewayAuthMode
import mx.ideass.personal.agent.gateway.protocol.GatewayClientId
import mx.ideass.personal.agent.gateway.protocol.GatewayClientInfo
import mx.ideass.personal.agent.gateway.protocol.GatewayClientMode
import mx.ideass.personal.agent.gateway.protocol.GatewayEvents
import mx.ideass.personal.agent.gateway.protocol.GatewayFrame
import mx.ideass.personal.agent.gateway.protocol.GatewayJson
import mx.ideass.personal.agent.gateway.protocol.GatewayProtocolVersion
import mx.ideass.personal.agent.gateway.protocol.GatewayRoles
import mx.ideass.personal.agent.gateway.protocol.HelloOk
import mx.ideass.personal.agent.gateway.protocol.HelloOkAuth
import mx.ideass.personal.agent.gateway.protocol.HelloOkFeatures
import mx.ideass.personal.agent.gateway.protocol.HelloOkPolicy
import mx.ideass.personal.agent.gateway.protocol.HelloOkServer
import mx.ideass.personal.agent.gateway.protocol.OperatorScopes
import mx.ideass.personal.agent.gateway.protocol.RpcMethods
import mx.ideass.personal.agent.gateway.protocol.SessionDefaults
import mx.ideass.personal.agent.gateway.protocol.Snapshot
import mx.ideass.personal.agent.gateway.protocol.StateVersion
import mx.ideass.personal.agent.gateway.transport.GatewaySocket
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class GatewayHandshakeTest {

    private lateinit var server: MockWebServer
    private lateinit var scope: CoroutineScope

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }

    @After
    fun tearDown() {
        scope.cancel()
        server.shutdown()
    }

    @Test
    fun handshake_challengeConnectHelloOk_andTick() = runBlocking {
        val capturedConnect = AtomicReference<ConnectParams?>()
        val tickLatch = CountDownLatch(1)

        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : WebSocketListener() {
                    override fun onOpen(webSocket: WebSocket, response: Response) {
                        webSocket.send(
                            GatewayJson.encodeToString(
                                GatewayFrame.serializer(),
                                GatewayFrame.Event(
                                    event = GatewayEvents.CONNECT_CHALLENGE,
                                    payload = buildJsonObject {
                                        put("nonce", JsonPrimitive("nonce-test-1"))
                                        put("ts", JsonPrimitive(1_700_000_000_000L))
                                    },
                                ),
                            ),
                        )
                    }

                    override fun onMessage(webSocket: WebSocket, text: String) {
                        val frame = GatewayJson.decodeFromString(GatewayFrame.serializer(), text)
                        assertTrue(frame is GatewayFrame.Request)
                        val req = frame as GatewayFrame.Request
                        assertEquals(RpcMethods.CONNECT, req.method)
                        val params = GatewayJson.decodeFromJsonElement(
                            ConnectParams.serializer(),
                            req.params!!,
                        )
                        capturedConnect.set(params)
                        assertEquals("nonce-test-1", params.device?.nonce)
                        assertEquals(GatewayClientId.OPENCLAW_ANDROID, params.client.id)
                        assertEquals(GatewayClientMode.UI, params.client.mode)
                        assertEquals(GatewayRoles.OPERATOR, params.role)
                        assertEquals(4, params.minProtocol)
                        assertEquals(4, params.maxProtocol)

                        webSocket.send(
                            GatewayJson.encodeToString(
                                GatewayFrame.serializer(),
                                GatewayFrame.Response(
                                    id = req.id,
                                    ok = true,
                                    payload = GatewayJson.encodeToJsonElement(sampleHelloOk()),
                                ),
                            ),
                        )
                        webSocket.send(
                            GatewayJson.encodeToString(
                                GatewayFrame.serializer(),
                                GatewayFrame.Event(
                                    event = GatewayEvents.TICK,
                                    payload = buildJsonObject {
                                        put("ts", JsonPrimitive(99L))
                                    },
                                ),
                            ),
                        )
                        tickLatch.countDown()
                    }
                },
            ),
        )

        val url = "ws://${server.hostName}:${server.port}/"
        val config = GatewayConfig(url = url)
        val http = GatewaySocket.createDefaultClient(pingIntervalSeconds = 0)
        val socket = GatewaySocket(http)
        val handshake = GatewayHandshake(
            socket = socket,
            connectParamsFactory = ConnectParamsFactory { nonce ->
                ConnectParams(
                    minProtocol = GatewayProtocolVersion.CURRENT,
                    maxProtocol = GatewayProtocolVersion.CURRENT,
                    client = GatewayClientInfo(
                        id = GatewayClientId.OPENCLAW_ANDROID,
                        version = "0.1.0",
                        platform = "android",
                        mode = GatewayClientMode.UI,
                    ),
                    role = GatewayRoles.OPERATOR,
                    scopes = OperatorScopes.CHAT_MINIMAL,
                    auth = ConnectAuth(token = "gateway-token"),
                    device = ConnectDevice(
                        id = "device-1",
                        publicKey = "pk",
                        signature = "sig",
                        signedAt = 1L,
                        nonce = nonce,
                    ),
                )
            },
            scope = scope,
            config = config,
        )

        val hello = handshake.connect()
        assertEquals(4, hello.protocol)
        assertEquals("issued-device-token", hello.auth.deviceToken)
        assertEquals(30_000L, hello.policy.tickIntervalMs)
        assertTrue(handshake.state.value is HandshakeState.Connected)

        val connectParams = capturedConnect.get()
        requireNotNull(connectParams)
        assertEquals("nonce-test-1", connectParams.device?.nonce)

        val tick = withTimeout(5_000) { handshake.ticks.first() }
        assertEquals(99L, tick.ts)
        assertTrue(tickLatch.await(5, TimeUnit.SECONDS))

        handshake.disconnect(GatewaySocket.CODE_NORMAL, "test_done")
    }

    @Test
    fun handshake_emptyNonce_fails() = runBlocking {
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : WebSocketListener() {
                    override fun onOpen(webSocket: WebSocket, response: Response) {
                        webSocket.send(
                            """{"type":"event","event":"connect.challenge","payload":{"nonce":"  ","ts":1}}""",
                        )
                    }
                },
            ),
        )

        val url = "ws://${server.hostName}:${server.port}/"
        val handshake = GatewayHandshake(
            socket = GatewaySocket(GatewaySocket.createDefaultClient(0)),
            connectParamsFactory = ConnectParamsFactory { nonce ->
                ConnectParams(
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
                    device = ConnectDevice("d", "pk", "sig", 1, nonce),
                )
            },
            scope = scope,
            config = GatewayConfig(url = url, connectChallengeTimeoutMs = 3_000),
        )

        try {
            handshake.connect()
            throw AssertionError("expected failure")
        } catch (expected: Exception) {
            assertTrue(
                expected.message?.contains("challenge_nonce_missing") == true ||
                    expected.cause?.message?.contains("challenge_nonce_missing") == true ||
                    handshake.state.value is HandshakeState.Failed,
            )
        }
    }

    @Test
    fun handshake_remoteClose_afterHello() = runBlocking {
        server.enqueue(
            MockResponse().withWebSocketUpgrade(
                object : WebSocketListener() {
                    override fun onOpen(webSocket: WebSocket, response: Response) {
                        webSocket.send(
                            GatewayJson.encodeToString(
                                GatewayFrame.serializer(),
                                GatewayFrame.Event(
                                    event = GatewayEvents.CONNECT_CHALLENGE,
                                    payload = buildJsonObject {
                                        put("nonce", JsonPrimitive("n-close"))
                                        put("ts", JsonPrimitive(1L))
                                    },
                                ),
                            ),
                        )
                    }

                    override fun onMessage(webSocket: WebSocket, text: String) {
                        val req = GatewayJson.decodeFromString(
                            GatewayFrame.serializer(),
                            text,
                        ) as GatewayFrame.Request
                        webSocket.send(
                            GatewayJson.encodeToString(
                                GatewayFrame.serializer(),
                                GatewayFrame.Response(
                                    id = req.id,
                                    ok = true,
                                    payload = GatewayJson.encodeToJsonElement(sampleHelloOk()),
                                ),
                            ),
                        )
                        webSocket.close(1000, "server_bye")
                    }
                },
            ),
        )

        val url = "ws://${server.hostName}:${server.port}/"
        val handshake = GatewayHandshake(
            socket = GatewaySocket(GatewaySocket.createDefaultClient(0)),
            connectParamsFactory = ConnectParamsFactory { nonce ->
                ConnectParams(
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
                    auth = ConnectAuth(deviceToken = "tok"),
                    device = ConnectDevice("d", "pk", "sig", 1, nonce),
                )
            },
            scope = scope,
            config = GatewayConfig(url = url),
        )

        val hello = handshake.connect()
        assertEquals("hello-ok", hello.type)
        // El cierre remoto no debe corromper el hello ya parseado.
        assertTrue(handshake.state.value is HandshakeState.Connected)
        handshake.disconnect()
    }

    @Test
    fun normalizeWsUrl_prefersWssForBareHosts() {
        assertEquals(
            "wss://gateway.example:18789",
            GatewaySocket.normalizeWsUrl("gateway.example:18789"),
        )
        assertEquals(
            "ws://127.0.0.1:18789",
            GatewaySocket.normalizeWsUrl("http://127.0.0.1:18789"),
        )
        assertEquals(
            "wss://example.com/ws",
            GatewaySocket.normalizeWsUrl("https://example.com/ws"),
        )
    }

    private fun sampleHelloOk(): HelloOk = HelloOk(
        protocol = GatewayProtocolVersion.CURRENT,
        server = HelloOkServer(version = "2026.7.1", connId = "conn-test"),
        features = HelloOkFeatures(
            methods = listOf(RpcMethods.CHAT_SEND, RpcMethods.CHAT_HISTORY),
            events = listOf(GatewayEvents.CHAT, GatewayEvents.TICK),
        ),
        snapshot = Snapshot(
            presence = emptyList(),
            health = buildJsonObject { put("ok", JsonPrimitive(true)) },
            stateVersion = StateVersion(0, 0),
            uptimeMs = 1,
            sessionDefaults = SessionDefaults(
                defaultAgentId = "main",
                mainKey = "main",
                mainSessionKey = "agent:main:main",
            ),
            authMode = GatewayAuthMode.TOKEN,
        ),
        auth = HelloOkAuth(
            deviceToken = "issued-device-token",
            role = GatewayRoles.OPERATOR,
            scopes = OperatorScopes.CHAT_MINIMAL,
        ),
        policy = HelloOkPolicy(
            maxPayload = 1_000_000,
            maxBufferedBytes = 2_000_000,
            tickIntervalMs = 30_000,
        ),
    )
}
