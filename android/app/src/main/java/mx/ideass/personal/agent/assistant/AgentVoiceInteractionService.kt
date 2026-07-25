package mx.ideass.personal.agent.assistant

import android.service.voice.VoiceInteractionService

/**
 * Servicio de interacción de voz del sistema. HyperOS lo valida para
 * ROLE_ASSISTANT; la sesión real se cablea en piezas posteriores.
 */
class AgentVoiceInteractionService : VoiceInteractionService() {

    private var isReady = false

    override fun onReady() {
        super.onReady()
        isReady = true
    }
}
