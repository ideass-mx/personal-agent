package mx.ideass.personal.agent.voice.audio

/**
 * Ruta de salida de audio para TTS / earcons.
 *
 * [Sco] → buds en racha (USAGE_VOICE_COMMUNICATION → STREAM_VOICE_CALL).
 * [Media] → altavoz / A2DP (USAGE_ASSISTANT|MEDIA → STREAM_MUSIC, techo alto).
 */
enum class VoicePlaybackRoute {
    Sco,
    Media,
}

/**
 * Elige la ruta según si SCO está conectado y en uso.
 * Testeable sin AudioManager.
 */
object VoicePlaybackRoutePolicy {
    fun resolve(scoConnected: Boolean): VoicePlaybackRoute =
        if (scoConnected) VoicePlaybackRoute.Sco else VoicePlaybackRoute.Media
}
