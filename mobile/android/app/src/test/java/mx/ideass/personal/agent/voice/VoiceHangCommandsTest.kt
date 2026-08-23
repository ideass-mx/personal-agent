package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceHangCommandsTest {
    private val commands = listOf("listo", "adiós", "termina", "gracias")

    @Test
    fun exactMatch_hangs() {
        assertTrue(VoiceHangCommands.isHangCommand("listo", commands))
        assertTrue(VoiceHangCommands.isHangCommand("Adiós!", commands))
        assertTrue(VoiceHangCommands.isHangCommand("  TERMINA  ", commands))
        assertTrue(VoiceHangCommands.isHangCommand("gracias.", commands))
    }

    @Test
    fun phraseContainingCommand_doesNotHang() {
        assertFalse(VoiceHangCommands.isHangCommand("está listo el reporte", commands))
        assertFalse(VoiceHangCommands.isHangCommand("muchas gracias por todo", commands))
        assertFalse(VoiceHangCommands.isHangCommand("termina la reunión mañana", commands))
    }

    @Test
    fun normalize_stripsPunctAndCase() {
        assertEquals("adiós", VoiceHangCommands.normalize("¡Adiós!"))
        assertEquals("listo", VoiceHangCommands.normalize("  Listo.  "))
    }
}
