package mx.ideass.personal.agent.voice

/**
 * Vínculo VIS ↔ racha: la ventana es invocador + UI opcional.
 * Su descarte (pantalla apagada, dismiss) no cuelga la conversación.
 *
 * Comportamiento estilo Gemini mientras la ventana está visible:
 * keep-screen-on con racha activa; sobre keyguard sin pedir desbloqueo.
 * HyperOS ignora el flag sobre keyguard → [VoiceScreenWakeController]
 * (bits racha ∧ ventana; no atado a turnos ni a `Agente:respuesta`).
 */
object VoiceVisSessionPolicy {

    /** Acción al mostrar la ventana del asistente. */
    enum class ShowAction {
        /** Arrancar una racha nueva. */
        Start,
        /** Segunda invocación: colgar la racha activa. */
        HangUpByReinvocation,
    }

    /**
     * @param uiBoundThisWindow true si esta instancia de ventana ya arrancó voz
     * @param voiceActive true si [VoiceSession] sigue en racha (p. ej. tras onHide)
     */
    fun onShow(uiBoundThisWindow: Boolean, voiceActive: Boolean): ShowAction {
        return if (uiBoundThisWindow || voiceActive) {
            ShowAction.HangUpByReinvocation
        } else {
            ShowAction.Start
        }
    }

    /**
     * Descarte de la ventana (onHide / onDestroy): nunca detiene [VoiceSession].
     * La racha vive en el singleton + [VoiceMicForegroundService].
     */
    fun shouldStopVoiceOnWindowDismiss(): Boolean = false

    /**
     * HyperOS a veces dispara onHide ~ms tras onShow sin retirar la ventana.
     * Si la voz sigue activa dentro de la gracia, el VIS ignora el bookkeeping
     * (bits de ventana / colector) para no dejar cascarón ni soltar el wake lock.
     */
    const val SPURIOUS_HIDE_GRACE_MS: Long = 500L

    fun shouldIgnoreSpuriousHide(ageMsSinceShow: Long, voiceActive: Boolean): Boolean =
        voiceActive && ageMsSinceShow in 0 until SPURIOUS_HIDE_GRACE_MS

    /**
     * Pantalla no debe apagarse por timeout mientras la ventana VIS está
     * visible y la racha sigue activa. Gobierna el flag de ventana; el wake
     * lock `Agente:voz-pantalla` usa la misma condición vía
     * [VoiceScreenWakeController] (bits independientes de los turnos).
     */
    fun shouldKeepScreenOn(windowVisible: Boolean, voiceActive: Boolean): Boolean =
        windowVisible && voiceActive

    /** La ventana se muestra sobre el bloqueo (como Gemini). */
    fun shouldShowWhenLocked(): Boolean = true

    /**
     * No pedir dismiss del keyguard: el teléfono sigue bloqueado;
     * la ventana ocluye visualmente el lockscreen sin desbloquear.
     */
    fun shouldDismissKeyguard(): Boolean = false

    /**
     * Mientras la racha está visible sobre keyguard: ventana a pantalla
     * completa y opaca para que el sistema retire UI de bloqueo (p. ej. UDFPS).
     * No implica [shouldDismissKeyguard].
     */
    fun shouldOccludeKeyguardVisually(): Boolean = true

    /** El tema/fondo de la sesión VIS no debe ser translúcido. */
    fun sessionWindowIsTranslucent(): Boolean = false
}
