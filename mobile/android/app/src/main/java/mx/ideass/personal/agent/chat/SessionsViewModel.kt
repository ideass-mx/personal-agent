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
import mx.ideass.personal.agent.app.AppPreferences
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
    val selected: Boolean = false,
    /** False para la principal: no entra en multi-selección ni ofrece borrar. */
    val selectable: Boolean = true,
)

data class SessionsUiState(
    val sessions: List<SessionRowUi> = emptyList(),
    val draftName: String = "",
    val showCreate: Boolean = false,
    val creating: Boolean = false,
    val errorMessage: String? = null,
    val connected: Boolean = false,
    val selectionMode: Boolean = false,
    val selectedCount: Int = 0,
    /** Keys pendientes de confirmación de borrado (vacío = diálogo cerrado). */
    val pendingDeleteKeys: Set<String> = emptySet(),
    val pendingDeleteNames: List<String> = emptyList(),
    val deleting: Boolean = false,
)

/** Proyecta el catálogo + activa (+ selección) a filas de UI. */
fun buildSessionRows(
    known: List<KnownSession>,
    activeKey: String?,
    selectedKeys: Set<String> = emptySet(),
): List<SessionRowUi> {
    val active = activeKey?.trim()?.takeIf { it.isNotEmpty() }
    val selected = selectedKeys.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
    return known.map { session ->
        SessionRowUi(
            sessionKey = session.sessionKey,
            displayName = session.displayName,
            isMain = session.isMain,
            isActive = session.sessionKey == active,
            selected = !session.isMain && session.sessionKey in selected,
            selectable = !session.isMain,
        )
    }
}

/** Solo keys no-principales presentes en el catálogo. */
fun filterDeletableKeys(
    known: List<KnownSession>,
    keys: Collection<String>,
): Set<String> {
    val requested = keys.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
    return known
        .filter { !it.isMain && it.sessionKey in requested }
        .map { it.sessionKey }
        .toSet()
}

/** Todas las keys borrables del catálogo (la principal nunca entra). */
fun allDeletableKeys(known: List<KnownSession>): Set<String> =
    known.filter { !it.isMain }.map { it.sessionKey }.toSet()

