package mx.ideass.personal.agent.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import mx.ideass.personal.agent.network.ConnectionState
import mx.ideass.personal.agent.network.HubClient
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
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val hubClient: HubClient,
    private val chatStore: ChatStore,
) : ViewModel() {

    private val _draft = MutableStateFlow("")

    val ui: StateFlow<ChatUiState> = combine(
        chatStore.messages,
        _draft,
    ) { messages, draft ->
        ChatUiState(messages = messages, draft = draft)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ChatUiState())

    val connectionState: StateFlow<ConnectionState> = hubClient.connectionState
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ConnectionState.SinConfigurar)

    private val _hadConnection = MutableStateFlow(false)
    val hadConnection: StateFlow<Boolean> = _hadConnection.asStateFlow()

    init {
        viewModelScope.launch {
            chatStore.ensureLoaded()
        }
        viewModelScope.launch {
            hubClient.connectionState.collect { state ->
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
            val queued = !hubClient.isConnected()
            chatStore.appendUserMessage(text, queued)
            hubClient.sendUserMessage(text, chatStore.currentConversationId())
        }
    }
}
