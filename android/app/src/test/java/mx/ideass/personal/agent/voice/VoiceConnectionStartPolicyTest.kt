package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Garantiza que NoNetwork solo sale cuando el gate se rindió — nunca por un
 * chequeo paralelo de isConnected ni por fallar el create de racha.
 */
class VoiceConnectionStartPolicyTest {

    @Test
    fun gateFailed_isOnlyPathToNoNetwork() {
        assertEquals(
            VoiceErrorKind.NoNetwork,
            VoiceConnectionStartPolicy.errorAfterGate(
                gateOk = false,
                streakOpened = null,
                createStreak = true,
            ),
        )
        // Aunque el create hubiera "fallado", sin gate ok el error es red.
        assertEquals(
            VoiceErrorKind.NoNetwork,
            VoiceConnectionStartPolicy.errorAfterGate(
                gateOk = false,
                streakOpened = true,
                createStreak = true,
            ),
        )
    }

    @Test
    fun gateOk_streakCreateFailed_isStreakUnavailable_notNoNetwork() {
        assertEquals(
            VoiceErrorKind.StreakUnavailable,
            VoiceConnectionStartPolicy.errorAfterGate(
                gateOk = true,
                streakOpened = false,
                createStreak = true,
            ),
        )
        assertEquals(
            VoiceErrorKind.StreakUnavailable,
            VoiceConnectionStartPolicy.errorAfterGate(
                gateOk = true,
                streakOpened = null,
                createStreak = true,
            ),
        )
    }

    @Test
    fun gateOk_streakOpened_continues() {
        assertNull(
            VoiceConnectionStartPolicy.errorAfterGate(
                gateOk = true,
                streakOpened = true,
                createStreak = true,
            ),
        )
    }

    @Test
    fun gateOk_useExisting_ignoresStreakOpened() {
        assertNull(
            VoiceConnectionStartPolicy.errorAfterGate(
                gateOk = true,
                streakOpened = null,
                createStreak = false,
            ),
        )
    }

    @Test
    fun delayedReconnectStillUsesGateResult_notRawSocket() {
        // Simula: socket caído al invocar; gate espera ~9 s y reporta ok.
        // La política no tiene reloj propio — solo el booleano del gate.
        val gateOkAfterNineSeconds = true
        assertNull(
            VoiceConnectionStartPolicy.errorAfterGate(
                gateOk = gateOkAfterNineSeconds,
                streakOpened = true,
                createStreak = true,
            ),
        )
    }
}
