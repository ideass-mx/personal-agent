package mx.ideass.personal.agent.voice

/**
 * Estado del wake lock de pantalla: racha ∧ ventana visible.
 * No conoce turnos Listening/Thinking/Speaking — solo los dos bits de ciclo
 * de vida. Testeable sin PowerManager.
 */
class VoiceScreenWakeGate {
    private var windowVisible = false
    private var streakActive = false

    val isHeld: Boolean
        get() = windowVisible && streakActive

    val isWindowVisible: Boolean get() = windowVisible
    val isStreakActive: Boolean get() = streakActive

    /**
     * @return true si el bit de ventana cambió (hay que re-aplicar el wake lock).
     */
    fun setWindowVisible(visible: Boolean): Boolean {
        if (windowVisible == visible) return false
        windowVisible = visible
        return true
    }

    /**
     * @return true si el bit de racha cambió.
     */
    fun setStreakActive(active: Boolean): Boolean {
        if (streakActive == active) return false
        streakActive = active
        return true
    }

    /** Liberación forzada (onDestroy). @return true si estaba held. */
    fun forceRelease(): Boolean {
        val wasHeld = isHeld
        windowVisible = false
        streakActive = false
        return wasHeld
    }
}
