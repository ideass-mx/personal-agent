package mx.ideass.personal.agent.voice.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack

/**
 * Formato y atributos de reproducción de voz.
 *
 * - Path [VoicePlaybackRoute.Sco]: 16 kHz + [USAGE_VOICE_COMMUNICATION]
 *   (rutea a SCO / STREAM_VOICE_CALL).
 * - Path [VoicePlaybackRoute.Media]: sample rate nativo + ASSISTANT/MEDIA
 *   (STREAM_MUSIC, techo de volumen alto por altavoz).
 */
object VoiceAudioPath {
    /** Sample rate del path SCO (buds). */
    const val SAMPLE_RATE_HZ = 16_000

    /** usage para ruta Media: "assistant" (default) o "media". */
    fun mediaUsageFromConfig(name: String): Int = when (name.trim().lowercase()) {
        "media" -> AudioAttributes.USAGE_MEDIA
        else -> AudioAttributes.USAGE_ASSISTANT
    }

    fun usageFor(
        route: VoicePlaybackRoute,
        mediaUsage: Int = AudioAttributes.USAGE_ASSISTANT,
    ): Int = when (route) {
        VoicePlaybackRoute.Sco -> AudioAttributes.USAGE_VOICE_COMMUNICATION
        VoicePlaybackRoute.Media -> mediaUsage
    }

    fun attributes(
        route: VoicePlaybackRoute,
        mediaUsage: Int = AudioAttributes.USAGE_ASSISTANT,
        contentType: Int = AudioAttributes.CONTENT_TYPE_SPEECH,
    ): AudioAttributes = AudioAttributes.Builder()
        .setUsage(usageFor(route, mediaUsage))
        .setContentType(contentType)
        .build()

    /** Sample rate de reproducción según ruta. */
    fun playSampleRateHz(route: VoicePlaybackRoute, nativeRateHz: Int): Int = when (route) {
        VoicePlaybackRoute.Sco -> SAMPLE_RATE_HZ
        VoicePlaybackRoute.Media -> nativeRateHz.coerceAtLeast(1)
    }

    fun needsResample(route: VoicePlaybackRoute, nativeRateHz: Int): Boolean =
        route == VoicePlaybackRoute.Sco && nativeRateHz != SAMPLE_RATE_HZ

    fun pcmMonoFormat(sampleRateHz: Int = SAMPLE_RATE_HZ): AudioFormat = AudioFormat.Builder()
        .setSampleRate(sampleRateHz)
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
        .build()

    fun minBufferBytes(sampleRateHz: Int = SAMPLE_RATE_HZ): Int = AudioTrack.getMinBufferSize(
        sampleRateHz,
        AudioFormat.CHANNEL_OUT_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
    )
}
