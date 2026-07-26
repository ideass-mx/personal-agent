package mx.ideass.personal.agent.assistant

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log

/**
 * Activity sin UI (transparente) que recibe VOICE_COMMAND (triple toque de los
 * auriculares Bluetooth) y reenvía la invocación al asistente del sistema
 * pidiendo showSession() al VoiceInteractionService vivo. No monta UI propia:
 * rebota hacia la sesión de asistente y se cierra.
 */
class VoiceCommandTrampolineActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "Trampoline: received VOICE_COMMAND")

        val svc = AgentVoiceInteractionService.instance
        if (svc != null) {
            svc.requestShow()
            Log.d(TAG, "Trampoline: requestShow via service instance")
        } else {
            Log.d(TAG, "Trampoline: service instance null, fallback")
            val assist = Intent(Intent.ACTION_ASSIST).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(assist)
        }

        finish()
    }

    private companion object {
        const val TAG = "Trampoline"
    }
}
