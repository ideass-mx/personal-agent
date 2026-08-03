package mx.ideass.personal.agent.voice

/**
 * Heurísticas puras del título-resumen de racha (testeable sin red).
 *
 * Opción B: parsear respuesta del agente.
 * Fallback A: primera frase útil del usuario (~40 chars) o mantener provisional.
 */
object VoiceStreakTitleLogic {
    const val FALLBACK_MAX_CHARS: Int = 40
    /** Respuestas más largas se tratan como no parseables (el agente divagó). */
    private const val MAX_TITLE_CHARS: Int = 80
    private const val MAX_TITLE_WORDS: Int = 10

    /**
     * Extrae un título corto de la respuesta del agente.
     * null = no usable → aplicar fallback A.
     */
    fun parseAgentTitle(raw: String?): String? {
        if (raw == null) return null
        val firstLine = raw.lineSequence()
            .map { it.trim() }
            .firstOrNull { it.isNotEmpty() }
            ?: return null
        // Quitar puntuación final antes de comillas envolventes («título».).
        var title = firstLine.trimEnd('.', '。', '…', '!', '?').trim()
        title = stripWrappingQuotes(title)
        title = title.trimEnd('.', '。', '…', '!', '?').trim()
        if (title.isEmpty()) return null
        if (title.length > MAX_TITLE_CHARS) return null
        val words = title.split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (words.isEmpty() || words.size > MAX_TITLE_WORDS) return null
        return title
    }

    /**
     * Fallback A: primera utterance del usuario truncada.
     * null = no hay texto útil → mantener el nombre provisional (no renombrar).
     */
    fun fallbackTitle(
        firstUserUtterance: String?,
        maxChars: Int = FALLBACK_MAX_CHARS,
    ): String? {
        val text = firstUserUtterance?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        if (text.length <= maxChars) return text
        val cut = text.take(maxChars)
        val lastSpace = cut.lastIndexOf(' ')
        return if (lastSpace >= 12) {
            cut.take(lastSpace).trimEnd()
        } else {
            cut.trimEnd()
        }
    }

    /** true solo si el display name actual sigue siendo el provisional de la racha. */
    fun isStillProvisional(currentDisplayName: String?, provisionalName: String): Boolean {
        val current = currentDisplayName?.trim().orEmpty()
        val provisional = provisionalName.trim()
        if (provisional.isEmpty() || current.isEmpty()) return false
        return current == provisional
    }

    /**
     * Elige el título a aplicar: agente parseable → ese; si no, fallback A.
     * null = dejar el provisional sin llamar a updateDisplayName.
     */
    fun resolveTitle(
        agentRaw: String?,
        firstUserUtterance: String?,
    ): String? = parseAgentTitle(agentRaw) ?: fallbackTitle(firstUserUtterance)

    private fun stripWrappingQuotes(text: String): String {
        var t = text.trim()
        val pairs = listOf(
            '"' to '"',
            '\'' to '\'',
            '«' to '»',
            '\u201C' to '\u201D',
            '\u2018' to '\u2019',
        )
        for ((open, close) in pairs) {
            if (t.length >= 2 && t.first() == open && t.last() == close) {
                t = t.substring(1, t.length - 1).trim()
            }
        }
        return t
    }
}
