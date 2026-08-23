package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * Tests puros del resolver de voces instaladas (sin Context Android):
 * reutiliza la misma lógica de layout que [NeuralVoicesStore].
 */
class NeuralVoicesResolveTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun resolveActiveOrAny_prefersCp1IdWhenPresent() {
        val root = tmp.newFolder(NeuralVoicesStore.ROOT_DIR_NAME)
        writePiper(File(root, "other-voice"), "other.onnx")
        writePiper(
            File(root, NeuralVoicesStore.CP1_TEST_VOICE_ID),
            NeuralVoicesStore.CP1_TEST_ONNX_NAME,
        )

        val cp1 = NeuralVoiceModel.resolvePiper(
            id = NeuralVoicesStore.CP1_TEST_VOICE_ID,
            rootDir = File(root, NeuralVoicesStore.CP1_TEST_VOICE_ID),
            preferredOnnxName = NeuralVoicesStore.CP1_TEST_ONNX_NAME,
        )
        assertNotNull(cp1)

        // Simula resolveActiveOrAnyInstalled: CP1 primero.
        val resolved = cp1 ?: root.listFiles { f -> f.isDirectory }
            ?.sortedBy { it.name }
            ?.firstNotNullOfOrNull { NeuralVoiceModel.resolvePiper(it.name, it) }
        assertEquals(NeuralVoicesStore.CP1_TEST_VOICE_ID, resolved!!.id)
    }

    @Test
    fun resolveActiveOrAny_fallsBackToFirstComplete() {
        val root = tmp.newFolder(NeuralVoicesStore.ROOT_DIR_NAME)
        writePiper(File(root, "alpha-voice"), "a.onnx")
        File(root, "broken").mkdirs() // incompleto

        val resolved = root.listFiles { f -> f.isDirectory }
            ?.sortedBy { it.name }
            ?.firstNotNullOfOrNull { NeuralVoiceModel.resolvePiper(it.name, it) }
        assertEquals("alpha-voice", resolved!!.id)
    }

    @Test
    fun emptyRoot_returnsNull() {
        val root = tmp.newFolder("empty-voices")
        val resolved = root.listFiles { f -> f.isDirectory }
            ?.sortedBy { it.name }
            ?.firstNotNullOfOrNull { NeuralVoiceModel.resolvePiper(it.name, it) }
        assertNull(resolved)
    }

    private fun writePiper(dir: File, onnxName: String) {
        dir.mkdirs()
        File(dir, onnxName).writeBytes(byteArrayOf(1, 2, 3, 4))
        File(dir, "tokens.txt").writeText("t")
        File(dir, "espeak-ng-data").mkdirs()
        File(dir, "espeak-ng-data/phontab").writeBytes(byteArrayOf(1))
    }
}
