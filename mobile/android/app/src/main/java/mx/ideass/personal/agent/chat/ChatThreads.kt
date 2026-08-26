package mx.ideass.personal.agent.chat

import mx.ideass.personal.agent.network.ChatInbound
import java.util.UUID

/**
 * Partición de mensajes por sessionKey (sin Android/DataStore).
 * La UI solo ve el hilo [visibleSessionKey].
 *
 * Streams concurrentes: un acumulador por [ChatInbound.runId] (o legado
 * mono-stream si runId es null). [replace]=true sustituye el texto (snapshot).
 */
class ChatThreads {
    private data class ThreadState(
        val messages: List<ChatMessage> = emptyList(),
        /** runKey → id de burbuja en streaming. */
        val streamingByRun: Map<String, String> = emptyMap(),
        /** chat.send / appendUser pendientes de AssistantDone (por sesión). */
        val pendingReplies: Int = 0,
    )

    private val threads = linkedMapOf<String, ThreadState>()
    var visibleSessionKey: String? = null
        private set

    fun visibleMessages(): List<ChatMessage> {
        val key = visibleSessionKey ?: return emptyList()
        return threads[key]?.messages.orEmpty()
    }

    fun setVisibleSession(sessionKey: String?) {
        visibleSessionKey = sessionKey?.trim()?.takeIf { it.isNotEmpty() }
    }

    fun messagesFor(sessionKey: String): List<ChatMessage> =
        threads[sessionKey.trim()]?.messages.orEmpty()

    fun knownSessionKeys(): Set<String> = threads.keys.toSet()

    /** True si hay stream activo o un send aún sin AssistantDone en esa sesión. */
    fun hasAssistantWork(sessionKey: String): Boolean {
        val state = threads[sessionKey.trim()] ?: return false
        return state.streamingByRun.isNotEmpty() || state.pendingReplies > 0
    }

    fun appendUser(sessionKey: String, text: String, queued: Boolean): ChatMessage {
        val key = requireKey(sessionKey)
        val local = ChatMessage(
            id = UUID.randomUUID().toString(),
            text = text,
            fromUser = true,
            queued = queued,
        )
        val state = threads[key] ?: ThreadState()
        threads[key] = state.copy(
            messages = state.messages + local,
            pendingReplies = state.pendingReplies + 1,
        )
        return local
    }

    fun markQueuedAsSent(sessionKey: String? = null) {
        if (sessionKey != null) {
            val key = sessionKey.trim()
            val state = threads[key] ?: return
            if (state.messages.none { it.queued }) return
            threads[key] = state.copy(
                messages = state.messages.map { if (it.queued) it.copy(queued = false) else it },
            )
            return
        }
        for ((key, state) in threads.toList()) {
            if (state.messages.none { it.queued }) continue
            threads[key] = state.copy(
                messages = state.messages.map { if (it.queued) it.copy(queued = false) else it },
            )
        }
    }

    /**
     * Aplica un inbound al hilo de [sessionKey].
     * @return true si el hilo afectado es el visible (hay que publicar a la UI).
     */
    fun handleInbound(sessionKey: String, msg: ChatInbound): Boolean {
        val key = requireKey(sessionKey)
        when (msg) {
            is ChatInbound.AssistantDelta -> applyDelta(key, msg.text, msg.replace, msg.runId)
            is ChatInbound.AssistantDone -> completeAssistant(key, msg.runId)
            is ChatInbound.Error -> {
                completeAssistant(key, msg.runId)
                val state = threads[key] ?: ThreadState()
                threads[key] = state.copy(
                    messages = state.messages + ChatMessage(
                        id = UUID.randomUUID().toString(),
                        text = "Error: ${msg.message}",
                        fromUser = false,
                    ),
                )
            }
            is ChatInbound.ConfirmRequest -> Unit
        }
        return key == visibleSessionKey
    }

    fun replaceMessages(sessionKey: String, messages: List<ChatMessage>) {
        val key = requireKey(sessionKey)
        val state = threads[key] ?: ThreadState()
        threads[key] = state.copy(
            messages = messages,
            streamingByRun = emptyMap(),
            // Conserva pendingReplies: un replace de history no cancela sends en vuelo.
            pendingReplies = state.pendingReplies,
        )
    }

    /**
     * Descarta particiones locales (mensajes, streams y queued/pending).
     * Si la visible era una de ellas, [visibleSessionKey] queda null hasta
     * que el observador de sesión activa la reasigne.
     */
    fun removeSessions(sessionKeys: Collection<String>) {
        val keys = sessionKeys.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
        if (keys.isEmpty()) return
        for (key in keys) {
            threads.remove(key)
        }
        if (visibleSessionKey in keys) {
            visibleSessionKey = null
        }
    }

    fun snapshot(): Map<String, List<StoredChatMessage>> =
        threads.mapValues { (_, state) ->
            state.messages.map {
                StoredChatMessage(
                    id = it.id,
                    text = it.text,
                    fromUser = it.fromUser,
                    queued = it.queued,
                )
            }
        }

    fun restore(snapshot: Map<String, List<StoredChatMessage>>) {
        threads.clear()
        for ((key, stored) in snapshot) {
            val trimmed = key.trim()
            if (trimmed.isEmpty()) continue
            threads[trimmed] = ThreadState(
                messages = stored.map {
                    ChatMessage(
                        id = it.id,
                        text = it.text,
                        fromUser = it.fromUser,
                        queued = it.queued,
                        streaming = false,
                    )
                },
            )
        }
    }

    private fun applyDelta(key: String, text: String, replace: Boolean, runId: String?) {
        val runKey = runKeyOf(runId)
        val state = threads[key] ?: ThreadState()
        val id = state.streamingByRun[runKey] ?: UUID.randomUUID().toString()
        val current = state.messages
        val existing = current.find { it.id == id }
        val nextMessages = if (existing == null) {
            current + ChatMessage(
                id = id,
                text = text,
                fromUser = false,
                streaming = true,
            )
        } else {
            current.map {
                if (it.id != id) {
                    it
                } else {
                    it.copy(text = if (replace) text else it.text + text)
                }
            }
        }
        threads[key] = state.copy(
            messages = nextMessages,
            streamingByRun = state.streamingByRun + (runKey to id),
        )
    }

    private fun completeAssistant(key: String, runId: String?) {
        val state = threads[key] ?: return
        val runKey = runId?.trim()?.takeIf { it.isNotEmpty() }
        val (nextStreaming, completedIds) = if (runKey == null) {
            // Legado / Done sin runId: cierra todos los streams de la sesión.
            emptyMap<String, String>() to state.streamingByRun.values.toSet()
        } else {
            val id = state.streamingByRun[runKey]
            (state.streamingByRun - runKey) to setOfNotNull(id)
        }
        threads[key] = state.copy(
            streamingByRun = nextStreaming,
            pendingReplies = (state.pendingReplies - 1).coerceAtLeast(0),
            messages = if (completedIds.isEmpty()) {
                state.messages
            } else {
                state.messages.map {
                    if (it.id in completedIds) it.copy(streaming = false) else it
                }
            },
        )
    }

    private fun requireKey(sessionKey: String): String {
        val key = sessionKey.trim()
        require(key.isNotEmpty()) { "session_key_blank" }
        return key
    }

    companion object {
        /** Clave interna cuando el wire no trae runId (hub legado). */
        internal const val LEGACY_RUN_KEY: String = ""

        internal fun runKeyOf(runId: String?): String =
            runId?.trim()?.takeIf { it.isNotEmpty() } ?: LEGACY_RUN_KEY
    }
}
