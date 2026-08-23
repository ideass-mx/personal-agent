package mx.ideass.personal.agent.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HiddenTranscriptTitleTest {
    private val titleCurrent =
        "Dame solo un título de máximo 6 palabras para esta conversación. Responde únicamente el título."
    private val titleOld =
        "Dame un título corto para esta charla. Solo el título."
    private val titles = listOf(titleCurrent, titleOld)
    private val style = "Estilo de voz vigente."
    private val sep = "\n\n"

    @Test
    fun hangUp_hidesTitlePromptAndAdjacentReply() {
        val messages = listOf(
            ChatMessage("1", "cómo está el clima", fromUser = true),
            ChatMessage("2", "Parece soleado.", fromUser = false),
            ChatMessage("3", titleCurrent, fromUser = true),
            ChatMessage("4", "Consulta del clima", fromUser = false),
        )
        val visible = HiddenTranscript.forDisplay(
            messages = messages,
            styleInstructions = emptyList(),
            styleSeparator = sep,
            titlePrompts = titles,
        )
        assertEquals(
            listOf("cómo está el clima", "Parece soleado."),
            visible.map { it.text },
        )
    }

    @Test
    fun historyReload_oldTitlePromptStillHidden() {
        // Simula chat.history: turnos crudos con prompt viejo de la lista histórica.
        val remote = listOf(
            ChatMessage("u1", style + sep + "recordatorio dentista", fromUser = true),
            ChatMessage("a1", "Anotado.", fromUser = false),
            ChatMessage("u2", titleOld, fromUser = true),
            ChatMessage("a2", "Dentista", fromUser = false),
        )
        val visible = HiddenTranscript.forDisplay(
            messages = remote,
            styleInstructions = listOf(style),
            styleSeparator = sep,
            titlePrompts = titles,
        )
        assertEquals(
            listOf("recordatorio dentista", "Anotado."),
            visible.map { it.text },
        )
    }

    @Test
    fun nonAdjacentAssistant_neverHiddenByTitleFilter() {
        val messages = listOf(
            ChatMessage("1", titleCurrent, fromUser = true),
            // Respuesta del titulado (adyacente) → se oculta.
            ChatMessage("2", "Titulo corto", fromUser = false),
            ChatMessage("3", "otra pregunta", fromUser = true),
            // Assistant NO contiguo al prompt de título → visible.
            ChatMessage("4", "Titulo corto", fromUser = false),
        )
        val visible = HiddenTranscript.forDisplay(
            messages = messages,
            styleInstructions = emptyList(),
            styleSeparator = sep,
            titlePrompts = titles,
        )
        assertEquals(
            listOf("otra pregunta", "Titulo corto"),
            visible.map { it.text },
        )
    }

    @Test
    fun titlePromptWithoutReply_stillHidden() {
        val messages = listOf(
            ChatMessage("1", "hola", fromUser = true),
            ChatMessage("2", titleCurrent, fromUser = true),
        )
        val visible = HiddenTranscript.forDisplay(
            messages = messages,
            styleInstructions = emptyList(),
            styleSeparator = sep,
            titlePrompts = titles,
        )
        assertEquals(listOf("hola"), visible.map { it.text })
    }

    @Test
    fun isExactPrompt_matchesHistoryListOnly() {
        assertTrue(HiddenTranscript.isExactPrompt(titleOld, titles))
        assertTrue(HiddenTranscript.isExactPrompt("  $titleCurrent  ", titles))
        assertFalse(HiddenTranscript.isExactPrompt("Dame un título inventado", titles))
    }

    @Test
    fun streakCleanAfterStyleAndTitle() {
        val messages = listOf(
            ChatMessage("1", style + sep + "explica quantum", fromUser = true),
            ChatMessage("2", "En pocas palabras…", fromUser = false),
            ChatMessage("3", "amplía", fromUser = true),
            ChatMessage("4", "Detalle…", fromUser = false),
            ChatMessage("5", titleCurrent, fromUser = true),
            ChatMessage("6", "Quantum breve", fromUser = false),
        )
        val visible = HiddenTranscript.forDisplay(
            messages = messages,
            styleInstructions = listOf(style),
            styleSeparator = sep,
            titlePrompts = titles,
        )
        assertEquals(
            listOf("explica quantum", "En pocas palabras…", "amplía", "Detalle…"),
            visible.map { it.text },
        )
    }
}
