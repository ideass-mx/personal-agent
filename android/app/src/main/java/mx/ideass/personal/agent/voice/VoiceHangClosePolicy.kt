package mx.ideass.personal.agent.voice

/**
 * Contrato de colgado: el usuario queda libre en <1 s; el titulado y la
 * liberación de SCO/mic corren fuera del camino crítico de la UI.
 *
 * 1. Inmediato: wake lock de pantalla, parar escucha, Idle UI, earcon,
 *    [sessionEnded] → hide de la ventana.
 * 2. Async: titulado completo (idle → chat.send → rename / fallback A).
 * 3. Diferido: hold del earcon → soltar SCO / FGS mic.
 */
object VoiceHangClosePolicy {

    /** hide/sessionEnded no espera al hold SCO ni al titulado. */
    fun notifyUiBeforeAudioCleanup(): Boolean = true

    /** El titulado nunca bloquea hangUp / hide. */
    fun titleRunsOffCriticalPath(): Boolean = true

    enum class ImmediateStep {
        ReleaseScreenWake,
        StopListening,
        SetUiIdle,
        NotifySessionEnded,
        PlayCloseEarcon,
    }

    /** Orden lógico del cierre perceptible (antes del cleanup de audio). */
    fun immediateSteps(): List<ImmediateStep> = listOf(
        ImmediateStep.ReleaseScreenWake,
        ImmediateStep.StopListening,
        ImmediateStep.SetUiIdle,
        ImmediateStep.NotifySessionEnded,
        ImmediateStep.PlayCloseEarcon,
    )

    enum class DeferredStep {
        ReleaseScoAndMicAfterEarconHold,
    }

    fun deferredSteps(): List<DeferredStep> = listOf(
        DeferredStep.ReleaseScoAndMicAfterEarconHold,
    )
}
