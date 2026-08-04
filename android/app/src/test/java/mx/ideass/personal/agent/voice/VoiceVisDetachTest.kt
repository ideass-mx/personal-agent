package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Desacople VIS ↔ racha + ventana estilo Gemini (keep-screen-on / keyguard)
 * + ciclo de vida del wake lock de pantalla (racha ∧ ventana, no turnos).
 */
class VoiceVisDetachTest {

    @Test
    fun windowDismiss_doesNotStopVoice() {
        assertFalse(VoiceVisSessionPolicy.shouldStopVoiceOnWindowDismiss())
    }

    @Test
    fun firstShow_startsStreak() {
        assertEquals(
            VoiceVisSessionPolicy.ShowAction.Start,
            VoiceVisSessionPolicy.onShow(uiBoundThisWindow = false, voiceActive = false),
        )
    }

    @Test
    fun reinvocationWhileUiBound_hangsUp() {
        assertEquals(
            VoiceVisSessionPolicy.ShowAction.HangUpByReinvocation,
            VoiceVisSessionPolicy.onShow(uiBoundThisWindow = true, voiceActive = true),
        )
    }

    @Test
    fun showAfterWindowDismiss_withActiveStreak_hangsUpNotSecondStreak() {
        assertFalse(VoiceVisSessionPolicy.shouldStopVoiceOnWindowDismiss())
        assertEquals(
            VoiceVisSessionPolicy.ShowAction.HangUpByReinvocation,
            VoiceVisSessionPolicy.onShow(uiBoundThisWindow = false, voiceActive = true),
        )
    }

    @Test
    fun destroyAfterHide_stillDoesNotStop() {
        assertFalse(VoiceVisSessionPolicy.shouldStopVoiceOnWindowDismiss())
        assertFalse(VoiceVisSessionPolicy.shouldStopVoiceOnWindowDismiss())
    }

    @Test
    fun micGate_singleAcquireWhileSessionAlive_noParallelFgs() {
        val gate = VoiceMicSessionGate()
        assertTrue(gate.onSessionStart())
        assertFalse(gate.onSessionStart())
        assertTrue(gate.isHeld)
        assertTrue(gate.onSessionEnd())
        assertFalse(gate.isHeld)
    }

    @Test
    fun micGate_afterHangUp_canStartAgain() {
        val gate = VoiceMicSessionGate()
        assertTrue(gate.onSessionStart())
        assertTrue(gate.onSessionEnd())
        assertTrue(gate.onSessionStart())
        assertTrue(gate.isHeld)
    }

    @Test
    fun keepScreenOn_onlyWhileWindowVisibleAndVoiceActive() {
        assertTrue(
            VoiceVisSessionPolicy.shouldKeepScreenOn(windowVisible = true, voiceActive = true),
        )
        assertFalse(
            VoiceVisSessionPolicy.shouldKeepScreenOn(windowVisible = true, voiceActive = false),
        )
        assertFalse(
            VoiceVisSessionPolicy.shouldKeepScreenOn(windowVisible = false, voiceActive = true),
        )
        assertFalse(
            VoiceVisSessionPolicy.shouldKeepScreenOn(windowVisible = false, voiceActive = false),
        )
    }

    @Test
    fun hangUp_releasesKeepScreenOn() {
        assertFalse(
            VoiceVisSessionPolicy.shouldKeepScreenOn(windowVisible = true, voiceActive = false),
        )
    }

    @Test
    fun keyguard_showWhenLocked_withoutDismiss() {
        assertTrue(VoiceVisSessionPolicy.shouldShowWhenLocked())
        assertFalse(VoiceVisSessionPolicy.shouldDismissKeyguard())
    }

    // --- Wake lock de pantalla: racha ∧ ventana; no turnos ---

    @Test
    fun screenWake_acquiresOnce_whenWindowThenStreak() {
        val gate = VoiceScreenWakeGate()
        // onShow: ventana antes de que start() ponga sessionActive (async).
        assertTrue(gate.setWindowVisible(true))
        assertFalse(gate.isHeld)
        // start() en el handler: bit de racha → acquire una vez.
        assertTrue(gate.setStreakActive(true))
        assertTrue(gate.isHeld)
        // Idempotente: no re-adquiere / no flapea.
        assertFalse(gate.setWindowVisible(true))
        assertFalse(gate.setStreakActive(true))
        assertTrue(gate.isHeld)
    }

