package mx.ideass.personal.agent.voice

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import mx.ideass.personal.agent.app.MainActivity
import mx.ideass.personal.agent.assistant.AgentVoiceInteractionService
import mx.ideass.personal.agent.service.AgentService

/**
 * Arranca el flujo de voz (racha nueva) desde disparadores fallback:
 * notificación, tile QS, etc. Prefiere VIS si el rol de asistente está vivo.
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
        val open = Intent(context, MainActivity::class.java).apply {
            action = AgentService.ACTION_HABLAR
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            // MainActivity aplica showWhenLocked al recibir ACTION_HABLAR.
        }
        context.startActivity(open)
        Log.i(TAG, "Hablar vía MainActivity")
    }
}
