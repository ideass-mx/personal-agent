package mx.ideass.personal.agent.connection

import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import mx.ideass.personal.agent.app.AppPreferences
import mx.ideass.personal.agent.network.HubClient
import mx.ideass.personal.agent.service.ConnectionHealth
import mx.ideass.personal.agent.service.ConnectionHealthTracker
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ConnectionUiState(
    val address: String = "ws://10.0.2.2:8787",
    val token: String = "",
    val deviceName: String = Build.MODEL.orEmpty().ifBlank { "Android" },
    val tokenVisible: Boolean = false,
    val testing: Boolean = false,
    val resultMessage: String? = null,
    val resultOk: Boolean = false,
    val connected: Boolean = false,
    val hasSavedConfig: Boolean = false,
)

@HiltViewModel
class ConnectionViewModel @Inject constructor(
    private val preferences: AppPreferences,
    private val hubClient: HubClient,
    healthTracker: ConnectionHealthTracker,
) : ViewModel() {

    private val _ui = MutableStateFlow(ConnectionUiState())
    val ui: StateFlow<ConnectionUiState> = _ui.asStateFlow()

    val health: StateFlow<ConnectionHealth> = healthTracker.health
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ConnectionHealth())

    init {
        viewModelScope.launch {
            preferences.getHubConfig()?.let { config ->
                _ui.update {
                    it.copy(
                        address = config.address,
                        token = config.token,
                        deviceName = config.deviceName.ifBlank { it.deviceName },
                        hasSavedConfig = true,
                    )
                }
            }
        }
    }

    fun onAddressChange(value: String) = _ui.update { it.copy(address = value, resultMessage = null) }
    fun onTokenChange(value: String) = _ui.update { it.copy(token = value, resultMessage = null) }
    fun onDeviceNameChange(value: String) = _ui.update { it.copy(deviceName = value) }
    fun toggleTokenVisible() = _ui.update { it.copy(tokenVisible = !it.tokenVisible) }

    fun testAndConnect(onSuccess: () -> Unit) {
        val state = _ui.value
        if (state.address.isBlank() || state.token.isBlank()) {
            _ui.update {
                it.copy(resultOk = false, resultMessage = "Dirección y token son obligatorios")
            }
            return
        }
        viewModelScope.launch {
            _ui.update { it.copy(testing = true, resultMessage = null, connected = false) }
            val result = hubClient.probe(state.address, state.token, state.deviceName)
            result.fold(
                onSuccess = { latencyMs ->
                    preferences.saveHubConfig(state.address, state.token, state.deviceName)
                    // El service ya observa hubConfig y reconecta solo.
                    _ui.update {
                        it.copy(
                            testing = false,
                            resultOk = true,
                            connected = true,
                            hasSavedConfig = true,
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
                            resultMessage = error.message ?: "Error de conexión",
                        )
                    }
                },
            )
        }
    }
}
