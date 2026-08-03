package mx.ideass.personal.agent.gateway.client

import android.content.Context
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.TimeoutCancellationException
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
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import mx.ideass.personal.agent.gateway.auth.DeviceIdentityStore
import mx.ideass.personal.agent.gateway.auth.DeviceTokenStore
import mx.ideass.personal.agent.gateway.auth.KeystoreEncryptedStringStore
import mx.ideass.personal.agent.gateway.auth.SignedConnectParamsFactory
import mx.ideass.personal.agent.gateway.config.GatewayConfig
import mx.ideass.personal.agent.gateway.events.GatewayBusEvent
import mx.ideass.personal.agent.gateway.events.GatewayEventBus
import mx.ideass.personal.agent.gateway.protocol.ChatEvent
import mx.ideass.personal.agent.gateway.protocol.ChatHistoryParams
import mx.ideass.personal.agent.gateway.protocol.ChatHistoryResult
import mx.ideass.personal.agent.gateway.protocol.ChatSendParams
import mx.ideass.personal.agent.gateway.protocol.ConnectErrorCodes
import mx.ideass.personal.agent.gateway.protocol.GatewayJson
import mx.ideass.personal.agent.gateway.protocol.GatewayRoles
import mx.ideass.personal.agent.gateway.protocol.HelloOk
import mx.ideass.personal.agent.gateway.protocol.JsonMessageText
import mx.ideass.personal.agent.gateway.protocol.RpcMethods
import mx.ideass.personal.agent.gateway.protocol.SessionsCreateParams
import mx.ideass.personal.agent.gateway.protocol.SessionsCreateResult
import mx.ideass.personal.agent.gateway.protocol.SessionsDeleteParams
import mx.ideass.personal.agent.gateway.protocol.SessionsPatchParams
import mx.ideass.personal.agent.gateway.rpc.GatewayRpcException
import mx.ideass.personal.agent.gateway.rpc.IdempotencyKeys
import mx.ideass.personal.agent.gateway.rpc.PendingRpc
import mx.ideass.personal.agent.gateway.session.ActiveSession
import mx.ideass.personal.agent.gateway.session.KnownSession
import mx.ideass.personal.agent.gateway.session.SessionProvider
import mx.ideass.personal.agent.gateway.session.agentIdFromSessionKey
import mx.ideass.personal.agent.gateway.transport.GatewaySocket
import mx.ideass.personal.agent.network.ChatInbound
import mx.ideass.personal.agent.network.ConnectionState
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.min
import kotlin.math.pow

/**
 * Cliente operator de alto nivel: handshake, reconexión con backoff
 * (preserva [SessionProvider]), chat.send/history y eventos de chat.
 */
