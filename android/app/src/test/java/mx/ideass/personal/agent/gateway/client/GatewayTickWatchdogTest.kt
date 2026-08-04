package mx.ideass.personal.agent.gateway.client

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GatewayTickWatchdogTest {

    @Test
    fun silenceLimit_isDoubleInterval() {
        assertEquals(60_000L, GatewayTickWatchdog.silenceLimitMs(30_000L))
        assertEquals(2_000L, GatewayTickWatchdog.silenceLimitMs(500L)) // floor 1s → 2s
    }

    @Test
    fun shouldTimeout_onlyAfterDoubleInterval() {
        assertFalse(
            GatewayTickWatchdog.shouldTimeout(
                nowElapsedMs = 60_000L,
                lastTickElapsedMs = 0L,
                tickIntervalMs = 30_000L,
            ),
        )
        assertTrue(
            GatewayTickWatchdog.shouldTimeout(
                nowElapsedMs = 60_001L,
                lastTickElapsedMs = 0L,
                tickIntervalMs = 30_000L,
            ),
        )
    }

    @Test
    fun closeCode_matchesContract() {
        assertEquals(4000, GatewayTickWatchdog.CLOSE_CODE)
        assertEquals(4000, mx.ideass.personal.agent.gateway.transport.GatewaySocket.CODE_TICK_TIMEOUT)
    }
}
