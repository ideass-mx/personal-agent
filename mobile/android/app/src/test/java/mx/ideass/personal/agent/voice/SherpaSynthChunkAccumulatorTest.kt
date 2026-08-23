package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SherpaSynthChunkAccumulatorTest {

    @Test
    fun accumulatesChunksAndReportsAudibleSignal() {
        val acc = SherpaSynthChunkAccumulator()
        assertEquals(1, acc.onChunk(floatArrayOf(0.1f, -0.2f, 0.3f)))
        assertEquals(1, acc.onChunk(floatArrayOf(0.05f)))
        val result = acc.build(sampleRateHz = 22_050)
        assertEquals(2, result.chunkCount)
        assertEquals(4, result.samples.size)
        assertEquals(22_050, result.sampleRateHz)
        assertTrue(result.hasAudibleSignal())
        assertEquals(4.0 / 22_050.0, result.durationSeconds, 1e-9)
    }

    @Test
    fun stopSignalEndsGeneration() {
        val acc = SherpaSynthChunkAccumulator()
        assertEquals(0, acc.onChunk(floatArrayOf(0.5f), continueGeneration = false))
        assertTrue(acc.wasStoppedEarly)
        val result = acc.build(16_000)
        assertEquals(1, result.chunkCount)
        assertTrue(result.hasAudibleSignal())
    }

    @Test
    fun silentBufferIsNotAudible() {
        val result = SherpaSynthResult(
            samples = FloatArray(100) { 0f },
            sampleRateHz = 22_050,
            chunkCount = 1,
        )
        assertFalse(result.hasAudibleSignal())
    }
}
