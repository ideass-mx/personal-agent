package mx.ideass.personal.agent.gateway.client

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import mx.ideass.personal.agent.gateway.config.GatewayConfig
import mx.ideass.personal.agent.gateway.events.GatewayEventBus
import mx.ideass.personal.agent.gateway.protocol.ConnectChallengePayload
import mx.ideass.personal.agent.gateway.protocol.GatewayEvents
import mx.ideass.personal.agent.gateway.protocol.GatewayFrame
import mx.ideass.personal.agent.gateway.protocol.GatewayJson
import mx.ideass.personal.agent.gateway.protocol.HelloOk
import mx.ideass.personal.agent.gateway.protocol.RpcMethods
import mx.ideass.personal.agent.gateway.protocol.TickEventPayload
import mx.ideass.personal.agent.gateway.rpc.FrameSender
import mx.ideass.personal.agent.gateway.rpc.GatewayRpc
import mx.ideass.personal.agent.gateway.rpc.GatewayRpcException
import mx.ideass.personal.agent.gateway.rpc.PendingRpc
import mx.ideass.personal.agent.gateway.transport.GatewaySocket
import mx.ideass.personal.agent.gateway.transport.SocketState
import java.util.UUID

/**
 * Orquesta challenge → connect → hello-ok sobre [GatewaySocket].
 * Emite ticks/eventos post-hello; no reconecta (CP5+).
 */
