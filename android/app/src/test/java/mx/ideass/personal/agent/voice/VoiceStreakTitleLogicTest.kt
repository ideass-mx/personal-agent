package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceStreakTitleLogicTest {
    @Test
    fun parseAgentTitle_trimsQuotesAndPeriod() {
        assertEquals(
            "Consulta del clima",
            VoiceStreakTitleLogic.parseAgentTitle("  \"Consulta del clima\".  "),
        )
        assertEquals(
            "Recordatorio médico",
            VoiceStreakTitleLogic.parseAgentTitle("«Recordatorio médico»"),
        )
    }

    @Test
    fun parseAgentTitle_takesFirstLine() {
        assertEquals(
            "Ideas de cena",
            VoiceStreakTitleLogic.parseAgentTitle("Ideas de cena\n\nAquí va un párrafo largo…"),
        )
    }

    @Test
    fun parseAgentTitle_rejectsEmptyOrRamble() {
        assertNull(VoiceStreakTitleLogic.parseAgentTitle("   "))
        assertNull(VoiceStreakTitleLogic.parseAgentTitle(null))
        assertNull(
            VoiceStreakTitleLogic.parseAgentTitle(
                "Este es un párrafo muy largo que claramente no es un título corto de seis palabras sino una explicación completa",
            ),
        )
    }

    @Test
    fun fallbackTitle_truncatesAround40Chars() {
        assertEquals("hola", VoiceStreakTitleLogic.fallbackTitle("hola"))
        assertNull(VoiceStreakTitleLogic.fallbackTitle("  "))
        assertNull(VoiceStreakTitleLogic.fallbackTitle(null))
        val long = "quiero saber cómo está el clima en la ciudad de México hoy por la tarde"
        val fb = VoiceStreakTitleLogic.fallbackTitle(long)!!
        assertTrue(fb.length <= VoiceStreakTitleLogic.FALLBACK_MAX_CHARS)
        assertFalse(fb.endsWith(" "))
    }

    @Test
    fun isStillProvisional_onlyExactMatch() {
        assertTrue(
            VoiceStreakTitleLogic.isStillProvisional(
                "Conversación de voz — 21:05",
                "Conversación de voz — 21:05",
            ),
        )
        assertFalse(
            VoiceStreakTitleLogic.isStillProvisional(
                "Consulta del clima",
                "Conversación de voz — 21:05",
            ),
        )
        assertFalse(VoiceStreakTitleLogic.isStillProvisional(null, "Conversación de voz — 21:05"))
    }

    @Test
    fun resolveTitle_prefersAgentThenFallback() {
        assertEquals(
            "Clima",
            VoiceStreakTitleLogic.resolveTitle("Clima", "cómo está el clima"),
        )
        assertEquals(
            "cómo está el clima",
            VoiceStreakTitleLogic.resolveTitle(null, "cómo está el clima"),
        )
        assertNull(VoiceStreakTitleLogic.resolveTitle(null, null))
    }
}
