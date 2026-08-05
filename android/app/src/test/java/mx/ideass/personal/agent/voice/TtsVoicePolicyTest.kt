package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Locale

class TtsVoicePolicyTest {

    @Test
    fun sortVoices_esMxFirstThenSpanish() {
        val voices = listOf(
            TtsVoicePolicy.voiceInfo("en", Locale.US),
            TtsVoicePolicy.voiceInfo("es-es", Locale.forLanguageTag("es-ES")),
            TtsVoicePolicy.voiceInfo("es-mx", Locale.forLanguageTag("es-MX")),
            TtsVoicePolicy.voiceInfo("fr", Locale.FRANCE),
        )
        val sorted = TtsVoicePolicy.sortVoices(voices)
        assertEquals("es-mx", sorted[0].name)
        assertEquals("es-es", sorted[1].name)
        assertTrue(sorted[0].isEsMx)
        assertTrue(sorted[1].isSpanish)
    }

    @Test
    fun resolveVoiceName_prefersSavedWhenPresent() {
        val result = TtsVoicePolicy.resolveVoiceName(
            availableNames = setOf("a", "b", "piper-es-mx"),
            preferredName = "piper-es-mx",
            localeTagsByName = mapOf(
                "a" to "en-US",
                "b" to "es-ES",
                "piper-es-mx" to "es-MX",
            ),
        )
        assertEquals("piper-es-mx", result.voiceName)
        assertTrue(result.matchedPreferred)
        assertFalse(result.fellBack)
    }

    @Test
    fun resolveVoiceName_fallsBackToEsMxWhenPreferredMissing() {
        val result = TtsVoicePolicy.resolveVoiceName(
            availableNames = setOf("google-es", "piper-mx"),
            preferredName = "gone",
            localeTagsByName = mapOf(
                "google-es" to "es-ES",
                "piper-mx" to "es-MX",
            ),
        )
        assertEquals("piper-mx", result.voiceName)
        assertFalse(result.matchedPreferred)
        assertTrue(result.fellBack)
    }

    @Test
    fun resolveVoiceName_nullWhenNoSpanish() {
        val result = TtsVoicePolicy.resolveVoiceName(
            availableNames = setOf("en1"),
            preferredName = null,
            localeTagsByName = mapOf("en1" to "en-US"),
        )
        assertNull(result.voiceName)
        assertFalse(result.fellBack)
    }

    @Test
    fun voiceInfo_marksEsMx() {
        val info = TtsVoicePolicy.voiceInfo("v1", Locale.forLanguageTag("es-MX"), "local")
        assertTrue(info.isEsMx)
        assertTrue(info.isSpanish)
        assertTrue(info.displayLabel.contains("es-MX"))
        assertTrue(info.displayLabel.contains("local"))
    }
}
