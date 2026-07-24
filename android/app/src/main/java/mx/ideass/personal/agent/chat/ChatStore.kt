package mx.ideass.personal.agent.chat

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import mx.ideass.personal.agent.app.AppPreferences
import mx.ideass.personal.agent.protocol.ProtocolJson
import mx.ideass.personal.agent.protocol.ServerMessage
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class StoredChatMessage(
    val id: String,
    val text: String,
    val fromUser: Boolean,
    val queued: Boolean = false,
)

private val Context.chatDataStore: DataStore<Preferences> by preferencesDataStore(name = "chat")

/**
 * Hilo de chat persistente. El service lo alimenta aunque la UI esté muerta;
 * al reabrir, la UI solo observa este store.
 */
@Singleton
class ChatStore @Inject constructor(
    @ApplicationContext private val context: Context,
    private val preferences: AppPreferences,
) {
    private object Keys {
        val Messages = stringPreferencesKey("messages_json")
    }

    private val mutex = Mutex()
    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

    private var conversationId: String? = null
    private var streamingId: String? = null
    private var loaded = false

    suspend fun ensureLoaded() = mutex.withLock {
        if (loaded) return
        conversationId = preferences.getConversationId()
        val raw = context.chatDataStore.data.first()[Keys.Messages]
        if (!raw.isNullOrBlank()) {
            val stored = ProtocolJson.decodeFromString(
                ListSerializer(StoredChatMessage.serializer()),
                raw,
            )
            _messages.value = stored.map {
                ChatMessage(
                    id = it.id,
                    text = it.text,
                    fromUser = it.fromUser,
                    queued = it.queued,
                    streaming = false,
                )
            }
        }
        loaded = true
    }

    fun currentConversationId(): String? = conversationId

    suspend fun appendUserMessage(text: String, queued: Boolean): ChatMessage = mutex.withLock {
        ensureLoadedLocked()
        val local = ChatMessage(
            id = UUID.randomUUID().toString(),
            text = text,
            fromUser = true,
            queued = queued,
        )
        _messages.value = _messages.value + local
        persistLocked()
        local
    }

    suspend fun markQueuedAsSent() = mutex.withLock {
        ensureLoadedLocked()
        if (_messages.value.none { it.queued }) return
        _messages.value = _messages.value.map { if (it.queued) it.copy(queued = false) else it }
        persistLocked()
    }

    suspend fun handleServer(msg: ServerMessage) = mutex.withLock {
        ensureLoadedLocked()
        when (msg) {
            is ServerMessage.AssistantChunk -> {
                val id = streamingId ?: UUID.randomUUID().toString().also { streamingId = it }
                val current = _messages.value
                val existing = current.find { it.id == id }
                _messages.value = if (existing == null) {
                    current + ChatMessage(
                        id = id,
                        text = msg.text,
                        fromUser = false,
                        streaming = true,
                    )
                } else {
                    current.map {
                        if (it.id == id) it.copy(text = it.text + msg.text) else it
                    }
                }
                persistLocked()
            }
            is ServerMessage.AssistantDone -> {
                conversationId = msg.conversationId
                preferences.saveConversationId(msg.conversationId)
                val id = streamingId
                streamingId = null
                if (id != null) {
                    _messages.value = _messages.value.map {
                        if (it.id == id) it.copy(streaming = false) else it
                    }
                    persistLocked()
                }
            }
            is ServerMessage.Error -> {
                streamingId = null
                _messages.value = _messages.value + ChatMessage(
                    id = UUID.randomUUID().toString(),
                    text = "Error: ${msg.message}",
                    fromUser = false,
                )
                persistLocked()
            }
            else -> Unit
        }
    }

    private suspend fun ensureLoadedLocked() {
        if (loaded) return
        conversationId = preferences.getConversationId()
        val raw = context.chatDataStore.data.first()[Keys.Messages]
        if (!raw.isNullOrBlank()) {
            val stored = ProtocolJson.decodeFromString(
                ListSerializer(StoredChatMessage.serializer()),
                raw,
            )
            _messages.value = stored.map {
                ChatMessage(
                    id = it.id,
                    text = it.text,
                    fromUser = it.fromUser,
                    queued = it.queued,
                    streaming = false,
                )
            }
        }
        loaded = true
    }

    private suspend fun persistLocked() {
        val toSave = _messages.value.map {
            StoredChatMessage(
                id = it.id,
                text = it.text,
                fromUser = it.fromUser,
                queued = it.queued,
            )
        }
        val json = ProtocolJson.encodeToString(
            ListSerializer(StoredChatMessage.serializer()),
            toSave,
        )
        context.chatDataStore.edit { prefs ->
            prefs[Keys.Messages] = json
        }
    }
}
