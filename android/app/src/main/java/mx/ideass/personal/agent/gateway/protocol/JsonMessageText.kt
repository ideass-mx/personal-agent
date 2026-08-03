package mx.ideass.personal.agent.gateway.protocol

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray

/**
 * Extrae texto visible de mensajes Gateway (delta/final/history).
 * [content] puede ser string o array de partes; no usar `.jsonPrimitive` a ciegas.
 */
object JsonMessageText {
    fun extract(message: JsonElement?): String? {
        if (message == null) return null
        when (message) {
            is JsonPrimitive -> return message.contentOrNull
            is JsonObject -> return extractFromObject(message)
            is JsonArray -> {
                val parts = message.mapNotNull { extract(it) }
                return parts.joinToString("").ifBlank { null }
            }
            else -> return null
        }
    }

    private fun extractFromObject(message: JsonObject): String? {
        when (val content = message["content"]) {
            is JsonPrimitive -> content.contentOrNull?.let { return it }
            is JsonArray -> {
                val parts = content.mapNotNull { partText(it) }
                return parts.joinToString("").ifBlank { null }
            }
            null -> Unit
            else -> {
                runCatching { content.jsonArray }.getOrNull()?.let { array ->
                    val parts = array.mapNotNull { partText(it) }
                    return parts.joinToString("").ifBlank { null }
                }
            }
        }
        return primitiveOrNull(message["text"])
    }

    private fun partText(element: JsonElement): String? {
        when (element) {
            is JsonPrimitive -> return element.contentOrNull
            is JsonObject -> {
                primitiveOrNull(element["text"])?.let { return it }
                primitiveOrNull(element["content"])?.let { return it }
                return null
            }
            else -> return null
        }
    }

    private fun primitiveOrNull(element: JsonElement?): String? =
        (element as? JsonPrimitive)?.contentOrNull
}
