package mx.ideass.personal.agent.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import mx.ideass.personal.agent.gateway.client.GatewayClient
import mx.ideass.personal.agent.gateway.session.KnownSession
import mx.ideass.personal.agent.gateway.session.SessionProvider
import mx.ideass.personal.agent.gateway.session.agentIdFromSessionKey
import mx.ideass.personal.agent.network.ConnectionState
import javax.inject.Inject

data class SessionRowUi(
    val sessionKey: String,
    val displayName: String,
    val isMain: Boolean,
    val isActive: Boolean,
)

data class SessionsUiState(
    val sessions: List<SessionRowUi> = emptyList(),
    val draftName: String = "",
    val showCreate: Boolean = false,
    val creating: Boolean = false,
    val errorMessage: String? = null,
    val connected: Boolean = false,
)

/** Proyecta el catálogo + activa a filas de UI. */
fun buildSessionRows(
    known: List<KnownSession>,
    activeKey: String?,
): List<SessionRowUi> {
    val active = activeKey?.trim()?.takeIf { it.isNotEmpty() }
    return known.map { session ->
        SessionRowUi(
            sessionKey = session.sessionKey,
            displayName = session.displayName,
            isMain = session.isMain,
            isActive = session.sessionKey == active,
        )
    }
}

@HiltViewModel
class SessionsViewModel @Inject constructor(
    private val sessionProvider: SessionProvider,
    private val gatewayClient: GatewayClient,
) : ViewModel() {

    private val _draftName = MutableStateFlow("")
    private val _showCreate = MutableStateFlow(false)
    private val _creating = MutableStateFlow(false)
    private val _error = MutableStateFlow<String?>(null)

    private data class FormState(
        val draftName: String,
        val showCreate: Boolean,
        val creating: Boolean,
        val errorMessage: String?,
    )

    val ui: StateFlow<SessionsUiState> = combine(
        combine(
            sessionProvider.knownSessions,
            sessionProvider.activeSession,
            gatewayClient.connectionState,
        ) { known, active, connection ->
            Triple(known, active, connection)
        },
        combine(_draftName, _showCreate, _creating, _error) { draft, show, creating, error ->
            FormState(draft, show, creating, error)
        },
    ) { catalog, form ->
        val (known, active, connection) = catalog
        SessionsUiState(
            sessions = buildSessionRows(known, active?.sessionKey),
            draftName = form.draftName,
            showCreate = form.showCreate,
            creating = form.creating,
            errorMessage = form.errorMessage,
            connected = connection is ConnectionState.Conectado && gatewayClient.isConnected(),
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SessionsUiState())

    fun onDraftNameChange(value: String) = _draftName.update { value }

    fun openCreate() {
        _error.value = null
        _draftName.value = ""
        _showCreate.value = true
    }

    fun dismissCreate() {
        _showCreate.value = false
        _draftName.value = ""
        _error.value = null
    }

    fun select(sessionKey: String) {
        val key = sessionKey.trim()
        if (key.isEmpty()) return
        if (sessionProvider.activeSession.value?.sessionKey == key) return
        viewModelScope.launch {
            val known = sessionProvider.knownSessions.value.find { it.sessionKey == key }
            val agentId = known?.agentId ?: agentIdFromSessionKey(key)
            sessionProvider.setActive(key, agentId)
        }
    }

    fun create() {
        val name = _draftName.value.trim()
        if (name.isEmpty()) {
            _error.value = "Escribe un nombre para la sesión"
            return
        }
        if (!gatewayClient.isConnected()) {
            _error.value = "Conéctate al agente para crear una sesión"
            return
        }
        viewModelScope.launch {
            _creating.value = true
            _error.value = null
            val created = gatewayClient.createNamedSession(name)
            _creating.value = false
            if (created == null) {
                _error.value = "No se pudo crear la sesión. Inténtalo de nuevo."
                return@launch
            }
            dismissCreate()
        }
    }
}
