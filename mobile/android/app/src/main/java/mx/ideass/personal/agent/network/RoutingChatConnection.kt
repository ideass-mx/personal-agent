package mx.ideass.personal.agent.network

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import mx.ideass.personal.agent.app.AppPreferences
import mx.ideass.personal.agent.app.ConnectionBackend
import mx.ideass.personal.agent.gateway.client.GatewayChatConnection
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Enruta al Hub o al Gateway Gateway legacy según preferencias.
 * Default / first paint: Hub (PHASE 37). Gateway legacy solo si backend = GATEWAY.
 * La UI solo conoce [ChatConnection].
 */
fun chatConnectionForBackend(
    backend: ConnectionBackend,
    hub: ChatConnection,
    gateway: ChatConnection,
): ChatConnection =
    if (backend == ConnectionBackend.GATEWAY) gateway else hub

@Singleton
class RoutingChatConnection @Inject constructor(
    private val preferences: AppPreferences,
    private val hub: HubChatConnection,
    private val gateway: GatewayChatConnection,
) : ChatConnection {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _connectionState =
        MutableStateFlow<ConnectionState>(ConnectionState.SinConfigurar)
    override val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _inbound = MutableSharedFlow<ChatInbound>(
        extraBufferCapacity = 64,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    override val inbound: SharedFlow<ChatInbound> = _inbound.asSharedFlow()

    @Volatile
    private var active: ChatConnection = hub
    private var bridgeJobs: List<Job> = emptyList()
    private var started = false

    override fun start() {
        if (started) return
        started = true
        scope.launch {
            preferences.connectionBackend
                .distinctUntilChanged()
                .collectLatest { backend ->
                    val next = chatConnectionForBackend(backend, hub, gateway)
                    switchTo(next)
                    next.start()
                }
        }
    }

    override fun reconnectNow() = active.reconnectNow()

    override fun sendUserMessage(text: String, conversationId: String?) =
        active.sendUserMessage(text, conversationId)

    override fun sendConfirmResponse(confirmationId: String, approved: Boolean) =
        active.sendConfirmResponse(confirmationId, approved)

    override fun isConnected(): Boolean = active.isConnected()

    /**
     * Probe de auth Hub (dirección + token). No usa el adaptador Gateway legacy:
     * el flujo de Connection Hub lo invoca antes de persistir prefs.
     */
    override suspend fun probe(
        address: String,
        token: String,
        deviceName: String,
    ): Result<Long> = hub.probe(address, token, deviceName)

    override suspend fun pairFromQr(
        endpoint: String,
        pairingSessionId: String,
        pairingSecret: String,
        deviceName: String,
    ): Result<String> =
        hub.pairFromQr(endpoint, pairingSessionId, pairingSecret, deviceName)

    private fun switchTo(next: ChatConnection) {
        bridgeJobs.forEach { it.cancel() }
        active = next
        bridgeJobs = listOf(
            scope.launch {
                next.connectionState.collect { _connectionState.value = it }
            },
            scope.launch {
                next.inbound.collect { _inbound.emit(it) }
            },
        )
    }
}
