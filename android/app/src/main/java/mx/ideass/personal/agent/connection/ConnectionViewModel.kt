package mx.ideass.personal.agent.connection

import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import mx.ideass.personal.agent.app.AppPreferences
import mx.ideass.personal.agent.app.ConnectionBackend
import mx.ideass.personal.agent.gateway.client.GatewayClient
import mx.ideass.personal.agent.gateway.config.GatewayConfig
import mx.ideass.personal.agent.gateway.session.SessionProvider
import mx.ideass.personal.agent.network.ChatConnection
import mx.ideass.personal.agent.network.ConnectionState
import mx.ideass.personal.agent.service.ConnectionHealth
import mx.ideass.personal.agent.service.ConnectionHealthTracker
import javax.inject.Inject

data class ConnectionUiState(
    val backend: ConnectionBackend = ConnectionBackend.GATEWAY,
    val address: String = "wss://127.0.0.1:18789",
    val token: String = "",
    val bootstrapToken: String = "",
    val agentId: String = "",
    val sessionKey: String = "",
    val deviceName: String = Build.MODEL.orEmpty().ifBlank { "Android" },
    val tokenVisible: Boolean = false,
    val testing: Boolean = false,
    val resultMessage: String? = null,
    val resultOk: Boolean = false,
    /** Emparejamiento pendiente (acción en el servidor), distinto de error de credenciales. */
    val pairingPending: Boolean = false,
    val pairingDeviceIdShort: String? = null,
    val connected: Boolean = false,
    val hasSavedConfig: Boolean = false,
    /** Selector Hub/Gateway solo en builds debuggables (toggle oculto). */
    val debugBuild: Boolean = false,
    val showBackendSelector: Boolean = false,
)

