package mx.ideass.personal.agent.voice

/**
 * Decisiones puras del turno de voz (testeable sin STT/TTS reales).
 *
 * TODO(Fase 2): comandos de sesión / enrutado a sesión activa.
 */
sealed interface VoiceTurnDecision {
    /** Enviar el texto a la racha abierta y esperar respuesta. */
    data class Send(val text: String) : VoiceTurnDecision

    /** Colgar la racha (comando de cierre); no enviar al chat. */
    data object Hang : VoiceTurnDecision

    /** Anunciar error por voz y cerrar la sesión. */
    data class AudibleError(val kind: VoiceErrorKind) : VoiceTurnDecision

    /** Seguir escuchando (utterance vacía / no match). */
    data object ContinueListening : VoiceTurnDecision
}

enum class VoiceErrorKind {
    NoNetwork,
    NoReply,
    /** No hay racha abierta (falló create o se perdió la key). */
    StreakUnavailable,
    SttUnavailable,
    TtsUnavailable,
}

/** Resultado de esperar la respuesta del agente (incl. timeout / reconexión). */
sealed interface VoiceWaitResult {
    data class Speak(val text: String) : VoiceWaitResult
    data object ContinueListening : VoiceWaitResult
    data class AudibleError(val kind: VoiceErrorKind) : VoiceWaitResult
}

object VoiceTurnPolicy {
    /** Tiempo máximo esperando respuesta (cubre reconexión a mitad de consulta). */
    const val REPLY_TIMEOUT_MS: Long = 45_000L

    /**
     * Silencio continuo en Listening sin habla útil → cuelga la racha.
     * Antes era 6 s (cierre agresivo); 25 s permite pausas naturales entre turnos.
     */
    const val STREAK_SILENCE_TIMEOUT_MS: Long = 25_000L

    /**
     * Tras STT: hang exacto, o send si hay racha (aunque el socket esté caído).
     */
    fun afterUtterance(
        text: String,
        streakReady: Boolean,
        hangCommands: Collection<String>,
    ): VoiceTurnDecision {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return VoiceTurnDecision.ContinueListening
        if (VoiceHangCommands.isHangCommand(trimmed, hangCommands)) {
            return VoiceTurnDecision.Hang
        }
        if (!streakReady) {
            return VoiceTurnDecision.AudibleError(VoiceErrorKind.StreakUnavailable)
        }
        return VoiceTurnDecision.Send(trimmed)
    }

    /**
     * Tras el gate de conexión. La red **no** se decide aquí: offline solo lo
     * declara [VoiceConnectionGate.ensureConnected] al rendirse.
     */
    fun afterSessionStart(sttAvailable: Boolean): VoiceTurnDecision? {
        if (!sttAvailable) {
            return VoiceTurnDecision.AudibleError(VoiceErrorKind.SttUnavailable)
        }
        return null
    }

    /**
     * Tras esperar la respuesta del Gateway.
     * [timedOut] true = se agotó [REPLY_TIMEOUT_MS] sin AssistantDone.
     */
    fun afterReplyWait(timedOut: Boolean, reply: String?): VoiceWaitResult {
        if (timedOut) return VoiceWaitResult.AudibleError(VoiceErrorKind.NoReply)
        val text = reply?.trim().orEmpty()
        if (text.isEmpty()) return VoiceWaitResult.ContinueListening
        return VoiceWaitResult.Speak(text)
    }
}

/** Copy hablable / UI para errores de voz (inyectado desde recursos en producción). */
data class VoiceErrorCopy(
    val noNetworkSpoken: String,
    val noNetworkUi: String,
    val noReplySpoken: String,
    val noReplyUi: String,
    val streakUnavailableSpoken: String,
    val streakUnavailableUi: String,
    val sttUnavailableSpoken: String,
    val sttUnavailableUi: String,
    val ttsUnavailableSpoken: String,
    val ttsUnavailableUi: String,
) {
    fun spoken(kind: VoiceErrorKind): String = when (kind) {
        VoiceErrorKind.NoNetwork -> noNetworkSpoken
        VoiceErrorKind.NoReply -> noReplySpoken
        VoiceErrorKind.StreakUnavailable -> streakUnavailableSpoken
        VoiceErrorKind.SttUnavailable -> sttUnavailableSpoken
        VoiceErrorKind.TtsUnavailable -> ttsUnavailableSpoken
    }

    fun ui(kind: VoiceErrorKind): String = when (kind) {
        VoiceErrorKind.NoNetwork -> noNetworkUi
        VoiceErrorKind.NoReply -> noReplyUi
        VoiceErrorKind.StreakUnavailable -> streakUnavailableUi
        VoiceErrorKind.SttUnavailable -> sttUnavailableUi
        VoiceErrorKind.TtsUnavailable -> ttsUnavailableUi
    }
}
