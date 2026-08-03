package mx.ideass.personal.agent.voice

/**
 * Origen del arranque de voz. Decide si se crea racha o se continúa un hilo.
 *
 * - [AssistantInvocation]: VIS / Hablar / tile / trampoline — sesión nueva.
 * - [InConversation]: micrófono desde chat abierto — misma [sessionKey], sin titulado.
 */
sealed interface VoiceOrigin {
    /** Invocación del asistente «desde fuera». */
    data object AssistantInvocation : VoiceOrigin

    /** Micrófono dentro de una conversación ya abierta. */
    data class InConversation(val sessionKey: String) : VoiceOrigin
}

/** Plan de enlace al hilo de chat al arrancar voz (testeable). */
sealed interface VoiceBindPlan {
    /** Crear racha vía VoiceStreak (createNamedSession). */
    data object CreateStreak : VoiceBindPlan

    /** Usar sessionKey existente; no crear ni titular. */
    data class UseExisting(val sessionKey: String) : VoiceBindPlan

    /** Origen inválido (p. ej. InConversation sin key). */
    data object Invalid : VoiceBindPlan
}

object VoiceOriginPolicy {
    fun bindPlan(origin: VoiceOrigin): VoiceBindPlan = when (origin) {
        is VoiceOrigin.AssistantInvocation -> VoiceBindPlan.CreateStreak
        is VoiceOrigin.InConversation -> {
            val key = origin.sessionKey.trim()
            if (key.isEmpty()) VoiceBindPlan.Invalid else VoiceBindPlan.UseExisting(key)
        }
    }

    /** Solo las rachas nuevas disparan título-resumen al colgar. */
    fun titlesOnHang(plan: VoiceBindPlan): Boolean = plan is VoiceBindPlan.CreateStreak
}