@Singleton
class GatewayClient @Inject constructor(
    @ApplicationContext private val context: Context,
    private val sessionProvider: SessionProvider,
    private val configSource: GatewayConfigSource,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val identityStore = DeviceIdentityStore(
        KeystoreEncryptedStringStore(context, DeviceIdentityStore.PREFS_NAME),
    )
    private val tokenStore = DeviceTokenStore(
        KeystoreEncryptedStringStore(context, DeviceTokenStore.PREFS_NAME),
    )

    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.SinConfigurar)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _inbound = MutableSharedFlow<ChatInbound>(extraBufferCapacity = 64)
    val inbound: SharedFlow<ChatInbound> = _inbound.asSharedFlow()

    private val _chatEvents = MutableSharedFlow<ChatEvent>(extraBufferCapacity = 64)
    val chatEvents: SharedFlow<ChatEvent> = _chatEvents.asSharedFlow()

    private val pendingQueue = ArrayDeque<QueuedChat>()
    private val queueMutex = Mutex()

    private var sessionJob: Job? = null
    private var countdownJob: Job? = null
    private var eventsJob: Job? = null
    private val forceReconnect = AtomicBoolean(false)
    private val connected = AtomicBoolean(false)
    private var started = false

    private var handshake: GatewayHandshake? = null
    private var gatewaySession: GatewaySession? = null
    private var activeConfig: GatewayConfig? = null

    fun start() {
        if (started) return
        started = true
        scope.launch {
            configSource.config
                .distinctUntilChanged()
                .collectLatest { config ->
                    sessionJob?.cancel()
                    countdownJob?.cancel()
                    eventsJob?.cancel()
                    tearDownSocket()
                    if (config == null) {
                        _connectionState.value = ConnectionState.SinConfigurar
                        return@collectLatest
                    }
                    activeConfig = config
                    val configuredKey = config.defaultSessionKey?.trim()?.takeIf { it.isNotEmpty() }
                    if (configuredKey != null) {
                        sessionProvider.setActive(configuredKey, config.defaultAgentId)
                    }
                    sessionJob = scope.launch { runSessionLoop(config) }
                }
        }
    }

    fun reconnectNow() {
        if (!started) return
        forceReconnect.set(true)
        countdownJob?.cancel()
        countdownJob = null
        tearDownSocket()
    }

    fun isConnected(): Boolean = connected.get()

    /** deviceId Ed25519 (hex) para mostrar en emparejamiento. */
    fun deviceId(): String = identityStore.loadOrCreate().deviceId

    fun sendUserMessage(text: String, conversationId: String?) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return
        scope.launch {
            val item = QueuedChat(
                text = trimmed,
                idempotencyKey = IdempotencyKeys.newKey(),
                preferredSessionKey = conversationId,
            )
            if (connected.get() && sendChatLocked(item)) return@launch
            queueMutex.withLock { pendingQueue.addLast(item) }
        }
    }

    suspend fun loadHistory(limit: Int = 100): ChatHistoryResult? {
        val active = sessionProvider.activeSession.value ?: return null
        return loadHistory(sessionKey = active.sessionKey, agentId = active.agentId, limit = limit)
    }

    suspend fun loadHistory(
        sessionKey: String,
        agentId: String? = null,
        limit: Int = 100,
        offset: Int? = null,
    ): ChatHistoryResult? {
        val session = gatewaySession ?: return null
        val key = sessionKey.trim()
        if (key.isEmpty()) return null
        val params = ChatHistoryParams(
            sessionKey = key,
            agentId = agentId?.trim()?.takeIf { it.isNotEmpty() }
                ?: agentIdFromSessionKey(key),
            limit = limit,
            offset = offset,
        )
        return runCatching {
            session.rpc.requestDecoded<ChatHistoryResult>(
                method = RpcMethods.CHAT_HISTORY,
                params = GatewayJson.encodeToJsonElement(params),
                timeoutMs = activeConfig?.rpcTimeoutMs ?: GatewayConfig.DEFAULT_RPC_TIMEOUT_MS,
            )
        }.getOrNull()
    }

    /**
     * Crea una sesión de usuario vía `sessions.create` (sin key: el server mint
     * `agent:{agentId}:dashboard:{uuid}`) y la registra en [SessionProvider].
     *
     * @param activate si true, también la deja como sesión activa (UI de creación).
     */
    suspend fun createNamedSession(
        displayName: String,
        activate: Boolean = true,
    ): KnownSession? {
        val label = displayName.trim()
        if (label.isEmpty()) return null
        val session = gatewaySession ?: return null
        val active = sessionProvider.activeSession.value
        val agentId = active?.agentId
            ?: sessionProvider.knownSessions.value.firstOrNull { it.isMain }?.agentId
            ?: active?.sessionKey?.let { agentIdFromSessionKey(it) }
        val params = SessionsCreateParams(
            agentId = agentId,
            label = label,
        )
        val result = runCatching {
            session.rpc.requestDecoded<SessionsCreateResult>(
                method = RpcMethods.SESSIONS_CREATE,
                params = GatewayJson.encodeToJsonElement(params),
                timeoutMs = activeConfig?.rpcTimeoutMs ?: GatewayConfig.DEFAULT_RPC_TIMEOUT_MS,
            )
        }.getOrNull() ?: return null
        val key = result.key.trim()
        if (key.isEmpty()) return null
        val resolvedAgent = agentId ?: agentIdFromSessionKey(key)
        return if (activate) {
            sessionProvider.registerAndActivate(
                sessionKey = key,
                displayName = label,
                agentId = resolvedAgent,
            )
        } else {
            sessionProvider.registerWithoutActivating(
                sessionKey = key,
                displayName = label,
                agentId = resolvedAgent,
            )
        }
    }

    /**
     * Borrado remoto best-effort (tag v2026.7.1, scopes write):
     * 1) `sessions.patch` { archived: true }
     * 2) `sessions.delete` { archivedOnly: true, deleteTranscript: true }
     *
     * Fallos de red/RPC solo se registran en log; el borrado local no depende de esto.
     */
    suspend fun deleteSessionRemoteBestEffort(sessionKey: String, agentId: String?) {
        val key = sessionKey.trim()
        if (key.isEmpty()) return
        val session = gatewaySession
        if (session == null) {
            Log.w(TAG, "sessions.delete omitido (sin sesión gateway): $key")
            return
        }
        val timeout = activeConfig?.rpcTimeoutMs ?: GatewayConfig.DEFAULT_RPC_TIMEOUT_MS
        val agent = agentId?.trim()?.takeIf { it.isNotEmpty() } ?: agentIdFromSessionKey(key)
        runCatching {
            session.rpc.request(
                method = RpcMethods.SESSIONS_PATCH,
                params = GatewayJson.encodeToJsonElement(
                    SessionsPatchParams(key = key, agentId = agent, archived = true),
                ),
                timeoutMs = timeout,
            )
        }.onFailure { err ->
            Log.w(TAG, "sessions.patch archived falló key=$key: ${err.message}")
        }
        runCatching {
            session.rpc.request(
                method = RpcMethods.SESSIONS_DELETE,
                params = GatewayJson.encodeToJsonElement(
                    SessionsDeleteParams(
                        key = key,
                        agentId = agent,
                        deleteTranscript = true,
                        archivedOnly = true,
                    ),
                ),
                timeoutMs = timeout,
            )
        }.onFailure { err ->
            Log.w(TAG, "sessions.delete falló key=$key: ${err.message}")
        }
    }

    /** Descarta sends en cola locales cuya preferredSessionKey está en [sessionKeys]. */
    suspend fun dropPendingForSessions(sessionKeys: Collection<String>) {
        val keys = sessionKeys.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
        if (keys.isEmpty()) return
        queueMutex.withLock {
            val kept = pendingQueue.filterNot { item ->
                val preferred = item.preferredSessionKey?.trim()?.takeIf { it.isNotEmpty() }
                preferred != null && preferred in keys
            }
            pendingQueue.clear()
            pendingQueue.addAll(kept)
        }
    }

    private suspend fun runSessionLoop(config: GatewayConfig) {
        var attempt = 0
        while (true) {
            connected.set(false)
            if (forceReconnect.getAndSet(false)) {
                attempt = 0
            }
            if (attempt > 0) {
                val delayMs = backoffMs(attempt)
                val seconds = ((delayMs + 999) / 1000).toInt().coerceAtLeast(1)
                awaitBackoff(seconds)
                if (forceReconnect.getAndSet(false)) {
                    attempt = 0
                }
            } else {
                _connectionState.value = ConnectionState.Reconectando(0)
            }
            val closed = openAndAwaitClose(config)
            if (closed == CloseReason.PAIRING) {
                _connectionState.value = ConnectionState.Emparejando
                // Reintento lento mientras esperan aprobación.
                delay(5_000)
            }
            attempt += 1
        }
    }

    private suspend fun awaitBackoff(totalSeconds: Int) {
        countdownJob?.cancel()
        countdownJob = scope.launch {
            for (remaining in totalSeconds downTo 1) {
                if (forceReconnect.get()) break
                _connectionState.value = ConnectionState.Reconectando(remaining)
                delay(1_000)
            }
        }
        countdownJob?.join()
        countdownJob = null
    }

    private suspend fun openAndAwaitClose(config: GatewayConfig): CloseReason {
        val closed = Channel<CloseReason>(Channel.RENDEZVOUS)
        val pendingRpc = PendingRpc()
        val eventBus = GatewayEventBus()
        val socket = GatewaySocket(
            GatewaySocket.createDefaultClient(config.pingIntervalSeconds),
        )
        val factory = SignedConnectParamsFactory(
            identityStore = identityStore,
            tokenStore = tokenStore,
            config = config,
        )
        val hs = GatewayHandshake(
            socket = socket,
            connectParamsFactory = factory,
            scope = scope,
            config = config,
            pendingRpc = pendingRpc,
            eventBus = eventBus,
        )
        handshake = hs

        eventsJob?.cancel()
        eventsJob = scope.launch {
            eventBus.events.collect { event ->
                handleBusEvent(event)
            }
        }

        // Cierre del socket → desbloqueo del loop
        val watchJob = scope.launch {
            socket.state.collect { state ->
                when (state) {
                    is mx.ideass.personal.agent.gateway.transport.SocketState.Closed,
                    is mx.ideass.personal.agent.gateway.transport.SocketState.Failed,
                    -> {
                        connected.set(false)
                        closed.trySend(CloseReason.TRANSPORT)
                    }
                    else -> Unit
                }
            }
        }

        try {
            val hello = hs.connect(config.url)
            persistDeviceToken(config, hello)
            // Sesión activa: reutiliza persistida; no crea una nueva al reconectar.
            val active = sessionProvider.resolveForConnection(config, hello)
            gatewaySession = hs.openSession()
            connected.set(true)
            _connectionState.value = ConnectionState.Conectado
            flushPending(active)
            closed.receive()
            return CloseReason.TRANSPORT
        } catch (e: GatewayRpcException) {
            val code = readDetailCode(e)
            return if (code == ConnectErrorCodes.PAIRING_REQUIRED) {
                CloseReason.PAIRING
            } else {
                emitConnectError(code, e.message)
                CloseReason.TRANSPORT
            }
        } catch (_: TimeoutCancellationException) {
            emitConnectError("TIMEOUT", null)
            return CloseReason.TRANSPORT
        } catch (t: Throwable) {
            emitConnectError(code = null, fallback = t.message)
            return CloseReason.TRANSPORT
        } finally {
            connected.set(false)
            watchJob.cancel()
            eventsJob?.cancel()
            eventsJob = null
            gatewaySession = null
            handshake = null
            hs.disconnect()
        }
    }

    private suspend fun flushPending(active: ActiveSession) {
        queueMutex.withLock {
            while (pendingQueue.isNotEmpty() && connected.get()) {
                val next = pendingQueue.removeFirst()
                if (!sendChatLocked(next)) {
                    pendingQueue.addFirst(next)
                    break
                }
            }
        }
        // `active` documenta que flush ocurre tras resolver sesión (activa o preferred).
        check(active.sessionKey.isNotEmpty())
    }

    private suspend fun sendChatLocked(item: QueuedChat): Boolean {
        val session = gatewaySession ?: return false
        val target = resolveChatSendTarget(
            preferredSessionKey = item.preferredSessionKey,
            active = sessionProvider.activeSession.value,
            known = sessionProvider.knownSessions.value,
        ) ?: return false
        val params = ChatSendParams(
            sessionKey = target.sessionKey,
            agentId = target.agentId,
            message = item.text,
            idempotencyKey = item.idempotencyKey,
        )
        return try {
            session.rpc.request(
                method = RpcMethods.CHAT_SEND,
                params = GatewayJson.encodeToJsonElement(params),
                timeoutMs = activeConfig?.rpcTimeoutMs ?: GatewayConfig.DEFAULT_RPC_TIMEOUT_MS,
                retryOnTimeoutAttempts = activeConfig?.rpcTimeoutRetries ?: 1,
            )
            true
        } catch (_: Throwable) {
            false
        }
    }

    private suspend fun handleBusEvent(event: GatewayBusEvent) {
        when (event) {
            is GatewayBusEvent.Chat -> {
                _chatEvents.emit(event.payload)
                when (val chat = event.payload) {
                    is ChatEvent.Delta -> {
                        val snapshot = extractText(chat.message)
                        val useSnapshot = !snapshot.isNullOrEmpty()
                        val text = when {
                            useSnapshot -> snapshot!!
                            else -> chat.deltaText
                        }
                        if (text.isNotEmpty() || chat.replace == true || useSnapshot) {
                            _inbound.emit(
                                ChatInbound.AssistantDelta(
                                    text = text,
                                    replace = useSnapshot || chat.replace == true,
                                    sessionKey = chat.sessionKey,
                                    runId = chat.runId,
                                ),
                            )
                        }
                    }
                    is ChatEvent.Final -> {
                        extractText(chat.message)?.let { full ->
                            if (full.isNotEmpty()) {
                                _inbound.emit(
                                    ChatInbound.AssistantDelta(
                                        text = full,
                                        replace = true,
                                        sessionKey = chat.sessionKey,
                                        runId = chat.runId,
                                    ),
                                )
                            }
                        }
                        _inbound.emit(
                            ChatInbound.AssistantDone(
                                conversationId = chat.sessionKey,
                                runId = chat.runId,
                            ),
                        )
                    }
                    is ChatEvent.Error -> {
                        _inbound.emit(
                            ChatInbound.Error(
                                code = chat.errorKind?.name ?: "CHAT_ERROR",
                                message = chat.errorMessage ?: "error de chat",
                                sessionKey = chat.sessionKey,
                                runId = chat.runId,
                            ),
                        )
                    }
                    is ChatEvent.Aborted -> {
                        _inbound.emit(
                            ChatInbound.Error(
                                code = "ABORTED",
                                message = chat.errorMessage ?: "cancelado",
                                sessionKey = chat.sessionKey,
                                runId = chat.runId,
                            ),
                        )
                    }
                }
            }
            else -> Unit
        }
    }

    private fun persistDeviceToken(config: GatewayConfig, hello: HelloOk) {
        val token = hello.auth.deviceToken?.trim()?.takeIf { it.isNotEmpty() } ?: return
        val identity = identityStore.loadOrCreate()
        tokenStore.saveToken(
            gatewayId = config.gatewayId(),
            deviceId = identity.deviceId,
            role = hello.auth.role.ifBlank { GatewayRoles.OPERATOR },
            token = token,
            scopes = hello.auth.scopes,
        )
    }

    private fun emitConnectError(code: String?, fallback: String?) {
        _connectionState.value = ConnectionState.Error(
            message = humanizeConnectError(code, fallback),
            code = code,
        )
    }

    private fun tearDownSocket() {
        connected.set(false)
        handshake?.disconnect()
        handshake = null
        gatewaySession = null
    }

    private fun readDetailCode(error: GatewayRpcException): String? {
        val details = error.error.details ?: return null
        val obj = details as? JsonObject ?: return null
        return obj["code"]?.jsonPrimitive?.contentOrNull
            ?: obj["detailCode"]?.jsonPrimitive?.contentOrNull
    }

    private fun backoffMs(attempt: Int): Long {
        val exp = min(30_000.0, 1_000.0 * 2.0.pow((attempt - 1).coerceAtLeast(0)))
        return exp.toLong().coerceIn(1_000L, 30_000L)
    }

    private data class QueuedChat(
        val text: String,
        val idempotencyKey: String,
        val preferredSessionKey: String?,
    )

    private enum class CloseReason { TRANSPORT, PAIRING }

    private fun extractText(message: JsonElement?): String? = JsonMessageText.extract(message)

    companion object {
        private const val TAG = "GatewayClient"
    }
}

/**
 * Destino de chat.send: preferredSessionKey si viene, si no la activa.
 * No muta [SessionProvider.activeSession].
 */
internal data class ChatSendTarget(
    val sessionKey: String,
    val agentId: String?,
)

internal fun resolveChatSendTarget(
    preferredSessionKey: String?,
    active: ActiveSession?,
    known: List<KnownSession>,
): ChatSendTarget? {
    val preferred = preferredSessionKey?.trim()?.takeIf { it.isNotEmpty() }
    if (preferred != null) {
        val fromKnown = known.find { it.sessionKey == preferred }
        return ChatSendTarget(
            sessionKey = preferred,
            agentId = fromKnown?.agentId
                ?: agentIdFromSessionKey(preferred)
                ?: active?.agentId,
        )
    }
    val activeKey = active?.sessionKey?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    return ChatSendTarget(sessionKey = activeKey, agentId = active?.agentId)
}

/** Fuente de configuración Gateway (preferencias / DI de tests). */
interface GatewayConfigSource {
    val config: kotlinx.coroutines.flow.Flow<GatewayConfig?>
}
