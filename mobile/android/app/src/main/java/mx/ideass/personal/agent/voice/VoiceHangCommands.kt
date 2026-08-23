package mx.ideass.personal.agent.voice

import java.util.Locale

/**
 * Comandos de cierre de racha: exact match tras normalizar.
 * Nunca usar contains — «está listo el reporte» no cuelga.
 */
object VoiceHangCommands {
    private val PUNCT_REGEX = Regex("[\\p{Punct}\\u00A1\\u00BF\\u00AB\\u00BB\\u201C\\u201D\\u2018\\u2019]+")
    private val SPACE_REGEX = Regex("\\s+")

    fun normalize(text: String): String {
        return text
            .lowercase(Locale.forLanguageTag("es-MX"))
            .replace(PUNCT_REGEX, "")
            .replace(SPACE_REGEX, " ")
            .trim()
    }

    /** True solo si el enunciado completo (normalizado) es exactamente un comando. */
    fun isHangCommand(text: String, commands: Collection<String>): Boolean {
        val normalized = normalize(text)
        if (normalized.isEmpty()) return false
        return commands.any { normalize(it) == normalized }
    }
}

/** Motivo de colgar la racha (todas las vías pasan por [VoiceSession.hangUp]). */
enum class HangReason {
    /** Botón Terminar / cierre desde UI. */
    Ui,
    /** Exact match de comando de voz (listo/adiós/…). */
    Command,
    /** Silencio acumulado en Listening (~25 s). */
    SilenceTimeout,
    /** Segunda invocación (toggle VIS / power). */
    Reinvocation,
}