@HiltViewModel
class SessionsViewModel @Inject constructor(
    private val sessionProvider: SessionProvider,
    private val gatewayClient: GatewayClient,
    private val chatStore: ChatStore,
    private val preferences: AppPreferences,
) : ViewModel() {

    private val _draftName = MutableStateFlow("")
    private val _showCreate = MutableStateFlow(false)
    private val _creating = MutableStateFlow(false)
    private val _error = MutableStateFlow<String?>(null)
    private val _selectionMode = MutableStateFlow(false)
    private val _selectedKeys = MutableStateFlow<Set<String>>(emptySet())
    private val _pendingDeleteKeys = MutableStateFlow<Set<String>>(emptySet())
    private val _pendingDeleteNames = MutableStateFlow<List<String>>(emptyList())
    private val _deleting = MutableStateFlow(false)

    private data class FormState(
        val draftName: String,
        val showCreate: Boolean,
        val creating: Boolean,
        val errorMessage: String?,
        val selectionMode: Boolean,
        val selectedKeys: Set<String>,
        val pendingDeleteKeys: Set<String>,
        val pendingDeleteNames: List<String>,
        val deleting: Boolean,
    )

    val ui: StateFlow<SessionsUiState> = combine(
        combine(
            sessionProvider.knownSessions,
            sessionProvider.activeSession,
            gatewayClient.connectionState,
        ) { known, active, connection ->
            Triple(known, active, connection)
        },
        combine(
            combine(_draftName, _showCreate, _creating, _error) { draft, show, creating, error ->
                FormSlice(draft, show, creating, error)
            },
            combine(
                _selectionMode,
                _selectedKeys,
                combine(_pendingDeleteKeys, _pendingDeleteNames, _deleting) { keys, names, deleting ->
                    Triple(keys, names, deleting)
                },
            ) { selection, selected, pending ->
                SelectionSlice(
                    selectionMode = selection,
                    selectedKeys = selected,
                    pendingDeleteKeys = pending.first,
                    pendingDeleteNames = pending.second,
                    deleting = pending.third,
                )
            },
        ) { form, selection ->
            FormState(
                draftName = form.draftName,
                showCreate = form.showCreate,
                creating = form.creating,
                errorMessage = form.errorMessage,
                selectionMode = selection.selectionMode,
                selectedKeys = selection.selectedKeys,
                pendingDeleteKeys = selection.pendingDeleteKeys,
                pendingDeleteNames = selection.pendingDeleteNames,
                deleting = selection.deleting,
            )
        },
    ) { catalog, form ->
        val (known, active, connection) = catalog
        val selected = if (form.selectionMode) {
            filterDeletableKeys(known, form.selectedKeys)
        } else {
            emptySet()
        }
        SessionsUiState(
            sessions = buildSessionRows(known, active?.sessionKey, selected),
            draftName = form.draftName,
            showCreate = form.showCreate && !form.selectionMode,
            creating = form.creating,
            errorMessage = form.errorMessage,
            connected = connection is ConnectionState.Conectado && gatewayClient.isConnected(),
            selectionMode = form.selectionMode,
            selectedCount = selected.size,
            pendingDeleteKeys = form.pendingDeleteKeys,
            pendingDeleteNames = form.pendingDeleteNames,
            deleting = form.deleting,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SessionsUiState())

    private data class FormSlice(
        val draftName: String,
        val showCreate: Boolean,
        val creating: Boolean,
        val errorMessage: String?,
    )

    private data class SelectionSlice(
        val selectionMode: Boolean,
        val selectedKeys: Set<String>,
        val pendingDeleteKeys: Set<String>,
        val pendingDeleteNames: List<String>,
        val deleting: Boolean,
    )

    fun onDraftNameChange(value: String) = _draftName.update { value }

    fun openCreate() {
        if (_selectionMode.value) return
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
        if (_selectionMode.value) {
            toggleSelection(sessionKey)
            return
        }
        val key = sessionKey.trim()
        if (key.isEmpty()) return
        if (sessionProvider.activeSession.value?.sessionKey == key) return
        viewModelScope.launch {
            val known = sessionProvider.knownSessions.value.find { it.sessionKey == key }
            val agentId = known?.agentId ?: agentIdFromSessionKey(key)
            sessionProvider.setActive(key, agentId)
        }
    }

    /** Long-press: entra a modo selección con esa fila (la principal no es seleccionable). */
    fun enterSelection(sessionKey: String) {
        val key = sessionKey.trim()
        if (key.isEmpty()) return
        val known = sessionProvider.knownSessions.value.find { it.sessionKey == key } ?: return
        if (known.isMain) return
        dismissCreate()
        _selectionMode.value = true
        _selectedKeys.value = setOf(key)
        _error.value = null
    }

    fun toggleSelection(sessionKey: String) {
        val key = sessionKey.trim()
        if (key.isEmpty()) return
        val known = sessionProvider.knownSessions.value.find { it.sessionKey == key } ?: return
        if (known.isMain) return
        if (!_selectionMode.value) {
            enterSelection(key)
            return
        }
        _selectedKeys.update { current ->
            if (key in current) current - key else current + key
        }
    }

    fun selectAllDeletable() {
        if (!_selectionMode.value) {
            _selectionMode.value = true
        }
        _selectedKeys.value = allDeletableKeys(sessionProvider.knownSessions.value)
    }

    fun exitSelection() {
        _selectionMode.value = false
        _selectedKeys.value = emptySet()
        _pendingDeleteKeys.value = emptySet()
        _pendingDeleteNames.value = emptyList()
    }

    /** Abre el diálogo de confirmación para las seleccionadas (o [sessionKeys] sueltas). */
    fun requestDelete(sessionKeys: Collection<String>? = null) {
        val known = sessionProvider.knownSessions.value
        val keys = filterDeletableKeys(
            known,
            sessionKeys ?: _selectedKeys.value,
        )
        if (keys.isEmpty()) return
        _pendingDeleteKeys.value = keys
        _pendingDeleteNames.value = known
            .filter { it.sessionKey in keys }
            .map { it.displayName }
    }

    fun dismissDeleteConfirm() {
        if (_deleting.value) return
        _pendingDeleteKeys.value = emptySet()
        _pendingDeleteNames.value = emptyList()
    }

    fun confirmDelete() {
        val known = sessionProvider.knownSessions.value
        val keys = filterDeletableKeys(known, _pendingDeleteKeys.value)
        if (keys.isEmpty()) {
            _pendingDeleteKeys.value = emptySet()
            _pendingDeleteNames.value = emptyList()
            return
        }
        val agentsByKey = known.associate { it.sessionKey to it.agentId }
        viewModelScope.launch {
            _deleting.value = true
            _error.value = null
            // Local primero: catálogo (reasigna activa si aplica) → mensajes → prefs → cola.
            sessionProvider.removeSessions(keys)
            chatStore.removeSessions(keys)
            preferences.clearQuickSessionKeyIfMatching(keys)
            gatewayClient.dropPendingForSessions(keys)
            // Remoto best-effort (archive → delete); no bloquea el resultado local.
            for (key in keys) {
                gatewayClient.deleteSessionRemoteBestEffort(
                    sessionKey = key,
                    agentId = agentsByKey[key],
                )
            }
            _deleting.value = false
            _pendingDeleteKeys.value = emptySet()
            _pendingDeleteNames.value = emptyList()
            exitSelection()
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
