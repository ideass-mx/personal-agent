package mx.ideass.personal.agent.voice

/**
 * Vínculo invocador ↔ racha: la superficie visible es
 * [VoiceLockscreenActivity] (Activity showWhenLocked, patrón Gemini).
 * El VIS solo arranca/cuelga y lanza esa Activity; su descarte no cuelga
 * la conversación.
 *
 * Comportamiento estilo Gemini mientras la Activity está visible:
 * keep-screen-on con racha activa; sobre keyguard sin pedir desbloqueo.
 * HyperOS ignora el flag sobre keyguard → [VoiceScreenWakeController]
 * (bits racha ∧ superficie; no atado a turnos ni a `Agente:respuesta`).
 */
object VoiceVisSessionPolicy {

    /** Acción al mostrar el invocador (VIS → Activity). */
    enum class ShowAction {
        /** Arrancar una racha nueva. */
        Start,
        /** Segunda invocación: colgar la racha activa. */
        HangUpByReinvocation,
    }

    /**
     * @param uiBoundThisWindow true si esta instancia de VIS ya arrancó voz
     * @param voiceActive true si [VoiceSession] sigue en racha (p. ej. tras hide)
     */
    fun onShow(uiBoundThisWindow: Boolean, voiceActive: Boolean): ShowAction {
        return if (uiBoundThisWindow || voiceActive) {
            ShowAction.HangUpByReinvocation
        } else {
            ShowAction.Start
        }
    }

    /**
     * Descarte de la superficie / VIS: nunca detiene [VoiceSession].
     * La racha vive en el singleton + [VoiceMicForegroundService].
     */
    fun shouldStopVoiceOnWindowDismiss(): Boolean = false

    /**
     * HyperOS a veces dispara onHide ~ms tras onShow sin retirar la ventana.
     * Si la voz sigue activa dentro de la gracia, el VIS ignora el bookkeeping
     * para no interferir con la Activity ya lanzada.
     */
    const val SPURIOUS_HIDE_GRACE_MS: Long = 500L

    fun shouldIgnoreSpuriousHide(ageMsSinceShow: Long, voiceActive: Boolean): Boolean =
        voiceActive && ageMsSinceShow in 0 until SPURIOUS_HIDE_GRACE_MS

    /**
     * Pantalla no debe apagarse por timeout mientras la superficie
     * ([VoiceLockscreenActivity]) está visible y la racha sigue activa.
     * Gobierna el flag de ventana; el wake lock `Agente:voz-pantalla` usa
     * la misma condición vía [VoiceScreenWakeController].
     */
    fun shouldKeepScreenOn(windowVisible: Boolean, voiceActive: Boolean): Boolean =
        windowVisible && voiceActive

    /** La Activity se muestra sobre el bloqueo (como Gemini FloatyActivity). */
    fun shouldShowWhenLocked(): Boolean = true

    /**
     * No pedir dismiss del keyguard: el teléfono sigue bloqueado;
     * la Activity ocluye visualmente el lockscreen sin desbloquear.
     */
    fun shouldDismissKeyguard(): Boolean = false

    /**
     * Mientras la racha está visible sobre keyguard: Activity a pantalla
     * completa y opaca para que el sistema retire UI de bloqueo (p. ej. UDFPS).
     * No implica [shouldDismissKeyguard].
     */
    fun shouldOccludeKeyguardVisually(): Boolean = true

    /** El tema/fondo de la Activity de racha no debe ser translúcido. */
    fun sessionWindowIsTranslucent(): Boolean = false
}
