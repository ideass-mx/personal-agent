package mx.ideass.personal.agent.chat

import mx.ideass.personal.agent.network.ChatInbound
import java.util.UUID

/**
 * Partición de mensajes por sessionKey (sin Android/DataStore).
 * La UI solo ve el hilo [visibleSessionKey].
 */
class ChatThreads {
    private data class ThreadState(
        val messages: List<ChatMessage> = emptyList(),
        val streamingId: String? = null,
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

    fun appendUser(sessionKey: String, text: String, queued: Boolean): ChatMessage {
        val key = requireKey(sessionKey)
        val local = ChatMessage(
            id = UUID.randomUUID().toString(),
            text = text,
            fromUser = true,
            queued = queued,
        )
        val state = threads[key] ?: ThreadState()
        threads[key] = state.copy(messages = state.messages + local)
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
            is ChatInbound.AssistantDelta -> applyDelta(key, msg.text, msg.replace)
            is ChatInbound.AssistantDone -> completeAssistant(key)
            is ChatInbound.Error -> {
                val state = threads[key] ?: ThreadState()
                threads[key] = state.copy(
                    streamingId = null,
                    messages = state.messages + ChatMessage(
                        id = UUID.randomUUID().toString(),
                        text = "Error: ${msg.message}",
                        fromUser = false,
                    ),
                )
            }
        }
        return key == visibleSessionKey
    }

    fun replaceMessages(sessionKey: String, messages: List<ChatMessage>) {
        val key = requireKey(sessionKey)
        val state = threads[key] ?: ThreadState()
        threads[key] = state.copy(messages = messages, streamingId = null)
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

    private fun applyDelta(key: String, text: String, replace: Boolean) {
        val state = threads[key] ?: ThreadState()
        val id = state.streamingId ?: UUID.randomUUID().toString()
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
        threads[key] = state.copy(messages = nextMessages, streamingId = id)
    }

    private fun completeAssistant(key: String) {
        val state = threads[key] ?: return
        val id = state.streamingId
        threads[key] = state.copy(
            streamingId = null,
            messages = if (id == null) {
                state.messages
            } else {
                state.messages.map { if (it.id == id) it.copy(streaming = false) else it }
            },
        )
    }

    private fun requireKey(sessionKey: String): String {
        val key = sessionKey.trim()
        require(key.isNotEmpty()) { "session_key_blank" }
        return key
    }
}
