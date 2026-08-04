package mx.ideass.personal.agent.voice

import android.content.Context
import android.content.Intent
import android.util.Log
import mx.ideass.personal.agent.assistant.AgentVoiceInteractionService

/**
 * Arranca el flujo de voz (racha nueva) desde disparadores fallback:
 * notificación, tile QS, etc. Prefiere VIS si el rol de asistente está vivo;
 * si no, [VoiceLockscreenActivity] (misma superficie que sobre keyguard).
 */
object VoiceLaunch {
    private const val TAG = "VoiceLaunch"

    fun fromFallback(context: Context) {
        val vis = AgentVoiceInteractionService.instance
        if (vis != null) {
            vis.requestShow()
            Log.i(TAG, "Hablar vía VoiceInteractionService")
            return
        }
        val open = VoiceLockscreenActivity.createIntent(context).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        context.startActivity(open)
        Log.i(TAG, "Hablar vía VoiceLockscreenActivity")
    }
}
