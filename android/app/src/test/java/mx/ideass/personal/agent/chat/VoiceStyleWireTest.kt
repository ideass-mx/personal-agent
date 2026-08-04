package mx.ideass.personal.agent.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceStyleWireTest {
    private val style =
        "Estamos conversando por voz: responde breve y conversacional (2-4 frases)."
    private val sep = "\n\n"

    @Test
    fun streakFirstUtterance_wireHasPrepend() {
        val wire = VoiceStyleWire.build(
            utterance = "explica quantum",
            applyStyle = VoiceStyleWire.shouldApply(
                titlesOnHang = true,
                isFirstUserUtterance = true,
            ),
            styleInstruction = style,
            separator = sep,
        )
        assertEquals("$style$sep" + "explica quantum", wire)
    }

    @Test
    fun inConversation_noPrepend() {
        val wire = VoiceStyleWire.build(
            utterance = "explica quantum",
            applyStyle = VoiceStyleWire.shouldApply(
                titlesOnHang = false,
                isFirstUserUtterance = true,
            ),
            styleInstruction = style,
            separator = sep,
        )
        assertEquals("explica quantum", wire)
    }

    @Test
    fun streakSecondUtterance_noPrepend() {
        assertFalse(
            VoiceStyleWire.shouldApply(titlesOnHang = true, isFirstUserUtterance = false),
        )
        val wire = VoiceStyleWire.build(
            utterance = "amplía eso",
            applyStyle = false,
            styleInstruction = style,
            separator = sep,
        )
        assertEquals("amplía eso", wire)
    }
}

class HiddenTranscriptStyleTest {
    private val styleCurrent =
        "Estamos conversando por voz: responde breve y conversacional (2-4 frases)."
    private val styleOld = "Estilo viejo de voz: sé breve."
    private val sep = "\n\n"
    private val styles = listOf(styleCurrent, styleOld)

    @Test
    fun forDisplay_stripsStylePrefix_liveAndHistoryShape() {
        val wire = styleCurrent + sep + "explica quantum"
        val messages = listOf(
            ChatMessage("1", wire, fromUser = true),
            ChatMessage("2", "En corto: es…", fromUser = false),
        )
        val visible = HiddenTranscript.forDisplay(
            messages = messages,
            styleInstructions = styles,
            styleSeparator = sep,
            titlePrompts = emptyList(),
        )
        assertEquals(listOf("explica quantum", "En corto: es…"), visible.map { it.text })
    }

    @Test
    fun forDisplay_stripsOldStyleFromHistoryList() {
        val wire = styleOld + sep + "hola"
        val visible = HiddenTranscript.forDisplay(
            messages = listOf(ChatMessage("1", wire, fromUser = true)),
            styleInstructions = styles,
            styleSeparator = sep,
            titlePrompts = emptyList(),
        )
        assertEquals("hola", visible.single().text)
    }

    @Test
    fun strip_leavesPlainUtteranceUntouched() {
        assertEquals(
            "hola",
            HiddenTranscript.stripStylePrefix("hola", styles, sep),
        )
    }

    @Test
    fun shouldApply_onlyFirstStreakUtterance() {
        assertTrue(VoiceStyleWire.shouldApply(true, true))
        assertFalse(VoiceStyleWire.shouldApply(true, false))
        assertFalse(VoiceStyleWire.shouldApply(false, true))
        assertFalse(VoiceStyleWire.shouldApply(false, false))
    }
}
