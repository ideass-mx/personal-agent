package mx.ideass.personal.agent.capabilities

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentCapabilityUxTest {

    @Test
    fun mapping_filesystemRead_humanLabel() {
        assertEquals("Leer archivos", AgentCapabilityUx.labelFor("filesystem.read"))
    }

    @Test
    fun mapping_filesystemWrite_humanLabel() {
        assertEquals("Escribir archivos", AgentCapabilityUx.labelFor("filesystem.write"))
    }

    @Test
    fun mapping_processExecute_humanLabel() {
        assertEquals("Ejecutar comandos", AgentCapabilityUx.labelFor("process.execute"))
    }

    @Test
    fun mapping_officeExcelRead_humanLabel() {
        assertEquals("Leer Excel", AgentCapabilityUx.labelFor("office.excel.read"))
    }

    @Test
    fun mapping_officeExcelWrite_humanLabel() {
        assertEquals("Modificar Excel", AgentCapabilityUx.labelFor("office.excel.write"))
    }

    @Test
    fun internalTools_notVisibleInProduct() {
        val hidden = listOf(
            "agent.echo",
            "math.add",
            "math.subtract",
            "math.multiply",
            "math.divide",
            "diagnostics.ping",
            "system.info",
            "customer.demo",
        )
        for (tool in hidden) {
            assertFalse(
                "Expected $tool to be hidden",
                AgentCapabilityUx.isVisibleInProduct(tool),
            )
            assertTrue(
                "Expected $tool to be marked internal",
                AgentCapabilityUx.isHiddenInternalTool(tool),
            )
            assertNull(AgentCapabilityUx.presentationFor(tool))
        }
    }

    @Test
    fun requiresConfirmation_writeAndExecuteAndExcelWrite() {
        assertTrue(AgentCapabilityUx.presentationFor("filesystem.write")!!.requiresConfirmation)
        assertTrue(AgentCapabilityUx.presentationFor("filesystem.delete")!!.requiresConfirmation)
        assertTrue(AgentCapabilityUx.presentationFor("process.execute")!!.requiresConfirmation)
        assertTrue(AgentCapabilityUx.presentationFor("office.excel.write")!!.requiresConfirmation)
    }

    @Test
    fun requiresConfirmation_readOnly_false() {
        assertFalse(AgentCapabilityUx.presentationFor("filesystem.search")!!.requiresConfirmation)
        assertFalse(AgentCapabilityUx.presentationFor("filesystem.read")!!.requiresConfirmation)
        assertFalse(AgentCapabilityUx.presentationFor("filesystem.list")!!.requiresConfirmation)
        assertFalse(AgentCapabilityUx.presentationFor("office.excel.read")!!.requiresConfirmation)
    }

    @Test
    fun mvpCapabilities_showsExactlyEight() {
        val caps = AgentCapabilityUx.mvpCapabilities()
        assertEquals(8, caps.size)
        assertEquals(
            setOf(
                "filesystem.search",
                "filesystem.read",
                "filesystem.list",
                "filesystem.write",
                "filesystem.delete",
                "process.execute",
                "office.excel.read",
                "office.excel.write",
            ),
            caps.map { it.toolName }.toSet(),
        )
    }

    @Test
    fun excelCapabilities_haveWindowsPlatformHint() {
        assertEquals("Solo Windows", AgentCapabilityUx.presentationFor("office.excel.read")!!.platformHint)
        assertEquals("Solo Windows", AgentCapabilityUx.presentationFor("office.excel.write")!!.platformHint)
    }

    @Test
    fun hitlLabelForTechnicalToolName() {
        assertEquals("Escribir archivos", AgentCapabilityUx.labelFor("filesystem.write"))
        assertEquals("Ejecutar comandos", AgentCapabilityUx.labelFor("process.execute"))
        assertEquals("Modificar Excel", AgentCapabilityUx.labelFor("office.excel.write"))
    }
}
