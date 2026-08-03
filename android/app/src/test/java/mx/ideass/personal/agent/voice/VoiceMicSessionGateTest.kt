package mx.ideass.personal.agent.voice

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceMicSessionGateTest {
    @Test
    fun acquireOnce_releaseOnce() {
        val gate = VoiceMicSessionGate()
        assertTrue(gate.onSessionStart())
        assertTrue(gate.isHeld)
        assertFalse(gate.onSessionStart())
        assertTrue(gate.onSessionEnd())
        assertFalse(gate.isHeld)
        assertFalse(gate.onSessionEnd())
    }

    @Test
    fun restartAfterRelease_acquiresAgain() {
        val gate = VoiceMicSessionGate()
        assertTrue(gate.onSessionStart())
        assertTrue(gate.onSessionEnd())
        assertTrue(gate.onSessionStart())
        assertTrue(gate.isHeld)
    }
}
