package mx.ideass.personal.agent.voice.audio

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack

/**
 * Formato único de la sesión de voz: PCM 16 kHz mono por el path SCO
 * ([AudioAttributes.USAGE_VOICE_COMMUNICATION] → STREAM_VOICE_CALL).
 * Evita createOrUpdatePatch al mezclar 48 kHz (TTS nativo) con SCO 16 kHz.
 */
object VoiceAudioPath {
    const val SAMPLE_RATE_HZ = 16_000

    fun attributes(
        contentType: Int = AudioAttributes.CONTENT_TYPE_SPEECH,
    ): AudioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
        .setContentType(contentType)
        .build()

    fun pcmMonoFormat(): AudioFormat = AudioFormat.Builder()
        .setSampleRate(SAMPLE_RATE_HZ)
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
        .build()

    fun minBufferBytes(): Int = AudioTrack.getMinBufferSize(
        SAMPLE_RATE_HZ,
        AudioFormat.CHANNEL_OUT_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
    )
}
