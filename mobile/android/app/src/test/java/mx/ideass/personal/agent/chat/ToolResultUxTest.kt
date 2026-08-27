package mx.ideass.personal.agent.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ToolResultUxTest {

    @Test
    fun sanitize_redactsSecrets() {
        val raw = """{"path":"a.txt","token":"secret","HUB_TOKEN":"x"}"""
        val out = ToolResultUx.sanitize(raw)
        assertTrue(out.contains("***"))
        assertFalse(out.contains("secret"))
    }

    @Test
    fun sanitize_truncatesLongText() {
        val raw = "x".repeat(5_000)
        val out = ToolResultUx.sanitize(raw, maxLen = 100)
        assertTrue(out.endsWith("…"))
        assertEquals(101, out.length)
    }

    @Test
    fun humanize_filesystemList() {
        val json = """{"entries":[{"name":"docs"},{"name":"report.txt"}]}"""
        val out = ToolResultUx.humanizeRawDump(json, "filesystem.list")
        assertTrue(out.contains("Explorar archivos"))
        assertTrue(out.contains("docs"))
    }

    @Test
    fun humanize_filesystemWrite() {
        val json = """{"path":"reporte.txt","ok":true}"""
        val out = ToolResultUx.humanizeRawDump(json, "filesystem.write")
        assertTrue(out.contains("reporte.txt"))
    }

    @Test
    fun humanize_processExecute_stdout() {
        val json = """{"stdout":"hello world","stderr":"","exitCode":0}"""
        val out = ToolResultUx.humanizeRawDump(json, "process.execute")
        assertTrue(out.contains("hello world"))
    }

    @Test
    fun excelRead_includesWindowsNote() {
        val out = ToolResultUx.presentInConversation("{}", "office.excel.read")
        assertTrue(out.contains("Excel"))
        assertTrue(out.contains("Windows"))
    }

    @Test
    fun presentInConversation_keepsNaturalLanguage() {
        val text = "Listo. Creé reporte.txt correctamente."
        assertEquals(text, ToolResultUx.presentInConversation(text))
    }

    @Test
    fun looksLikeRawToolDump_detectsJson() {
        assertTrue(ToolResultUx.looksLikeRawToolDump("""{"a":1}"""))
        assertFalse(ToolResultUx.looksLikeRawToolDump("Texto normal"))
    }
}
