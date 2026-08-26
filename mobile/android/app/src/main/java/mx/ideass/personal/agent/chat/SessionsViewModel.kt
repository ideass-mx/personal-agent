package mx.ideass.personal.agent.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import mx.ideass.personal.agent.app.AppPreferences
import mx.ideass.personal.agent.app.ConnectionBackend
import mx.ideass.personal.agent.gateway.client.GatewayClient
import mx.ideass.personal.agent.gateway.session.KnownSession
import mx.ideass.personal.agent.gateway.session.SessionProvider
import mx.ideass.personal.agent.gateway.session.agentIdFromSessionKey
import mx.ideass.personal.agent.network.ConnectionState
import mx.ideass.personal.agent.workspace.ConversationRecordDto
import mx.ideass.personal.agent.workspace.HubConversationCreateRequest
import mx.ideass.personal.agent.workspace.WorkspaceConversationsCoordinator
import mx.ideass.personal.agent.workspace.WorkspaceConversationsUiState
import mx.ideass.personal.agent.workspace.WorkspaceDto
import mx.ideass.personal.agent.workspace.WorkspaceGateway
import mx.ideass.personal.agent.workspace.conversationListTitle
import mx.ideass.personal.agent.workspace.executeHubConversationCreate
import mx.ideass.personal.agent.workspace.hubCasualConversation
import mx.ideass.personal.agent.workspace.hubConversationInWorkspace
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
    val canCreate: Boolean = false,
    val hubConversationCreate: Boolean = false,
    val createWorkspaces: List<WorkspaceDto> = emptyList(),
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
    private val workspaceGateway: WorkspaceGateway,
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
    private val _hubConversationCreate = MutableStateFlow(false)
    private val _hubHttpReady = MutableStateFlow(false)
    private val _createWorkspaces = MutableStateFlow<List<WorkspaceDto>>(emptyList())
    private val listingCoordinator = WorkspaceConversationsCoordinator(workspaceGateway)
    private val _workspaceListing = MutableStateFlow(listingCoordinator.state)
    val workspaceListing: StateFlow<WorkspaceConversationsUiState> = _workspaceListing.asStateFlow()

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
        val hubConversationCreate: Boolean,
        val hubHttpReady: Boolean,
        val createWorkspaces: List<WorkspaceDto>,
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
                combine(_hubConversationCreate, _hubHttpReady, _createWorkspaces) { hub, ready, workspaces ->
                    Triple(hub, ready, workspaces)
                },
            ) { selection, selected, pending, hub ->
                SelectionSlice(
                    selectionMode = selection,
                    selectedKeys = selected,
                    pendingDeleteKeys = pending.first,
                    pendingDeleteNames = pending.second,
                    deleting = pending.third,
                ) to hub
            },
        ) { form, selectionAndHub ->
            val selection = selectionAndHub.first
            val hub = selectionAndHub.second
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
                hubConversationCreate = hub.first,
                hubHttpReady = hub.second,
                createWorkspaces = hub.third,
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
            canCreate = if (form.hubConversationCreate) {
                form.hubHttpReady
            } else {
                connection is ConnectionState.Conectado && gatewayClient.isConnected()
            },
            hubConversationCreate = form.hubConversationCreate,
            createWorkspaces = form.createWorkspaces,
            selectionMode = form.selectionMode,
            selectedCount = selected.size,
            pendingDeleteKeys = form.pendingDeleteKeys,
            pendingDeleteNames = form.pendingDeleteNames,
            deleting = form.deleting,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), SessionsUiState())

    init {
        viewModelScope.launch {
            combine(preferences.connectionBackend, preferences.hubConfig) { backend, hub ->
                backend to hub
            }.collect { (backend, hub) ->
                _hubConversationCreate.value = backend == ConnectionBackend.HUB
                _hubHttpReady.value = backend == ConnectionBackend.HUB && hub != null
                if (backend == ConnectionBackend.HUB && hub != null) {
                    workspaceGateway.configure(hub.address, hub.token)
                    _createWorkspaces.value = runCatching {
                        workspaceGateway.listWorkspaces()
                    }.getOrDefault(emptyList())
                }
            }
        }
    }

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

    fun openWorkspaceListing(workspace: WorkspaceDto) {
        viewModelScope.launch {
            listingCoordinator.open(workspace)
            _workspaceListing.value = listingCoordinator.state
        }
    }

    fun closeWorkspaceListing() {
        listingCoordinator.close()
        _workspaceListing.value = listingCoordinator.state
    }

    fun openListedConversation(record: ConversationRecordDto, onOpened: () -> Unit) {
        viewModelScope.launch {
            sessionProvider.registerAndActivate(
                sessionKey = record.id,
                displayName = conversationListTitle(record),
                agentId = null,
            )
            listingCoordinator.close()
            _workspaceListing.value = listingCoordinator.state
            onOpened()
        }
    }

    fun openCreate() {
        if (_selectionMode.value) return
        _error.value = null
        _draftName.value = ""
        _showCreate.value = true
        viewModelScope.launch {
            if (preferences.getConnectionBackend() != ConnectionBackend.HUB) {
                _createWorkspaces.value = emptyList()
                return@launch
            }
            val hub = preferences.getHubConfig() ?: run {
                _createWorkspaces.value = emptyList()
                return@launch
            }
            workspaceGateway.configure(hub.address, hub.token)
            _createWorkspaces.value = runCatching { workspaceGateway.listWorkspaces() }
                .getOrDefault(emptyList())
        }
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
        if (_hubConversationCreate.value) {
            createCasual()
            return
        }
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

    fun createCasual(onCreated: () -> Unit = {}) {
        createHubConversation(hubCasualConversation(_draftName.value), onCreated)
    }

    fun createInWorkspace(workspaceId: String, onCreated: () -> Unit = {}) {
        createHubConversation(
            hubConversationInWorkspace(_draftName.value, workspaceId),
            onCreated,
        )
    }

    private fun createHubConversation(
        request: HubConversationCreateRequest,
        onCreated: () -> Unit,
    ) {
        if (request.title.isEmpty()) {
            _error.value = "Escribe un nombre para la sesión"
            return
        }
        viewModelScope.launch {
            val hub = preferences.getHubConfig()
            if (hub == null) {
                _error.value = "Configura el Hub para crear una conversación"
                return@launch
            }
            workspaceGateway.configure(hub.address, hub.token)
            _creating.value = true
            _error.value = null
            val created = runCatching {
                executeHubConversationCreate(workspaceGateway, request)
            }.onFailure { err ->
                _creating.value = false
                _error.value = err.message ?: "No se pudo crear la conversación."
            }.getOrNull() ?: return@launch
            sessionProvider.registerAndActivate(
                sessionKey = created.id,
                displayName = request.title,
                agentId = null,
            )
            _creating.value = false
            dismissCreate()
            onCreated()
        }
    }
}
