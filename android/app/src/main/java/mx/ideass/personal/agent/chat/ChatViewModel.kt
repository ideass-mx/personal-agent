package mx.ideass.personal.agent.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import mx.ideass.personal.agent.app.AppPreferences
import mx.ideass.personal.agent.connection.ConnectionPrefsPolicy
import mx.ideass.personal.agent.gateway.session.SessionProvider
import mx.ideass.personal.agent.network.ChatConnection
import mx.ideass.personal.agent.network.ConnectionState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ChatMessage(
    val id: String,
    val text: String,
    val fromUser: Boolean,
    val queued: Boolean = false,
    val streaming: Boolean = false,
)

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val draft: String = "",
    val activeSessionName: String = "",
    val activeSessionKey: String = "",
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val chatConnection: ChatConnection,
    private val chatStore: ChatStore,
    private val sessionProvider: SessionProvider,
    preferences: AppPreferences,
) : ViewModel() {

    private val _draft = MutableStateFlow("")

    val ui: StateFlow<ChatUiState> = combine(
        chatStore.messages,
        _draft,
        sessionProvider.knownSessions,
        sessionProvider.activeSession,
    ) { messages, draft, known, active ->
        val activeKey = active?.sessionKey
        val name = known.find { it.sessionKey == activeKey }?.displayName
            ?: activeKey.orEmpty()
        ChatUiState(
            messages = messages,
            draft = draft,
            activeSessionName = name,
            activeSessionKey = activeKey.orEmpty(),
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ChatUiState())

    val connectionState: StateFlow<ConnectionState> = combine(
        chatConnection.connectionState,
        preferences.configured,
    ) { raw, configured ->
        ConnectionPrefsPolicy.effectiveConnectionState(raw, configured)
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        chatConnection.connectionState.value,
    )

    private val _hadConnection = MutableStateFlow(false)
    val hadConnection: StateFlow<Boolean> = _hadConnection.asStateFlow()

    init {
        viewModelScope.launch {
            chatStore.ensureLoaded()
        }
        viewModelScope.launch {
            chatConnection.connectionState.collect { state ->
                if (state is ConnectionState.Conectado) {
                    _hadConnection.value = true
                }
            }
        }
    }

    fun onDraftChange(value: String) = _draft.update { value }

    fun send() {
        val text = _draft.value.trim()
        if (text.isEmpty()) return
        _draft.value = ""
        viewModelScope.launch {
            val queued = !chatConnection.isConnected()
            chatStore.appendUserMessage(text, queued)
            chatConnection.sendUserMessage(text, chatStore.currentConversationId())
        }
    }
}
