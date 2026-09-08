package mx.ideass.personal.agent.chat

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import mx.ideass.personal.agent.gateway.protocol.ChatHistoryResult
import mx.ideass.personal.agent.gateway.protocol.JsonMessageText

/**
 * Convierte el payload laxo de `chat.history` en [ChatMessage] y fusiona
 * con el hilo local sin duplicar.
 */
object ChatHistoryMapper {
    fun toChatMessages(result: ChatHistoryResult): List<ChatMessage> =
        result.messages.mapIndexedNotNull { index, element -> toChatMessage(element, index) }

    fun toChatMessage(element: JsonElement, index: Int): ChatMessage? {
        val obj = element as? JsonObject ?: return null
        val role = (obj["role"] as? JsonPrimitive)?.contentOrNull?.trim()?.lowercase().orEmpty()
        val fromUser = when (role) {
            "user" -> true
            "assistant" -> false
            else -> return null // system/tool/etc. fuera del hilo visible
        }
        val text = JsonMessageText.extract(obj)?.trim().orEmpty()
        if (text.isEmpty()) return null
        val id = resolveId(obj) ?: "hist-$index-${text.hashCode()}"
        return ChatMessage(
            id = id,
            text = text,
            fromUser = fromUser,
            queued = false,
            streaming = false,
        )
    }

    /**
     * Remoto es base (autoridad del server); se conservan locales que no
     * estén ya representados por id o por (fromUser, texto).
     */
    fun merge(local: List<ChatMessage>, remote: List<ChatMessage>): List<ChatMessage> {
        if (remote.isEmpty()) return local
        if (local.isEmpty()) return remote
        val remoteIds = remote.map { it.id }.toHashSet()
        val remoteFingerprints = remote.map { fingerprint(it) }.toHashSet()
        val localOnly = local.filter { msg ->
            msg.id !in remoteIds && fingerprint(msg) !in remoteFingerprints
        }
        return remote + localOnly
    }

    private fun fingerprint(msg: ChatMessage): String =
        "${if (msg.fromUser) "u" else "a"}|${msg.text.trim()}"

    private fun resolveId(obj: JsonObject): String? {
        (obj["id"] as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }
            ?.let { return it }
        (obj["messageId"] as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }
            ?.let { return it }
        // Clave de metadata del protocolo gateway legacy (no renombrar en el cable).
        val meta = obj["__openclaw"] as? JsonObject
        return (meta?.get("id") as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }
    }
}
