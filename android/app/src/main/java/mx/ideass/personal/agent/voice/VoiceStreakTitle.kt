package mx.ideass.personal.agent.voice

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.yield
import kotlinx.coroutines.withTimeoutOrNull
import mx.ideass.personal.agent.chat.ChatStore
import mx.ideass.personal.agent.gateway.session.SessionProvider
import mx.ideass.personal.agent.network.ChatConnection
import mx.ideass.personal.agent.network.ChatInbound
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Tras colgar una racha: pide título al agente (async) y renombra en local
 * solo si el display name sigue siendo el provisional (no-destructivo).
 *
 * Fuera del camino crítico del cierre: el usuario ya oyó el earcon.
 */
@Singleton
class VoiceStreakTitle @Inject constructor(
    private val chatConnection: ChatConnection,
    private val chatStore: ChatStore,
    private val sessionProvider: SessionProvider,
) {
    /**
     * @return título aplicado, o null si se mantuvo el provisional / se omitió.
     */
    suspend fun applyAfterHang(
        sessionKey: String,
        provisionalName: String,
        firstUserUtterance: String?,
        titlePrompt: String,
    ): String? = runStreakTitleAfterHang(
        sessionProvider = sessionProvider,
        chatConnection = chatConnection,
        recordUserPrompt = { key, text ->
            chatStore.appendUserMessage(text = text, queued = false, sessionKey = key)
        },
        sessionKey = sessionKey,
        provisionalName = provisionalName,
        firstUserUtterance = firstUserUtterance,
        titlePrompt = titlePrompt,
    )
}

/**
 * Orquestación testeable del titulado (sin depender de ChatStore/Android).
 */
internal suspend fun runStreakTitleAfterHang(
    sessionProvider: SessionProvider,
    chatConnection: ChatConnection,
    recordUserPrompt: suspend (sessionKey: String, text: String) -> Unit,
    sessionKey: String,
    provisionalName: String,
    firstUserUtterance: String?,
    titlePrompt: String,
    replyTimeoutMs: Long = VoiceTurnPolicy.REPLY_TIMEOUT_MS,
): String? {
    val key = sessionKey.trim()
    val provisional = provisionalName.trim()
    if (key.isEmpty() || provisional.isEmpty()) return null

    if (!stillProvisional(sessionProvider, key, provisional)) {
        return null
    }

    val agentRaw = if (chatConnection.isConnected()) {
        requestAgentTitle(
            chatConnection = chatConnection,
            recordUserPrompt = recordUserPrompt,
            sessionKey = key,
            titlePrompt = titlePrompt,
            replyTimeoutMs = replyTimeoutMs,
        )
    } else {
        null
    }

    val title = VoiceStreakTitleLogic.resolveTitle(agentRaw, firstUserUtterance)
    if (title.isNullOrBlank()) {
        return null
    }
    if (!stillProvisional(sessionProvider, key, provisional)) {
        return null
    }
    sessionProvider.updateDisplayName(key, title)
    return title
}

private fun stillProvisional(
    sessionProvider: SessionProvider,
    sessionKey: String,
    provisionalName: String,
): Boolean {
    val current = sessionProvider.knownSessions.value
        .find { it.sessionKey == sessionKey }
        ?.displayName
    return VoiceStreakTitleLogic.isStillProvisional(current, provisionalName)
}

private suspend fun requestAgentTitle(
    chatConnection: ChatConnection,
    recordUserPrompt: suspend (sessionKey: String, text: String) -> Unit,
    sessionKey: String,
    titlePrompt: String,
    replyTimeoutMs: Long,
): String? = coroutineScope {
    val prompt = titlePrompt.trim()
    if (prompt.isEmpty()) return@coroutineScope null
    val replyBuffer = StringBuilder()
    val finished = CompletableDeferred<String?>()
    val collector = launch {
        chatConnection.inbound.collect { msg ->
            if (finished.isCompleted) return@collect
            if (msg.sessionKey != null && msg.sessionKey != sessionKey) {
                return@collect
            }
            when (msg) {
                is ChatInbound.AssistantDelta -> {
                    if (msg.replace) replyBuffer.clear()
                    replyBuffer.append(msg.text)
                }
                is ChatInbound.AssistantDone -> {
                    finished.complete(
                        replyBuffer.toString().trim().ifEmpty { null },
                    )
                }
                is ChatInbound.Error -> {
                    finished.complete(null)
                }
            }
        }
    }
    try {
        yield()
        recordUserPrompt(sessionKey, prompt)
        chatConnection.sendUserMessage(prompt, sessionKey)
        withTimeoutOrNull(replyTimeoutMs) {
            finished.await()
        }
    } finally {
        collector.cancel()
    }
}
