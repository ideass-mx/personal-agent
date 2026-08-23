package mx.ideass.personal.agent.assistant

import android.os.Bundle
import android.service.voice.VoiceInteractionService
import android.util.Log

/**
 * Servicio de interacción de voz del sistema. HyperOS lo valida para
 * ROLE_ASSISTANT; la sesión UI vive en [AgentVoiceInteractionSession].
 */
class AgentVoiceInteractionService : VoiceInteractionService() {

    private var isReady = false
    private var pendingShow = false

    override fun onReady() {
        super.onReady()
        instance = this
        isReady = true
        if (pendingShow) {
            pendingShow = false
            showSession(Bundle.EMPTY, 0)
            Log.d(TAG, "AgentVIS: showSession ejecutado")
        }
    }

    override fun onShutdown() {
        instance = null
        super.onShutdown()
    }

    /**
     * Gesto / affordance desde el keyguard. Abrimos la sesión VIS, que lanza
     * [mx.ideass.personal.agent.voice.VoiceLockscreenActivity] (showWhenLocked,
     * sin dismiss del bloqueo) como superficie de la racha.
     */
    override fun onLaunchVoiceAssistFromKeyguard() {
        Log.d(TAG, "AgentVIS: onLaunchVoiceAssistFromKeyguard")
        requestShow()
    }

    fun requestShow() {
        Log.d(TAG, "AgentVIS: requestShow (ready=$isReady)")
        if (isReady) {
            showSession(Bundle.EMPTY, 0)
            Log.d(TAG, "AgentVIS: showSession ejecutado")
        } else {
            pendingShow = true
        }
    }

    companion object {
        private const val TAG = "AgentVIS"

        @Volatile
        var instance: AgentVoiceInteractionService? = null
    }
}
