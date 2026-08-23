package mx.ideass.personal.agent.voice

import android.content.Context
import android.os.PowerManager
import android.util.Log

/**
 * Wake lock de **pantalla** (`Agente:voz-pantalla`).
 *
 * Workaround HyperOS: con la ventana sobre el keyguard
 * (`FLAG_SHOW_WHEN_LOCKED`), el sistema ignora `FLAG_KEEP_SCREEN_ON`.
 * Ciclo de vida: [VoiceScreenWakeController] — racha ∧ ventana; **no** el
 * streaming parcial `Agente:respuesta` ni los turnos de voz.
 *
 * `SCREEN_BRIGHT_WAKE_LOCK` está deprecado a favor del flag que HyperOS
 * ignora; la deprecación es aceptable aquí.
 */
class VoiceScreenWakeLock(
    context: Context,
) {
    private val appContext = context.applicationContext
    private var wakeLock: PowerManager.WakeLock? = null

    val isHeld: Boolean
        get() = wakeLock?.isHeld == true

    fun sync(wantHeld: Boolean) {
        if (wantHeld) acquire() else release()
    }

    @Suppress("DEPRECATION")
    private fun acquire() {
        val existing = wakeLock
        if (existing?.isHeld == true) return
        val pm = appContext.getSystemService(PowerManager::class.java) ?: return
        val lock = pm.newWakeLock(
            PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
            TAG_LOCK,
        ).apply {
            setReferenceCounted(false)
            // Red de seguridad si un camino de release fallara.
            acquire(MAX_HOLD_MS)
        }
        wakeLock = lock
        Log.d(TAG, "screen wake lock acquired")
    }

    fun release() {
        val lock = wakeLock ?: return
        wakeLock = null
        if (lock.isHeld) {
            runCatching { lock.release() }
                .onFailure { Log.w(TAG, "release falló: ${it.message}") }
        }
        Log.d(TAG, "screen wake lock released")
    }

    companion object {
        private const val TAG = "VoiceScreenWake"
        private const val TAG_LOCK = "Agente:voz-pantalla"
        /** Tope absoluto; la racha normal libera mucho antes. */
        private const val MAX_HOLD_MS = 60 * 60 * 1000L
    }
}
