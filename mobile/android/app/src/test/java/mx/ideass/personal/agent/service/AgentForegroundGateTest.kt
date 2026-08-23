package mx.ideass.personal.agent.service

import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentForegroundGateTest {

    @After
    fun tearDown() {
        AgentForegroundGate.markInactive()
    }

    @Test
    fun shouldSkipStart_falseWhenInactive() {
        AgentForegroundGate.markInactive()
        assertFalse(AgentForegroundGate.shouldSkipStart())
    }

    @Test
    fun shouldSkipStart_trueWhenActive_secondStartIsNoOp() {
        AgentForegroundGate.markInactive()
        assertFalse(AgentForegroundGate.shouldSkipStart())

        AgentForegroundGate.markActive()
        assertTrue(AgentForegroundGate.shouldSkipStart())
        // Un segundo "start" con el gate activo sigue omitiéndose.
        assertTrue(AgentForegroundGate.shouldSkipStart())
    }

    @Test
    fun markInactive_allowsStartAgain() {
        AgentForegroundGate.markActive()
        assertTrue(AgentForegroundGate.shouldSkipStart())

        AgentForegroundGate.markInactive()
        assertFalse(AgentForegroundGate.shouldSkipStart())
    }
}
