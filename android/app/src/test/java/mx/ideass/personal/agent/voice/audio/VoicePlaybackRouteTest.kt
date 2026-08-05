package mx.ideass.personal.agent.voice.audio

import android.media.AudioAttributes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VoicePlaybackRoutePolicyTest {

    @Test
    fun scoConnected_selectsSco() {
        assertEquals(
            VoicePlaybackRoute.Sco,
            VoicePlaybackRoutePolicy.resolve(scoConnected = true),
        )
    }

    @Test
    fun scoDisconnected_selectsMedia() {
        assertEquals(
            VoicePlaybackRoute.Media,
            VoicePlaybackRoutePolicy.resolve(scoConnected = false),
        )
    }
}

class VoiceAudioPathRouteTest {

    @Test
    fun sco_usageIsVoiceCommunication() {
        assertEquals(
            AudioAttributes.USAGE_VOICE_COMMUNICATION,
            VoiceAudioPath.usageFor(VoicePlaybackRoute.Sco),
        )
    }

    @Test
    fun media_defaultUsageIsAssistant() {
        assertEquals(
            AudioAttributes.USAGE_ASSISTANT,
            VoiceAudioPath.usageFor(VoicePlaybackRoute.Media),
        )
    }

    @Test
    fun media_canSelectUsageMedia() {
        assertEquals(
            AudioAttributes.USAGE_MEDIA,
            VoiceAudioPath.usageFor(
                VoicePlaybackRoute.Media,
                mediaUsage = AudioAttributes.USAGE_MEDIA,
            ),
        )
    }

    @Test
    fun mediaUsageFromConfig_parses() {
        assertEquals(
            AudioAttributes.USAGE_ASSISTANT,
            VoiceAudioPath.mediaUsageFromConfig("assistant"),
        )
        assertEquals(
            AudioAttributes.USAGE_MEDIA,
            VoiceAudioPath.mediaUsageFromConfig("media"),
        )
        assertEquals(
            AudioAttributes.USAGE_ASSISTANT,
            VoiceAudioPath.mediaUsageFromConfig("unknown"),
        )
    }

    @Test
    fun playSampleRate_scoForces16k_mediaKeepsNative() {
        assertEquals(16_000, VoiceAudioPath.playSampleRateHz(VoicePlaybackRoute.Sco, 22_050))
        assertEquals(22_050, VoiceAudioPath.playSampleRateHz(VoicePlaybackRoute.Media, 22_050))
    }

    @Test
    fun needsResample_onlyOnScoWithMismatch() {
        assertTrue(VoiceAudioPath.needsResample(VoicePlaybackRoute.Sco, 22_050))
        assertFalse(VoiceAudioPath.needsResample(VoicePlaybackRoute.Sco, 16_000))
        assertFalse(VoiceAudioPath.needsResample(VoicePlaybackRoute.Media, 22_050))
    }
}