class GatewayHandshake(
    private val socket: GatewaySocket,
    private val connectParamsFactory: ConnectParamsFactory,
    private val scope: CoroutineScope,
    private val config: GatewayConfig,
    private val pendingRpc: PendingRpc = PendingRpc(),
    private val eventBus: GatewayEventBus = GatewayEventBus(),
) {
    private val _state = MutableStateFlow<HandshakeState>(HandshakeState.Idle)
    val state: StateFlow<HandshakeState> = _state.asStateFlow()

    private val _ticks = MutableSharedFlow<TickEventPayload>(extraBufferCapacity = 16)
    val ticks: SharedFlow<TickEventPayload> = _ticks.asSharedFlow()

    private val _postHelloEvents = MutableSharedFlow<GatewayFrame.Event>(extraBufferCapacity = 64)
    val postHelloEvents: SharedFlow<GatewayFrame.Event> = _postHelloEvents.asSharedFlow()

    val events: GatewayEventBus get() = eventBus

    private var pumpJob: Job? = null
    private var challengeDeferred: CompletableDeferred<String> = CompletableDeferred()
    private var lastHello: HelloOk? = null

    /**
     * Abre el socket, completa el handshake y deja el transporte listo.
     * Lanza si challenge/connect fallan o hacen timeout.
     */
    suspend fun connect(url: String = config.url): HelloOk {
        resetForNewAttempt()
        _state.value = HandshakeState.WaitingChallenge
        pumpJob = scope.launch { pumpFrames() }

        socket.connect(url)
        try {
            awaitSocketOpen()
            val nonce = withTimeout(config.connectChallengeTimeoutMs) {
                challengeDeferred.await()
            }
            _state.value = HandshakeState.Connecting
            val hello = requestConnect(nonce)
            lastHello = hello
            _state.value = HandshakeState.Connected(hello)
            return hello
        } catch (t: CancellationException) {
            throw t
        } catch (t: Throwable) {
            failAndClose("handshake_failed", t)
            throw t
        }
    }

    /** Sesión RPC/eventos sobre el transporte ya autenticado. */
    fun openSession(): GatewaySession {
        val hello = lastHello ?: error("handshake_not_connected")
        val rpc = GatewayRpc(
            sender = FrameSender { frame -> socket.send(frame) },
            pending = pendingRpc,
            defaultTimeoutMs = config.rpcTimeoutMs,
        )
        return GatewaySession(
            socket = socket,
            pendingRpc = pendingRpc,
            rpc = rpc,
            events = eventBus,
            hello = hello,
        )
    }

    fun disconnect(code: Int = GatewaySocket.CODE_NORMAL, reason: String? = "client_disconnect") {
        cancelPump()
        pendingRpc.failAll(IllegalStateException("disconnected"))
        if (!challengeDeferred.isCompleted) {
            challengeDeferred.completeExceptionally(IllegalStateException("disconnected"))
        }
        socket.close(code, reason)
        lastHello = null
        _state.value = HandshakeState.Idle
    }

    private fun resetForNewAttempt() {
        cancelPump()
        pendingRpc.failAll(IllegalStateException("handshake_restart"))
        if (!challengeDeferred.isCompleted) {
            challengeDeferred.completeExceptionally(IllegalStateException("handshake_restart"))
        }
        challengeDeferred = CompletableDeferred()
        lastHello = null
    }

    private suspend fun requestConnect(nonce: String): HelloOk {
        val id = UUID.randomUUID().toString()
        val params = connectParamsFactory.create(nonce)
        require(params.device == null || params.device.nonce == nonce) {
            "device.nonce_mismatch"
        }

        val deferred = pendingRpc.register(id)
        val sent = socket.send(
            GatewayFrame.Request(
                id = id,
                method = RpcMethods.CONNECT,
                params = GatewayJson.encodeToJsonElement(params),
            ),
        )
        if (!sent) {
            pendingRpc.failAll(IllegalStateException("socket_send_failed"))
            error("socket_send_failed")
        }

        val response = pendingRpc.await(
            id = id,
            deferred = deferred,
            timeoutMs = config.connectRequestTimeoutMs,
            method = RpcMethods.CONNECT,
        )
        if (!response.ok) {
            val error = response.error ?: error("connect_error_missing")
            throw GatewayRpcException(error)
        }
        val payload = response.payload ?: error("hello_ok_missing")
        return GatewayJson.decodeFromJsonElement(HelloOk.serializer(), payload)
    }

    private suspend fun awaitSocketOpen() {
        withTimeout(config.connectChallengeTimeoutMs) {
            socket.state.first { state ->
                when (state) {
                    SocketState.Open -> true
                    is SocketState.Failed -> throw IllegalStateException(state.message, state.cause)
                    is SocketState.Closed ->
                        throw IllegalStateException("socket_closed_before_open:${state.code}")
                    else -> false
                }
            }
        }
    }

    private suspend fun pumpFrames() {
        socket.frames.collect { frame ->
            when (frame) {
                is GatewayFrame.Response -> pendingRpc.complete(frame)
                is GatewayFrame.Event -> handleEvent(frame)
                is GatewayFrame.Request -> Unit
            }
        }
    }

    private suspend fun handleEvent(event: GatewayFrame.Event) {
        eventBus.publish(event)
        when (event.event) {
            GatewayEvents.CONNECT_CHALLENGE -> {
                val payload = event.payload
                if (payload == null) {
                    challengeDeferred.completeExceptionally(
                        IllegalStateException("challenge_payload_missing"),
                    )
                    return
                }
                val challenge = runCatching {
                    GatewayJson.decodeFromJsonElement(ConnectChallengePayload.serializer(), payload)
                }.getOrElse {
                    challengeDeferred.completeExceptionally(it)
                    return
                }
                val nonce = challenge.nonce.trim()
                if (nonce.isEmpty()) {
                    challengeDeferred.completeExceptionally(
                        IllegalStateException("challenge_nonce_missing"),
                    )
                    socket.close(GatewaySocket.CODE_PROTOCOL_ERROR, "connect challenge missing nonce")
                    return
                }
                challengeDeferred.complete(nonce)
            }
            GatewayEvents.TICK -> {
                val payload = event.payload ?: return
                val tick = runCatching {
                    GatewayJson.decodeFromJsonElement(TickEventPayload.serializer(), payload)
                }.getOrNull() ?: return
                _ticks.emit(tick)
                if (_state.value is HandshakeState.Connected) {
                    _postHelloEvents.emit(event)
                }
            }
            else -> {
                if (_state.value is HandshakeState.Connected) {
                    _postHelloEvents.emit(event)
                }
            }
        }
    }

    private fun failAndClose(reason: String, cause: Throwable?) {
        if (_state.value !is HandshakeState.Connected) {
            _state.value = HandshakeState.Failed(reason = reason, cause = cause)
        }
        socket.close(GatewaySocket.CODE_PROTOCOL_ERROR, reason.take(123))
    }

    private fun cancelPump() {
        pumpJob?.cancel()
        pumpJob = null
    }
}
