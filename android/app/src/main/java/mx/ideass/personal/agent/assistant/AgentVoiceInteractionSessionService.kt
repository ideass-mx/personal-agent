package mx.ideass.personal.agent.assistant

import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService

/**
 * Fabrica sesiones de VoiceInteraction cuando el sistema invoca al asistente.
 */
class AgentVoiceInteractionSessionService : VoiceInteractionSessionService() {

    override fun onNewSession(args: Bundle?): VoiceInteractionSession {
        return AgentVoiceInteractionSession(this)
    }
}
