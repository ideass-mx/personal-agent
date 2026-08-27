package mx.ideass.personal.agent.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HubConfirmUxTest {

    @Test
    fun remainingSeconds_countsDownFromTimeout() {
        val received = 1_000_000L
        assertEquals(60, HubConfirmUx.remainingSeconds(received, nowMs = received))
        assertEquals(42, HubConfirmUx.remainingSeconds(received, nowMs = received + 18_000L))
        assertEquals(0, HubConfirmUx.remainingSeconds(received, nowMs = received + 60_000L))
        assertEquals(0, HubConfirmUx.remainingSeconds(received, nowMs = received + 90_000L))
    }

    @Test
    fun locallyExpired_neverImpliesApprove() {
        val received = 100L
        assertFalse(HubConfirmUx.isLocallyExpired(received, nowMs = received + 1_000L))
        assertTrue(HubConfirmUx.isLocallyExpired(received, nowMs = received + HubConfirmUx.TIMEOUT_MS))
    }

    @Test
    fun sanitize_redactsTokenLikeFields() {
        val raw = """{"path":"a.txt","token":"secret-value","password":"x"}"""
        val out = HubConfirmUx.sanitizeInputSummary(raw)
        assertTrue(out.contains("***"))
        assertFalse(out.contains("secret-value"))
        assertTrue(out.contains("path"))
    }

    @Test
    fun sanitize_truncatesLongInput() {
        val raw = "x".repeat(900)
        val out = HubConfirmUx.sanitizeInputSummary(raw, maxLen = 800)
        assertTrue(out.endsWith("…"))
        assertEquals(801, out.length)
    }
}
