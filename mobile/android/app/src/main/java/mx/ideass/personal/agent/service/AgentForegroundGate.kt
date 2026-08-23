package mx.ideass.personal.agent.service

/**
 * Estado compartido del FGS de [AgentService] para arranques idempotentes.
 * Separado del Service para poder unit-testear la guarda sin Robolectric.
 */
internal object AgentForegroundGate {
    @Volatile
    var isActive: Boolean = false
        private set

    fun markActive() {
        isActive = true
    }

    fun markInactive() {
        isActive = false
    }

    /** true si [AgentService.start] debe ser no-op. */
    fun shouldSkipStart(): Boolean = isActive
}
