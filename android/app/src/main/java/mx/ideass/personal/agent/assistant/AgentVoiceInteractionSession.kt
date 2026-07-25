package mx.ideass.personal.agent.assistant

import android.content.Context
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.util.Log

/**
 * Sesión mínima de VoiceInteraction. Solo registra onShow; la UI Compose
 * se conecta en una pieza posterior (evita el bug de ViewTreeOwners).
 */
class AgentVoiceInteractionSession(
    context: Context,
) : VoiceInteractionSession(context) {

    override fun onShow(args: Bundle?, showFlags: Int) {
        super.onShow(args, showFlags)
        Log.d(TAG, "onShow showFlags=$showFlags")
    }

    private companion object {
        const val TAG = "AgentVoiceSession"
    }
}
