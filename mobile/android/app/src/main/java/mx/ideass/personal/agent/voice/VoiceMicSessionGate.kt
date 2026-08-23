package mx.ideass.personal.agent.voice

/**
 * Decide cuándo promover/liberar el FGS de tipo microphone
 * (una vez por sesión de voz; testeable sin Android).
 */
class VoiceMicSessionGate {
    private var held = false

    /** @return true si hay que arrancar el FGS de micrófono. */
    fun onSessionStart(): Boolean {
        if (held) return false
        held = true
        return true
    }

    /** @return true si hay que detener el FGS de micrófono. */
    fun onSessionEnd(): Boolean {
        if (!held) return false
        held = false
        return true
    }

    val isHeld: Boolean get() = held
}
