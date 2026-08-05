package mx.ideass.personal.agent.voice

/**
 * Orquestación del arranque de racha respecto a la conexión.
 * Un solo guardián: el resultado de [VoiceConnectionGate]. Ningún
 * `isConnected()` crudo puede emitir [VoiceErrorKind.NoNetwork].
 */
object VoiceConnectionStartPolicy {
    /**
     * @param gateOk resultado de [VoiceConnectionGate.ensureConnected] (ya esperado).
     * @param streakOpened resultado de abrir racha; null = falló el create.
     * @param createStreak true si el plan es [VoiceBindPlan.CreateStreak].
     * @return error a anunciar, o null para seguir al ciclo de voz.
     */
    fun errorAfterGate(
        gateOk: Boolean,
        streakOpened: Boolean?,
        createStreak: Boolean,
    ): VoiceErrorKind? {
        if (!gateOk) return VoiceErrorKind.NoNetwork
        if (createStreak && streakOpened != true) return VoiceErrorKind.StreakUnavailable
        return null
    }
}
