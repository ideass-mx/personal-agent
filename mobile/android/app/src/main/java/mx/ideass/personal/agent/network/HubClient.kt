package mx.ideass.personal.agent.network

import android.util.Log
import mx.ideass.personal.agent.app.AppPreferences
import mx.ideass.personal.agent.app.HubConfig
import mx.ideass.personal.agent.protocol.ClientMessage
import mx.ideass.personal.agent.protocol.ProtocolJson
import mx.ideass.personal.agent.protocol.ServerMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlin.math.min
import kotlin.math.pow

/**
 * Cliente WebSocket del Gateway (nombre histórico: HubClient).
 * Alias canónico: [AgentGatewayClient].
 * No es MCP Client; no habla con el Node.
 * Solo [mx.ideass.personal.agent.service.AgentService]
 * lo arranca; la UI nunca abre ni cierra la conexión.
 */
@Singleton
class HubClient @Inject constructor(
    private val preferences: AppPreferences,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val client = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.SinConfigurar)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _serverMessages = MutableSharedFlow<ServerMessage>(extraBufferCapacity = 64)
    val serverMessages: SharedFlow<ServerMessage> = _serverMessages.asSharedFlow()

    private val pendingQueue = ArrayDeque<ClientMessage.UserMessage>()
    private val queueMutex = Mutex()

    private var webSocket: WebSocket? = null
    private var sessionJob: Job? = null
    private var countdownJob: Job? = null
    private val authenticated = AtomicBoolean(false)
    private val forceReconnect = AtomicBoolean(false)
    private var started = false

    fun start() {
        if (started) return
        started = true
        scope.launch {
            preferences.hubConfig
                .distinctUntilChanged()
                .collectLatest { config ->
                    sessionJob?.cancel()
                    countdownJob?.cancel()
                    closeSocket()
                    if (config == null) {
                        _connectionState.value = ConnectionState.SinConfigurar
                        return@collectLatest
                    }
                    sessionJob = scope.launch { runSessionLoop(config) }
                }
        }
    }

    /**
     * Cancela el backoff y cierra el socket para reintentar al instante
     * (p. ej. al recuperar red vía NetworkCallback).
     */
    fun reconnectNow() {
        if (!started) return
        forceReconnect.set(true)
        countdownJob?.cancel()
        countdownJob = null
        closeSocket()
    }

    /**
     * Encola el mensaje si no hay sesión autenticada; lo envía al instante si sí.
     * Los mensajes en cola se despachan en orden al reconectar.
     */
    fun sendUserMessage(text: String, conversationId: String?) {
        val message = ClientMessage.UserMessage(text = text, conversationId = conversationId)
        scope.launch {
            if (authenticated.get() && sendRaw(message)) return@launch
            queueMutex.withLock { pendingQueue.addLast(message) }
        }
    }

    fun sendConfirmResponse(confirmationId: String, approved: Boolean) {
        val id = confirmationId.trim()
        if (id.isEmpty()) return
        val message = ClientMessage.ConfirmResponse(confirmationId = id, approved = approved)
        scope.launch {
            sendRaw(message)
        }
    }

    fun isConnected(): Boolean = authenticated.get()

    /**
     * QR pairing: connect, send pairing_request, wait for pairing_result.
     * On approved, persists device credential (authKind=device).
     */
    suspend fun completePairingFromQr(
        endpoint: String,
        pairingSessionId: String,
        pairingSecret: String,
        deviceName: String,
    ): Result<String> {
        val deviceId = preferences.getOrCreateDeviceId()
        return suspendCancellableCoroutine { cont ->
            val settled = AtomicBoolean(false)
            fun settle(result: Result<String>) {
                if (settled.compareAndSet(false, true) && cont.isActive) {
                    cont.resume(result)
                }
            }
            val request = Request.Builder().url(normalizeWsUrl(endpoint)).build()
            val probeClient = client.newBuilder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .build()
            val socket = probeClient.newWebSocket(
                request,
                object : WebSocketListener() {
                    override fun onOpen(webSocket: WebSocket, response: Response) {
                        val req = ClientMessage.PairingRequest(
                            pairingSessionId = pairingSessionId,
                            pairingSecret = pairingSecret,
                            deviceId = deviceId,
                            deviceName = deviceName.trim().ifBlank { null },
                            platform = "android",
                        )
                        webSocket.send(ProtocolJson.encodeToString(ClientMessage.serializer(), req))
                    }

                    override fun onMessage(webSocket: WebSocket, text: String) {
                        when (val msg = decodeServer(text)) {
                            is ServerMessage.PairingPending -> Unit
                            is ServerMessage.PairingResult -> {
                                when (msg.status) {
                                    "approved" -> {
                                        val cred = msg.deviceCredential
                                        if (cred.isNullOrBlank()) {
                                            settle(Result.failure(Exception("Sin deviceCredential")))
                                        } else {
                                            settle(Result.success(cred))
                                        }
                                        webSocket.close(1000, null)
                                    }
                                    "rejected" -> {
                                        settle(Result.failure(Exception("Emparejamiento rechazado")))
                                        webSocket.close(1000, null)
                                    }
                                    "expired" -> {
                                        settle(Result.failure(Exception("Sesión de pairing expirada")))
                                        webSocket.close(1000, null)
                                    }
                                    else -> {
                                        settle(Result.failure(Exception("Resultado de pairing desconocido")))
                                        webSocket.close(1000, null)
                                    }
                                }
                            }
                            is ServerMessage.Error -> {
                                settle(Result.failure(Exception(msg.message)))
                                webSocket.close(1000, null)
                            }
                            else -> Unit
                        }
                    }

                    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                        settle(Result.failure(Exception(t.message ?: "Fallo de pairing")))
                    }

                    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                        settle(Result.failure(Exception("Conexión cerrada antes de completar pairing")))
                    }
                },
            )
            cont.invokeOnCancellation { socket.cancel() }
        }
    }

    /**
     * Abre un WebSocket temporal, autentica y mide latencia hasta auth_ok.
     * No altera la sesión persistente del cliente.
     */
    suspend fun probe(
        address: String,
        token: String,
        deviceName: String,
    ): Result<Long> {
        val deviceId = preferences.getOrCreateDeviceId()
        return suspendCancellableCoroutine { cont ->
            val startedAt = System.currentTimeMillis()
            val settled = AtomicBoolean(false)
            fun settle(result: Result<Long>) {
                if (settled.compareAndSet(false, true) && cont.isActive) {
                    cont.resume(result)
                }
            }
            val request = Request.Builder().url(normalizeWsUrl(address)).build()
            val probeClient = client.newBuilder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .build()
            val socket = probeClient.newWebSocket(
                request,
                object : WebSocketListener() {
                    override fun onOpen(webSocket: WebSocket, response: Response) {
                        val auth = ClientMessage.Auth(
                            token = token.trim(),
                            deviceId = deviceId,
                            deviceName = deviceName.trim().ifBlank { null },
                            authKind = "install",
                        )
                        webSocket.send(ProtocolJson.encodeToString(ClientMessage.serializer(), auth))
                    }

                    override fun onMessage(webSocket: WebSocket, text: String) {
                        when (val msg = decodeServer(text)) {
                            is ServerMessage.AuthOk -> {
                                val latency = System.currentTimeMillis() - startedAt
                                settle(Result.success(latency))
                                webSocket.close(1000, null)
                            }
                            is ServerMessage.Error -> {
                                settle(Result.failure(Exception(msg.message)))
                                webSocket.close(1000, null)
                            }
                            else -> Unit
                        }
                    }

                    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                        settle(
                            Result.failure(
                                Exception(t.message ?: "No se pudo conectar al hub"),
                            ),
                        )
                    }

                    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                        settle(
                            Result.failure(Exception("Conexión cerrada antes de autenticar")),
                        )
                    }
                },
            )
            cont.invokeOnCancellation { socket.cancel() }
        }
    }

    private suspend fun runSessionLoop(config: HubConfig) {
        var attempt = 0
        while (true) {
            try {
                authenticated.set(false)
                if (forceReconnect.getAndSet(false)) {
                    attempt = 0
                }
                if (attempt > 0) {
                    val delayMs = backoffMs(attempt)
                    val seconds = ((delayMs + 999) / 1000).toInt().coerceAtLeast(1)
                    Log.i(PA_TAG, "inicio de reintento de reconexión #$attempt (espera ${seconds}s)")
                    awaitBackoff(seconds)
                    if (forceReconnect.getAndSet(false)) {
                        attempt = 0
                    }
                } else {
                    _connectionState.value = ConnectionState.Reconectando(0)
                }
                openAndAwaitClose(config)
                attempt += 1
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (t: Throwable) {
                Log.e(TAG, "excepción en bucle de sesión (reintento): ${t.javaClass.simpleName}: ${t.message}")
                authenticated.set(false)
                attempt += 1
                delay(1_000)
            }
        }
    }

    private suspend fun awaitBackoff(totalSeconds: Int) {
        countdownJob?.cancel()
        countdownJob = scope.launch {
            for (remaining in totalSeconds downTo 1) {
                if (forceReconnect.get()) break
                _connectionState.value = ConnectionState.Reconectando(remaining)
                delay(1000)
            }
        }
        countdownJob?.join()
        countdownJob = null
    }

    private suspend fun openAndAwaitClose(config: HubConfig) {
        val closed = Channel<Unit>(capacity = 1)
        val deviceId = preferences.getOrCreateDeviceId()
        val request = Request.Builder().url(normalizeWsUrl(config.address)).build()

        val listener = object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.i(PA_TAG, "conexión abierta")
                val auth = ClientMessage.Auth(
                    token = config.token,
                    deviceId = deviceId,
                    deviceName = config.deviceName.ifBlank { null },
                    authKind = config.authKind,
                )
                webSocket.send(ProtocolJson.encodeToString(ClientMessage.serializer(), auth))
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val msg = decodeServer(text) ?: return
                Log.i(PA_TAG, "mensaje recibido: ${msg::class.simpleName}")
                when (msg) {
                    is ServerMessage.AuthOk -> {
                        Log.i(PA_TAG, "auth ok")
                        authenticated.set(true)
                        _connectionState.value = ConnectionState.Conectado
                        scope.launch { flushPending() }
                    }
                    is ServerMessage.Error -> {
                        if (!authenticated.get()) {
                            Log.w(TAG, "Auth fallida: ${msg.message}")
                            webSocket.close(1000, null)
                        }
                    }
                    else -> Unit
                }
                scope.launch { _serverMessages.emit(msg) }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.i(PA_TAG, "desconexión: onClosed code=$code reason=$reason")
                authenticated.set(false)
                closed.trySend(Unit)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.i(PA_TAG, "desconexión: onFailure ${t.message}")
                Log.w(TAG, "WebSocket falló: ${t.message}")
                authenticated.set(false)
                closed.trySend(Unit)
            }
        }

        webSocket = client.newWebSocket(request, listener)
        try {
            closed.receive()
        } finally {
            webSocket = null
            authenticated.set(false)
        }
    }

    private suspend fun flushPending() {
        queueMutex.withLock {
            while (pendingQueue.isNotEmpty() && authenticated.get()) {
                val next = pendingQueue.removeFirst()
                if (!sendRaw(next)) {
                    pendingQueue.addFirst(next)
                    break
                }
            }
        }
    }

    private fun sendRaw(message: ClientMessage): Boolean {
        val socket = webSocket ?: return false
        if (!authenticated.get()) return false
        return socket.send(ProtocolJson.encodeToString(ClientMessage.serializer(), message))
    }

    private fun closeSocket() {
        authenticated.set(false)
        webSocket?.cancel()
        webSocket = null
    }

    /** Backoff exponencial: 1s → 2s → 4s → … → 30s. */
    private fun backoffMs(attempt: Int): Long {
        val exp = min(30_000.0, 1_000.0 * 2.0.pow((attempt - 1).coerceAtLeast(0)))
        return exp.toLong().coerceIn(1_000L, 30_000L)
    }

    private fun normalizeWsUrl(address: String): String {
        val trimmed = address.trim().trimEnd('/')
        return if (trimmed.endsWith("/ws")) trimmed else "$trimmed/ws"
    }

    private fun decodeServer(text: String): ServerMessage? = try {
        ProtocolJson.decodeFromString(ServerMessage.serializer(), text)
    } catch (e: Exception) {
        Log.d(TAG, "Mensaje ignorado: ${e.message}")
        null
    }

    companion object {
        private const val TAG = "HubClient"
        private const val PA_TAG = "PersonalAgent"
    }
}
