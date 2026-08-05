package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceTurnPolicyTest {
    private val hangCommands = listOf("listo", "adiós", "termina", "gracias")
    private val copy = VoiceErrorCopy(
        noNetworkSpoken = "sin red",
        noNetworkUi = "Sin conexión",
        noReplySpoken = "sin respuesta",
        noReplyUi = "Sin respuesta a tiempo",
        streakUnavailableSpoken = "sin racha",
        streakUnavailableUi = "No pude abrir",
        sttUnavailableSpoken = "sin stt",
        sttUnavailableUi = "STT no disponible",
        ttsUnavailableSpoken = "sin tts",
        ttsUnavailableUi = "TTS no disponible",
    )

    @Test
    fun afterUtterance_empty_continuesListening() {
        val decision = VoiceTurnPolicy.afterUtterance(
            text = "   ",
            streakReady = true,
            hangCommands = hangCommands,
        )
        assertEquals(VoiceTurnDecision.ContinueListening, decision)
    }

    @Test
    fun afterUtterance_hangCommand_exact_hangs() {
        assertEquals(
            VoiceTurnDecision.Hang,
            VoiceTurnPolicy.afterUtterance(
                text = "listo",
                streakReady = true,
                hangCommands = hangCommands,
            ),
        )
        assertEquals(
            VoiceTurnDecision.Hang,
            VoiceTurnPolicy.afterUtterance(
                text = "¡Adiós!",
                streakReady = false,
                hangCommands = hangCommands,
            ),
        )
    }

    @Test
    fun afterUtterance_hangCommand_contains_doesNotHang() {
        assertEquals(
            VoiceTurnDecision.Send("está listo el reporte"),
            VoiceTurnPolicy.afterUtterance(
                text = "está listo el reporte",
                streakReady = true,
                hangCommands = hangCommands,
            ),
        )
    }

    @Test
    fun afterUtterance_withoutStreak_audibleError() {
        val decision = VoiceTurnPolicy.afterUtterance(
            text = "hola",
            streakReady = false,
            hangCommands = hangCommands,
        )
        assertEquals(
            VoiceTurnDecision.AudibleError(VoiceErrorKind.StreakUnavailable),
            decision,
        )
        assertEquals("sin racha", copy.spoken(VoiceErrorKind.StreakUnavailable))
    }

    @Test
    fun afterUtterance_withStreak_sendsEvenWhenCallerWillQueueOffline() {
        val decision = VoiceTurnPolicy.afterUtterance(
            text = "  hola  ",
            streakReady = true,
            hangCommands = hangCommands,
        )
        assertEquals(VoiceTurnDecision.Send("hola"), decision)
    }

    @Test
    fun afterReplyWait_timeout_audibleNoReply() {
        val result = VoiceTurnPolicy.afterReplyWait(timedOut = true, reply = null)
        assertEquals(
            VoiceWaitResult.AudibleError(VoiceErrorKind.NoReply),
            result,
        )
        assertEquals("sin respuesta", copy.spoken(VoiceErrorKind.NoReply))
    }

    @Test
    fun afterReplyWait_emptyReply_continuesListening() {
        assertEquals(
            VoiceWaitResult.ContinueListening,
            VoiceTurnPolicy.afterReplyWait(timedOut = false, reply = null),
        )
        assertEquals(
            VoiceWaitResult.ContinueListening,
            VoiceTurnPolicy.afterReplyWait(timedOut = false, reply = "  "),
        )
    }

    @Test
    fun afterReplyWait_text_speaks() {
        assertEquals(
            VoiceWaitResult.Speak("hoy es domingo"),
            VoiceTurnPolicy.afterReplyWait(timedOut = false, reply = " hoy es domingo "),
        )
    }

    @Test
    fun afterSessionStart_sttMissing_beforeListening() {
        val decision = VoiceTurnPolicy.afterSessionStart(
            sttAvailable = false,
        )
        assertTrue(decision is VoiceTurnDecision.AudibleError)
        assertEquals(
            VoiceErrorKind.SttUnavailable,
            (decision as VoiceTurnDecision.AudibleError).kind,
        )
    }

    @Test
    fun afterSessionStart_ok_returnsNull() {
        assertNull(
            VoiceTurnPolicy.afterSessionStart(
                sttAvailable = true,
            ),
        )
    }

    @Test
    fun replyTimeoutMs_isFiniteAndPositive() {
        assertTrue(VoiceTurnPolicy.REPLY_TIMEOUT_MS in 10_000L..120_000L)
    }

    @Test
    fun streakSilenceTimeout_is25s() {
        assertEquals(25_000L, VoiceTurnPolicy.STREAK_SILENCE_TIMEOUT_MS)
    }
}
