package mx.ideass.personal.agent.connection

import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

/**
 * Parsea personalagent://pair?v=1&agent=&endpoint=&session=&secret=
 * No confía ciegamente: valida versión y campos requeridos.
 * Implementación JVM-pura (sin android.net.Uri) para reutilizar en tests.
 */
data class PairingQrPayload(
    val version: Int,
    val agentId: String,
    val endpoint: String,
    val pairingSessionId: String,
    val pairingSecret: String,
)

object PairingQrParser {
    fun parse(raw: String): Result<PairingQrPayload> {
        val trimmed = raw.trim()
        if (trimmed.isEmpty()) return Result.failure(IllegalArgumentException("empty"))
        val uri = try {
            URI(trimmed)
        } catch (e: Exception) {
            return Result.failure(e)
        }
        if (uri.scheme != "personalagent" || uri.host != "pair") {
            return Result.failure(IllegalArgumentException("unsupported_scheme"))
        }
        val params = parseQuery(uri.rawQuery ?: uri.query)
        val keys = params.keys.map { it.lowercase() }
        if (keys.any { it.contains("hub_token") || it == "token" }) {
            return Result.failure(IllegalArgumentException("forbidden_token_field"))
        }
        val v = params["v"]?.toIntOrNull()
            ?: return Result.failure(IllegalArgumentException("missing_v"))
        if (v != 1) return Result.failure(IllegalArgumentException("unsupported_version"))
        val agent = params["agent"]?.trim().orEmpty()
        val endpoint = params["endpoint"]?.trim().orEmpty()
        val session = params["session"]?.trim().orEmpty()
        val secret = params["secret"]?.trim().orEmpty()
        if (agent.isEmpty() || endpoint.isEmpty() || session.isEmpty() || secret.isEmpty()) {
            return Result.failure(IllegalArgumentException("missing_fields"))
        }
        if (!endpoint.startsWith("ws://") && !endpoint.startsWith("wss://")) {
            return Result.failure(IllegalArgumentException("invalid_endpoint"))
        }
        return Result.success(
            PairingQrPayload(
                version = v,
                agentId = agent,
                endpoint = endpoint,
                pairingSessionId = session,
                pairingSecret = secret,
            ),
        )
    }

    private fun parseQuery(query: String?): Map<String, String> {
        if (query.isNullOrBlank()) return emptyMap()
        val out = linkedMapOf<String, String>()
        for (part in query.split('&')) {
            if (part.isEmpty()) continue
            val eq = part.indexOf('=')
            val keyEnc = if (eq >= 0) part.substring(0, eq) else part
            val valEnc = if (eq >= 0) part.substring(eq + 1) else ""
            val key = urlDecode(keyEnc)
            val value = urlDecode(valEnc)
            if (key.isNotEmpty()) out[key] = value
        }
        return out
    }

    private fun urlDecode(value: String): String =
        URLDecoder.decode(value.replace('+', ' '), StandardCharsets.UTF_8)
}
