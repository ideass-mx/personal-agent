package mx.ideass.personal.agent.chat

import mx.ideass.personal.agent.capabilities.AgentCapabilityUx

/**
 * Presentación de resultados en conversación (PHASE 42). Sanitiza y suaviza
 * dumps técnicos; no interpreta policy ni sustituye al LLM.
 */
object ToolResultUx {

    private val SENSITIVE_KEY_REGEX = Regex(
        """"(hub_token|token|password|authorization|api[_-]?key|secret|credential|HUB_TOKEN)"\s*:\s*"[^"]*"""",
        RegexOption.IGNORE_CASE,
    )

    private val ENV_VAR_REGEX = Regex(
        """\b[A-Z][A-Z0-9_]{2,}=[^\s"']+""",
    )

    fun sanitize(text: String, maxLen: Int = 4_000): String {
        var out = text.trim()
        out = SENSITIVE_KEY_REGEX.replace(out) { match ->
            val key = match.groupValues[1]
            """"$key":"***""""
        }
        out = ENV_VAR_REGEX.replace(out, "[variable de entorno oculta]")
        return if (out.length > maxLen) out.take(maxLen) + "…" else out
    }

    fun looksLikeRawToolDump(text: String): Boolean {
        val trimmed = text.trim()
        if (trimmed.length < 2) return false
        return (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
            (trimmed.startsWith("[") && trimmed.endsWith("]"))
    }

    /**
     * Texto listo para burbuja de asistente: sanitiza y, si parece JSON crudo
     * de tool, aplica copy mínimo por capacidad conocida.
     */
    fun presentInConversation(text: String, lastToolName: String? = null): String {
        val sanitized = sanitize(text)
        if (!looksLikeRawToolDump(sanitized)) return sanitized
        return humanizeRawDump(sanitized, lastToolName)
    }

    fun humanizeRawDump(rawJson: String, toolName: String?): String {
        val compact = rawJson.replace("\n", " ").trim()
        val label = toolName?.let { AgentCapabilityUx.labelFor(it) }
        val excelNote = ToolActivityUx.excelWindowsNote(toolName)

        val body = when (toolName) {
            "filesystem.read" -> summarizeRead(compact)
            "filesystem.list" -> summarizeList(compact)
            "filesystem.write" -> summarizeWrite(compact)
            "process.execute" -> summarizeProcess(compact)
            "office.excel.read" -> "Se consultó información de Excel."
            "office.excel.write" -> "Se modificó información en Excel."
            else -> truncate(compact, 600)
        }

        return buildString {
            if (!label.isNullOrBlank()) {
                append(label)
                append(": ")
            }
            append(body)
            if (!excelNote.isNullOrBlank()) {
                append("\n\n")
                append(excelNote)
            }
        }
    }

    private fun summarizeRead(json: String): String {
        val path = extractQuoted(json, "path") ?: extractQuoted(json, "file")
        val content = extractQuoted(json, "content")
        return when {
            !content.isNullOrBlank() ->
                "Contenido${path?.let { " de $it" }.orEmpty()}: ${truncate(content, 400)}"
            !path.isNullOrBlank() -> "Archivo consultado: $path"
            else -> "Información del archivo obtenida."
        }
    }

    private fun summarizeList(json: String): String {
        val entries = Regex(""""name"\s*:\s*"([^"]+)"""").findAll(json).map { it.groupValues[1] }.toList()
        return when {
            entries.isEmpty() -> "Listado de archivos y carpetas obtenido."
            entries.size <= 8 -> "Elementos: ${entries.joinToString(", ")}"
            else -> "Elementos (${entries.size}): ${entries.take(8).joinToString(", ")}…"
        }
    }

    private fun summarizeWrite(json: String): String {
        val path = extractQuoted(json, "path") ?: extractQuoted(json, "file")
        val ok = json.contains(""""ok":true""") || json.contains(""""success":true""")
        return when {
            !path.isNullOrBlank() && ok -> "Archivo escrito: $path"
            !path.isNullOrBlank() -> "Operación sobre: $path"
            ok -> "Archivo guardado correctamente."
            else -> "Operación de escritura completada."
        }
    }

    private fun summarizeProcess(json: String): String {
        val stdout = extractQuoted(json, "stdout")
        val stderr = extractQuoted(json, "stderr")
        val exit = Regex(""""exit(?:Code)?"\s*:\s*(\d+)""").find(json)?.groupValues?.getOrNull(1)
        return buildString {
            append("Comando ejecutado")
            if (!exit.isNullOrBlank()) append(" (código $exit)")
            append(".")
            if (!stdout.isNullOrBlank()) {
                append("\n\n")
                append(truncate(stdout.trim(), 500))
            }
            if (!stderr.isNullOrBlank()) {
                append("\n\n")
                append("Avisos: ")
                append(truncate(stderr.trim(), 300))
            }
        }
    }

    private fun extractQuoted(json: String, key: String): String? =
        Regex(""""$key"\s*:\s*"((?:\\.|[^"\\])*)"""")
            .find(json)
            ?.groupValues
            ?.getOrNull(1)
            ?.replace("\\n", "\n")
            ?.replace("\\\"", "\"")

    private fun truncate(text: String, max: Int): String =
        if (text.length <= max) text else text.take(max) + "…"
}
