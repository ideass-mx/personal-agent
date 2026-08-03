package mx.ideass.personal.agent.assistant

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import mx.ideass.personal.agent.voice.VoiceLaunch

/**
 * Activity sin UI (transparente) que recibe VOICE_COMMAND (gesto de buds /
 * asistente) y reenvía la invocación al VoiceInteractionService vivo, o al
 * fallback de [VoiceLaunch]. Soporta keyguard (pantalla bloqueada).
 */
class VoiceCommandTrampolineActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        Log.d(TAG, "Trampoline: received ${intent?.action}")

        val svc = AgentVoiceInteractionService.instance
        if (svc != null) {
            svc.requestShow()
            Log.d(TAG, "Trampoline: requestShow via service instance")
        } else {
            Log.d(TAG, "Trampoline: VIS null, fallback Hablar")
            VoiceLaunch.fromFallback(applicationContext)
        }

        finish()
    }

    private companion object {
        const val TAG = "Trampoline"
    }
}
