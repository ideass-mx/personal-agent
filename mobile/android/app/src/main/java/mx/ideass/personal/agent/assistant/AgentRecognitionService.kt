package mx.ideass.personal.agent.assistant

import android.content.Intent
import android.speech.RecognitionService

/**
 * Stub de RecognitionService exigido por HyperOS para validar el asistente.
 * La escucha real la hace VoiceSession; aquí no hay lógica de STT.
 */
class AgentRecognitionService : RecognitionService() {

    override fun onStartListening(recognizerIntent: Intent, listener: Callback) {
        // Stub: sin reconocimiento real.
    }

    override fun onStopListening(listener: Callback) {
        // Stub: sin reconocimiento real.
    }

    override fun onCancel(listener: Callback) {
        // Stub: sin reconocimiento real.
    }
}
