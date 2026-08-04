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
     * la ventana convive con el lockscreen.
     */
    fun shouldDismissKeyguard(): Boolean = false
}
