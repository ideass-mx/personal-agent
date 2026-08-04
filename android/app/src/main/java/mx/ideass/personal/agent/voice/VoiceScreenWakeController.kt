package mx.ideass.personal.agent.voice

import android.content.Context
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Dueño de `Agente:voz-pantalla`: se adquiere **una vez** cuando racha activa
 * ∧ superficie visible ([VoiceLockscreenActivity]), y se sostiene hasta
 * hangUp / onStop / onDestroy / error fatal. Independiente del wake lock
 * parcial `Agente:respuesta` (streaming) y de las transiciones
 * Listening→Thinking→Speaking.
 */
@Singleton
class VoiceScreenWakeController @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val gate = VoiceScreenWakeGate()
    private val wakeLock = VoiceScreenWakeLock(context)

    val isHeld: Boolean get() = wakeLock.isHeld

    /** Llamar desde [VoiceLockscreenActivity] en onStart / onStop / onDestroy. */
    fun setWindowVisible(visible: Boolean) {
        if (!gate.setWindowVisible(visible)) return
        applyLock()
    }

    /**
     * Llamar desde [VoiceSession] al activar/desactivar la racha
     * (start / hangUp / stop / error) — nunca en cambios de turno.
     */
    fun setStreakActive(active: Boolean) {
        if (!gate.setStreakActive(active)) return
        applyLock()
    }

    /** Cinturón en onDestroy de la superficie. */
    fun forceRelease() {
        gate.forceRelease()
        wakeLock.release()
        Log.d(TAG, "forceRelease")
    }

    private fun applyLock() {
        wakeLock.sync(gate.isHeld)
        Log.d(
            TAG,
            "held=${gate.isHeld} window=${gate.isWindowVisible} streak=${gate.isStreakActive}",
        )
    }

    companion object {
        private const val TAG = "VoiceScreenWake"
    }
}
