package mx.ideass.personal.agent.assistant

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log

/**
 * Activity sin UI (transparente) que recibe VOICE_COMMAND (triple toque de los
 * auriculares Bluetooth) y reenvía la invocación al asistente del sistema
 * mediante ACTION_ASSIST, la misma ruta que dispara el botón de encendido.
 * No monta UI propia: rebota hacia la sesión de asistente y se cierra.
 */
class VoiceCommandTrampolineActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "Trampoline: received VOICE_COMMAND")

        Log.d(TAG, "Trampoline: dispatching to assistant")
        val assist = Intent(Intent.ACTION_ASSIST).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(assist)

        Log.d(TAG, "Trampoline: finish")
        finish()
    }

    private companion object {
        const val TAG = "AgentVoiceSession"
    }
}
