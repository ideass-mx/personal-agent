package mx.ideass.personal.agent.voice

/**
 * Contrato TTS que consume [VoiceSession].
 * Implementaciones: [SherpaTtsEngine] (primario) y [TtsEngine] (Android, fallback).
 */
interface AgentTtsEngine {
    interface Listener {
        fun onReady(available: Boolean)
        fun onDone()
        fun onError(message: String)
    }

    val isReady: Boolean
    fun speak(text: String)
    fun stop()
    fun destroy()
}
