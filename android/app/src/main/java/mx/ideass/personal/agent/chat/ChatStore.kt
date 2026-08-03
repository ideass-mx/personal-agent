package mx.ideass.personal.agent.chat

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import mx.ideass.personal.agent.app.AppPreferences
import mx.ideass.personal.agent.gateway.session.SessionProvider
import mx.ideass.personal.agent.network.ChatInbound
import mx.ideass.personal.agent.protocol.ProtocolJson
import mx.ideass.personal.agent.protocol.ServerMessage
import java.util.concurrent.atomic.AtomicBoolean
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
 * Hilos de chat particionados por sessionKey.
 * La UI observa [messages] (= hilo de la sesión activa).
 * Eventos de otras sesiones se guardan pero no se pintan en la abierta.
 */
@Singleton
class ChatStore @Inject constructor(
    @ApplicationContext private val context: Context,
    private val preferences: AppPreferences,
    private val sessionProvider: SessionProvider,
) {
    private object Keys {
        val Messages = stringPreferencesKey("messages_json")
        val Threads = stringPreferencesKey("threads_json")
    }

    private val mutex = Mutex()
    private val threads = ChatThreads()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val observingActive = AtomicBoolean(false)
    /** Señal al cambiar trabajo de asistente en vuelo (titulado / awaits). */
    private val assistantWorkChanged = MutableSharedFlow<Unit>(extraBufferCapacity = 64)

    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages.asStateFlow()

    private var loaded = false

    suspend fun ensureLoaded() = mutex.withLock {
        ensureLoadedLocked()
        startObservingActiveLocked()
    }

    /** sessionKey activa (para send de UI). */
    fun currentConversationId(): String? =
        sessionProvider.activeSession.value?.sessionKey
            ?: threads.visibleSessionKey

    /**
     * Espera a que [sessionKey] no tenga respuesta en vuelo ni send pendiente.
     * @return true si quedó idle a tiempo; false si expiró el timeout.
     */
    suspend fun awaitAssistantIdle(sessionKey: String, timeoutMs: Long): Boolean {
        val key = sessionKey.trim()
        if (key.isEmpty()) return true
        mutex.withLock {
            ensureLoadedLocked()
            if (!threads.hasAssistantWork(key)) return true
        }
        val idle = withTimeoutOrNull(timeoutMs) {
            while (true) {
                val busy = mutex.withLock { threads.hasAssistantWork(key) }
                if (!busy) return@withTimeoutOrNull true
                assistantWorkChanged.first()
            }
        }
        return idle == true
    }

    suspend fun appendUserMessage(
        text: String,
        queued: Boolean,
        sessionKey: String? = null,
    ): ChatMessage = mutex.withLock {
        ensureLoadedLocked()
        val key = sessionKey?.trim()?.takeIf { it.isNotEmpty() } ?: requireActiveKeyLocked()
        val local = threads.appendUser(key, text, queued)
        if (key == threads.visibleSessionKey) {
            publishVisibleLocked()
        }
        persistLocked()
        assistantWorkChanged.tryEmit(Unit)
        local
    }

    suspend fun markQueuedAsSent() = mutex.withLock {
        ensureLoadedLocked()
        threads.markQueuedAsSent()
        publishVisibleLocked()
        persistLocked()
    }

    suspend fun handleInbound(msg: ChatInbound) {
        mutex.withLock {
            ensureLoadedLocked()
            val key = resolveInboundKeyLocked(msg.sessionKey) ?: return@withLock
            val affectsVisible = threads.handleInbound(key, msg)
            if (affectsVisible) {
                publishVisibleLocked()
            }
            persistLocked()
            assistantWorkChanged.tryEmit(Unit)
            // TODO(CP4+): marcar actividad en lista si !affectsVisible
        }
    }

    suspend fun handleServer(msg: ServerMessage) {
        when (msg) {
            is ServerMessage.AssistantChunk ->
                handleInbound(ChatInbound.AssistantDelta(text = msg.text, replace = false))
            is ServerMessage.AssistantDone ->
                handleInbound(ChatInbound.AssistantDone(msg.conversationId))
            is ServerMessage.Error ->
                handleInbound(ChatInbound.Error(code = msg.code, message = msg.message))
            else -> Unit
        }
    }

    /** Sustituye el hilo local (p. ej. tras merge de chat.history — CP3). */
    suspend fun replaceThread(sessionKey: String, messages: List<ChatMessage>) = mutex.withLock {
        ensureLoadedLocked()
        threads.replaceMessages(sessionKey, messages)
        if (sessionKey.trim() == threads.visibleSessionKey) {
            publishVisibleLocked()
        }
        persistLocked()
    }

    /** Fusiona mensajes remotos de `chat.history` con el hilo local (sin duplicar). */
    suspend fun mergeRemoteHistory(sessionKey: String, remote: List<ChatMessage>) = mutex.withLock {
        ensureLoadedLocked()
        val key = sessionKey.trim()
        require(key.isNotEmpty()) { "session_key_blank" }
        val merged = ChatHistoryMapper.merge(threads.messagesFor(key), remote)
        threads.replaceMessages(key, merged)
        if (key == threads.visibleSessionKey) {
            publishVisibleLocked()
        }
        persistLocked()
    }

    /**
     * Elimina particiones locales de las keys indicadas (mensajes + queued).
     * No toca el catálogo de [SessionProvider].
     */
    suspend fun removeSessions(sessionKeys: Collection<String>) = mutex.withLock {
        ensureLoadedLocked()
        threads.removeSessions(sessionKeys)
        publishVisibleLocked()
        persistLocked()
    }

    private fun startObservingActiveLocked() {
        if (!observingActive.compareAndSet(false, true)) return
        scope.launch {
            sessionProvider.activeSession.collect { active ->
                mutex.withLock {
                    val key = active?.sessionKey?.trim()?.takeIf { it.isNotEmpty() }
                    threads.setVisibleSession(key)
                    publishVisibleLocked()
                }
            }
        }
    }

    private suspend fun ensureLoadedLocked() {
        if (loaded) return
        val prefs = context.chatDataStore.data.first()
        val rawThreads = prefs[Keys.Threads]
        if (!rawThreads.isNullOrBlank()) {
            val stored = ProtocolJson.decodeFromString(
                MapSerializer(String.serializer(), ListSerializer(StoredChatMessage.serializer())),
                rawThreads,
            )
            threads.restore(stored)
        } else {
            // Migración mono-hilo → partición bajo la key activa o legacy.
            val rawLegacy = prefs[Keys.Messages]
            if (!rawLegacy.isNullOrBlank()) {
                val stored = ProtocolJson.decodeFromString(
                    ListSerializer(StoredChatMessage.serializer()),
                    rawLegacy,
                )
                val legacyKey = sessionProvider.activeSession.value?.sessionKey
                    ?: preferences.getConversationId()
                    ?: "legacy"
                threads.restore(mapOf(legacyKey to stored))
            }
        }
        val visible = sessionProvider.activeSession.value?.sessionKey
            ?: preferences.getConversationId()
        threads.setVisibleSession(visible)
        publishVisibleLocked()
        loaded = true
    }

    private fun resolveInboundKeyLocked(inboundSessionKey: String?): String? {
        inboundSessionKey?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
        return sessionProvider.activeSession.value?.sessionKey?.trim()?.takeIf { it.isNotEmpty() }
            ?: threads.visibleSessionKey
    }

    private fun requireActiveKeyLocked(): String {
        val key = sessionProvider.activeSession.value?.sessionKey?.trim()?.takeIf { it.isNotEmpty() }
            ?: threads.visibleSessionKey
        require(!key.isNullOrBlank()) { "session_key_unavailable" }
        return key
    }

    private fun publishVisibleLocked() {
        _messages.value = threads.visibleMessages()
    }

    private suspend fun persistLocked() {
        val snapshot = threads.snapshot()
        val json = ProtocolJson.encodeToString(
            MapSerializer(String.serializer(), ListSerializer(StoredChatMessage.serializer())),
            snapshot,
        )
        context.chatDataStore.edit { prefs ->
            prefs[Keys.Threads] = json
            // Deja de escribir el formato mono-hilo.
            prefs.remove(Keys.Messages)
        }
        val visible = threads.visibleSessionKey
        if (!visible.isNullOrBlank()) {
            preferences.saveConversationId(visible)
        }
    }
}