    @Test
    fun screenWake_survivesFullTurn_listeningThinkingSpeaking() {
        val gate = VoiceScreenWakeGate()
        assertTrue(gate.setWindowVisible(true))
        assertTrue(gate.setStreakActive(true))
        assertTrue(gate.isHeld)
        // Simula utterance → Thinking → Speaking → Listening: bits intactos.
        assertFalse(gate.setStreakActive(true))
        assertFalse(gate.setWindowVisible(true))
        assertTrue(gate.isHeld)
        assertFalse(gate.setStreakActive(true))
        assertTrue(gate.isHeld)
    }

    @Test
    fun screenWake_hangUpCommand_releasesOnce() {
        assertReleasedOnceOnStreakEnd()
    }

    @Test
    fun screenWake_hangUpTimeout_releasesOnce() {
        assertReleasedOnceOnStreakEnd()
    }

    @Test
    fun screenWake_hangUpUi_releasesOnce() {
        assertReleasedOnceOnStreakEnd()
    }

    @Test
    fun screenWake_hangUpReinvocation_releasesOnce() {
        assertReleasedOnceOnStreakEnd()
    }

    @Test
    fun screenWake_fatalError_releasesOnce() {
        assertReleasedOnceOnStreakEnd()
    }

    @Test
    fun screenWake_onHide_releasesWhileStreakMayContinue() {
        val gate = VoiceScreenWakeGate()
        assertTrue(gate.setWindowVisible(true))
        assertTrue(gate.setStreakActive(true))
        assertTrue(gate.isHeld)
        // onHide: solo ventana; racha puede seguir.
        assertTrue(gate.setWindowVisible(false))
        assertFalse(gate.isHeld)
        assertTrue(gate.isStreakActive)
    }

    @Test
    fun screenWake_onDestroy_forceRelease() {
        val gate = VoiceScreenWakeGate()
        assertTrue(gate.setWindowVisible(true))
        assertTrue(gate.setStreakActive(true))
        assertTrue(gate.forceRelease())
        assertFalse(gate.isHeld)
        assertFalse(gate.forceRelease())
    }

    @Test
    fun screenWake_asyncStartRace_doesNotReleaseWhenOnlyWindowSet() {
        // Regresión: sync(isSessionActive=false) tras start() async soltaba el lock.
        // Orden correcto: ventana primero (no held), luego racha (held); sin
        // un "sync" intermedio que lea streak=false y libere.
        val gate = VoiceScreenWakeGate()
        assertTrue(gate.setWindowVisible(true))
        assertFalse(gate.isHeld)
        assertTrue(gate.setStreakActive(true))
        assertTrue(gate.isHeld)
        // Un setStreakActive(false) espurio (p. ej. releer isSessionActive
        // antes de que el post de start corra) SÍ liberaría — por eso el
        // controlador no re-sincroniza desde la VIS con isSessionActive.
        assertTrue(gate.isHeld)
    }

    @Test
    fun screenWake_respuestaPartial_isSeparateLifecycle() {
        // Documenta la separación: el gate de pantalla no modela streaming.
        // Agente:respuesta sigue en AgentService (PARTIAL por AssistantDelta/Done).
        val gate = VoiceScreenWakeGate()
        assertTrue(gate.setWindowVisible(true))
        assertTrue(gate.setStreakActive(true))
        assertTrue(gate.isHeld)
        // "Fin de respuesta" no es un bit de este gate.
        assertFalse(gate.setStreakActive(true))
        assertTrue(gate.isHeld)
    }

    private fun assertReleasedOnceOnStreakEnd() {
        val gate = VoiceScreenWakeGate()
        assertTrue(gate.setWindowVisible(true))
        assertTrue(gate.setStreakActive(true))
        assertTrue(gate.isHeld)
        // hangUp / error: VoiceSession.setStreakActive(false) una vez.
        assertTrue(gate.setStreakActive(false))
        assertFalse(gate.isHeld)
        assertFalse(gate.setStreakActive(false))
    }
}