@HiltViewModel
class ConnectionViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val preferences: AppPreferences,
    private val chatConnection: ChatConnection,
    private val gatewayClient: GatewayClient,
    private val sessionProvider: SessionProvider,
    healthTracker: ConnectionHealthTracker,
) : ViewModel() {

    private val _ui = MutableStateFlow(
        ConnectionUiState(debugBuild = isDebuggable(context)),
    )
    val ui: StateFlow<ConnectionUiState> = _ui.asStateFlow()

    val health: StateFlow<ConnectionHealth> = healthTracker.health
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ConnectionHealth())

    private var connectJob: Job? = null

    init {
        viewModelScope.launch {
            val backend = preferences.getConnectionBackend()
            when (backend) {
                ConnectionBackend.GATEWAY -> {
                    _ui.update {
                        it.copy(
                            backend = ConnectionBackend.GATEWAY,
                            address = preferences.getGatewayUrl()
                                ?: "wss://127.0.0.1:18789",
                            token = preferences.getGatewayToken().orEmpty(),
                            agentId = preferences.getGatewayAgentId().orEmpty(),
                            sessionKey = preferences.getGatewaySessionKey().orEmpty(),
                            deviceName = preferences.getHubConfig()?.deviceName
                                ?.ifBlank { it.deviceName } ?: it.deviceName,
                            hasSavedConfig = preferences.getGatewayUrl() != null,
                        )
                    }
                }
                ConnectionBackend.HUB -> {
                    preferences.getHubConfig()?.let { config ->
                        _ui.update {
                            it.copy(
                                backend = ConnectionBackend.HUB,
                                address = config.address,
                                token = config.token,
                                deviceName = config.deviceName.ifBlank { it.deviceName },
                                hasSavedConfig = true,
                            )
                        }
                    } ?: _ui.update {
                        it.copy(
                            backend = ConnectionBackend.HUB,
                            address = "ws://10.0.2.2:8787",
                        )
                    }
                }
            }
        }
    }

    fun onBackendChange(backend: ConnectionBackend) {
        _ui.update {
            when (backend) {
                ConnectionBackend.GATEWAY -> it.copy(
                    backend = backend,
                    address = if (it.backend != backend) "wss://127.0.0.1:18789" else it.address,
                    resultMessage = null,
                    pairingPending = false,
                )
                ConnectionBackend.HUB -> it.copy(
                    backend = backend,
                    address = if (it.backend != backend) "ws://10.0.2.2:8787" else it.address,
                    resultMessage = null,
                    pairingPending = false,
                )
            }
        }
    }

    fun toggleBackendSelector() {
        if (!_ui.value.debugBuild) return
        _ui.update { it.copy(showBackendSelector = !it.showBackendSelector) }
    }

    fun onAddressChange(value: String) = _ui.update { it.copy(address = value, resultMessage = null) }
    fun onTokenChange(value: String) = _ui.update { it.copy(token = value, resultMessage = null) }
    fun onBootstrapChange(value: String) =
        _ui.update { it.copy(bootstrapToken = value, resultMessage = null) }
    fun onAgentIdChange(value: String) = _ui.update { it.copy(agentId = value) }
    fun onSessionKeyChange(value: String) = _ui.update { it.copy(sessionKey = value) }
    fun onDeviceNameChange(value: String) = _ui.update { it.copy(deviceName = value) }
    fun toggleTokenVisible() = _ui.update { it.copy(tokenVisible = !it.tokenVisible) }

    fun cancelConnect() {
        connectJob?.cancel()
        connectJob = null
        _ui.update {
            it.copy(
                testing = false,
                resultOk = false,
                connected = false,
                pairingPending = false,
                resultMessage = "Conexión cancelada",
            )
        }
    }

    fun testAndConnect(onSuccess: () -> Unit) {
        val state = _ui.value
        if (state.address.isBlank()) {
            _ui.update {
                it.copy(resultOk = false, resultMessage = "La dirección es obligatoria")
            }
            return
        }
        if (state.backend == ConnectionBackend.HUB && state.token.isBlank()) {
            _ui.update {
                it.copy(resultOk = false, resultMessage = "Dirección y token son obligatorios")
            }
            return
        }
        if (state.backend == ConnectionBackend.GATEWAY &&
            state.token.isBlank() &&
            state.bootstrapToken.isBlank()
        ) {
            _ui.update {
                it.copy(
                    resultOk = false,
                    resultMessage = "Token o setup-code (bootstrap) son obligatorios",
                )
            }
            return
        }
        connectJob?.cancel()
        connectJob = viewModelScope.launch {
            _ui.update {
                it.copy(
                    testing = true,
                    resultMessage = "Conectando…",
                    resultOk = false,
                    connected = false,
                    pairingPending = false,
                    pairingDeviceIdShort = null,
                )
            }
            try {
                when (state.backend) {
                    ConnectionBackend.HUB -> connectHub(state, onSuccess)
                    ConnectionBackend.GATEWAY -> connectGateway(state, onSuccess)
                }
            } catch (_: CancellationException) {
                _ui.update {
                    it.copy(
                        testing = false,
                        resultOk = false,
                        connected = false,
                        pairingPending = false,
                        resultMessage = "Conexión cancelada",
                    )
                }
            } finally {
                connectJob = null
            }
        }
    }

    private suspend fun connectHub(state: ConnectionUiState, onSuccess: () -> Unit) {
        val result = chatConnection.probe(state.address, state.token, state.deviceName)
        result.fold(
            onSuccess = { latencyMs ->
                preferences.saveHubConfig(state.address, state.token, state.deviceName)
                _ui.update {
                    it.copy(
                        testing = false,
                        resultOk = true,
                        connected = true,
                        hasSavedConfig = true,
                        pairingPending = false,
                        resultMessage = "Hub encontrado · latencia ${latencyMs} ms",
                    )
                }
                onSuccess()
            },
            onFailure = { error ->
                _ui.update {
                    it.copy(
                        testing = false,
                        resultOk = false,
                        connected = false,
                        pairingPending = false,
                        resultMessage = error.message ?: "Error de conexión",
                    )
                }
            },
        )
    }

    private suspend fun connectGateway(state: ConnectionUiState, onSuccess: () -> Unit) {
        preferences.saveGatewayConfig(
            url = state.address,
            token = state.token,
            deviceName = state.deviceName,
            bootstrapToken = state.bootstrapToken,
            agentId = state.agentId,
            sessionKey = state.sessionKey,
        )
        if (state.sessionKey.isNotBlank()) {
            sessionProvider.setActive(state.sessionKey, state.agentId.ifBlank { null })
        }
        _ui.update { it.copy(hasSavedConfig = true) }

        chatConnection.start()
        chatConnection.reconnectNow()

        val deviceIdShort = shortDeviceId(gatewayClient.deviceId())
        val handshakeBudgetMs =
            GatewayConfig.DEFAULT_CONNECT_CHALLENGE_TIMEOUT_MS +
                GatewayConfig.DEFAULT_CONNECT_REQUEST_TIMEOUT_MS +
                SOCKET_OPEN_BUFFER_MS

        val first = withTimeoutOrNull(handshakeBudgetMs) {
            // Ignora un Conectado residual de la sesión anterior tras reconnectNow.
            awaitGatewayProgress(
                deviceIdShort = deviceIdShort,
                stopOnPairing = true,
                skipStaleConnected = true,
            )
        }

        when (first) {
            is ConnectAttemptUi.Connected -> {
                markConnectedAndNavigate(onSuccess)
                return
            }
            is ConnectAttemptUi.Failed -> {
                markFailed(first.message)
                return
            }
            is ConnectAttemptUi.Pairing -> {
                _ui.update {
                    it.copy(
                        testing = true,
                        resultOk = false,
                        pairingPending = true,
                        pairingDeviceIdShort = first.deviceIdShort ?: deviceIdShort,
                        resultMessage = pairingMessage(first.deviceIdShort ?: deviceIdShort),
                    )
                }
                when (
                    val afterPairing = awaitGatewayProgress(
                        deviceIdShort = deviceIdShort,
                        stopOnPairing = false,
                        skipStaleConnected = false,
                    )
                ) {
                    is ConnectAttemptUi.Connected -> markConnectedAndNavigate(onSuccess)
                    is ConnectAttemptUi.Failed -> markFailed(afterPairing.message)
                    else -> markFailed("Sin respuesta del Gateway")
                }
                return
            }
            is ConnectAttemptUi.Connecting, null -> {
                markFailed("Sin respuesta del Gateway")
            }
        }
    }

    /**
     * Observa [ChatConnection.connectionState] hasta un terminal (conectado/error)
     * o, si [stopOnPairing], hasta Emparejando.
     */
    private suspend fun awaitGatewayProgress(
        deviceIdShort: String,
        stopOnPairing: Boolean,
        skipStaleConnected: Boolean,
    ): ConnectAttemptUi {
        val baseline = chatConnection.connectionState.value
        val waitForChange = skipStaleConnected && (
            baseline is ConnectionState.Conectado ||
                baseline is ConnectionState.Error ||
                baseline is ConnectionState.Emparejando
            )
        var passedBaseline = !waitForChange

        return chatConnection.connectionState.mapNotNull { state ->
            if (!passedBaseline) {
                if (state == baseline) return@mapNotNull null
                passedBaseline = true
            }
            when (val mapped = mapConnectionStateToAttempt(state, deviceIdShort)) {
                is ConnectAttemptUi.Connected -> mapped
                is ConnectAttemptUi.Failed -> mapped
                is ConnectAttemptUi.Pairing -> {
                    _ui.update {
                        it.copy(
                            testing = true,
                            resultOk = false,
                            pairingPending = true,
                            pairingDeviceIdShort = mapped.deviceIdShort ?: deviceIdShort,
                            resultMessage = pairingMessage(mapped.deviceIdShort ?: deviceIdShort),
                        )
                    }
                    if (stopOnPairing) mapped else null
                }
                is ConnectAttemptUi.Connecting -> {
                    if (!_ui.value.pairingPending) {
                        _ui.update {
                            it.copy(
                                testing = true,
                                resultOk = false,
                                resultMessage = "Conectando…",
                            )
                        }
                    }
                    null
                }
            }
        }.first()
    }

    private fun markConnectedAndNavigate(onSuccess: () -> Unit) {
        _ui.update {
            it.copy(
                testing = false,
                resultOk = true,
                connected = true,
                pairingPending = false,
                hasSavedConfig = true,
                resultMessage = "Conectado",
            )
        }
        onSuccess()
    }

    private fun markFailed(message: String) {
        _ui.update {
            it.copy(
                testing = false,
                resultOk = false,
                connected = false,
                pairingPending = false,
                resultMessage = message,
            )
        }
    }

    private fun pairingMessage(deviceIdShort: String): String =
        "Emparejando… Aprueba este dispositivo en el servidor " +
            "(openclaw devices approve · id $deviceIdShort)"

    private companion object {
        const val SOCKET_OPEN_BUFFER_MS = 5_000L

        fun isDebuggable(context: Context): Boolean =
            (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    }
}
