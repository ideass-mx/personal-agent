package mx.ideass.personal.agent.gateway.transport

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.encodeToString
import mx.ideass.personal.agent.gateway.protocol.GatewayFrame
import mx.ideass.personal.agent.gateway.protocol.GatewayJson
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Transporte WebSocket de texto JSON hacia el Gateway.
 * No interpreta handshake ni RPC; solo frames y ciclo de vida del socket.
 */
class GatewaySocket(
    private val httpClient: OkHttpClient,
) {
    private val _state = MutableStateFlow<SocketState>(SocketState.Idle)
    val state: StateFlow<SocketState> = _state.asStateFlow()

    private val _frames = MutableSharedFlow<GatewayFrame>(
        extraBufferCapacity = 64,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val frames: SharedFlow<GatewayFrame> = _frames.asSharedFlow()

    private val _rawParseErrors = MutableSharedFlow<String>(
        extraBufferCapacity = 16,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val rawParseErrors: SharedFlow<String> = _rawParseErrors.asSharedFlow()

    private var webSocket: WebSocket? = null
    private val open = AtomicBoolean(false)

    fun connect(url: String) {
        close(CODE_NORMAL, "reconnect")
        _state.value = SocketState.Connecting
        val request = Request.Builder().url(normalizeWsUrl(url)).build()
        webSocket = httpClient.newWebSocket(request, Listener())
    }

    fun send(frame: GatewayFrame): Boolean {
        val socket = webSocket ?: return false
        if (!open.get()) return false
        val text = GatewayJson.encodeToString(frame)
        return socket.send(text)
    }

    fun close(code: Int = CODE_NORMAL, reason: String? = null) {
        val socket = webSocket
        webSocket = null
        open.set(false)
        if (socket != null) {
            socket.close(code, reason?.take(123))
            // cancel evita dejar el transporte colgado tras close en cola
            socket.cancel()
        }
        if (_state.value !is SocketState.Closed && _state.value !is SocketState.Failed) {
            _state.value = SocketState.Closed(code = code, reason = reason.orEmpty(), remote = false)
        }
    }

    private inner class Listener : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            open.set(true)
            _state.value = SocketState.Open
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            val frame = runCatching {
                GatewayJson.decodeFromString(GatewayFrame.serializer(), text)
            }.getOrElse {
                _rawParseErrors.tryEmit("frame_parse_error")
                return
            }
            _frames.tryEmit(frame)
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            webSocket.close(code, reason)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            open.set(false)
            _state.value = SocketState.Closed(code = code, reason = reason, remote = true)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            open.set(false)
            _state.value = SocketState.Failed(
                message = t.message ?: "socket_failure",
                cause = t,
            )
        }
    }

    companion object {
        const val CODE_NORMAL: Int = 1000
        const val CODE_PROTOCOL_ERROR: Int = 1008
        const val CODE_GOING_AWAY: Int = 1001
        /** Contrato v4: silencio de ticks → forzar reconexión. */
        const val CODE_TICK_TIMEOUT: Int = 4000

        fun createDefaultClient(pingIntervalSeconds: Long): OkHttpClient =
            OkHttpClient.Builder()
                .pingInterval(pingIntervalSeconds, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build()

        fun normalizeWsUrl(raw: String): String {
            val trimmed = raw.trim()
            return when {
                trimmed.startsWith("ws://") || trimmed.startsWith("wss://") -> trimmed
                trimmed.startsWith("http://") -> "ws://" + trimmed.removePrefix("http://")
                trimmed.startsWith("https://") -> "wss://" + trimmed.removePrefix("https://")
                else -> "wss://$trimmed"
            }
        }
    }
}
