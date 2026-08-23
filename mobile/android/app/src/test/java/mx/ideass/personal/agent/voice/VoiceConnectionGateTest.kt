package mx.ideass.personal.agent.voice

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import mx.ideass.personal.agent.network.ConnectionState
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class VoiceConnectionGateTest {

    @Test
    fun awaitConnected_alreadyOnline() = runTest {
        val state = MutableStateFlow<ConnectionState>(ConnectionState.Conectado)
        assertTrue(
            VoiceConnectionGate.awaitConnected(
                state = state,
                isConnected = { true },
                timeoutMs = VoiceConnectionGate.SAFETY_CEILING_MS,
            ),
        )
    }

    @Test
    fun awaitConnected_reachesConectadoWithinCeiling() = runTest {
        val state = MutableStateFlow<ConnectionState>(ConnectionState.Reconectando(3))
        var online = false
        val job = launch {
            val ok = VoiceConnectionGate.awaitConnected(
                state = state,
                isConnected = { online },
                timeoutMs = VoiceConnectionGate.SAFETY_CEILING_MS,
            )
            assertTrue(ok)
        }
        runCurrent()
        // Caso real Tailscale frío: hello-ok ~4,2 s (> antiguo margen fijo de 4 s).
        advanceTimeBy(4_200)
        online = true
        state.value = ConnectionState.Conectado
        runCurrent()
        job.join()
    }

    @Test
    fun awaitConnected_errorBeforeCeiling_failsWithoutWaitingFullCeiling() = runTest {
        val state = MutableStateFlow<ConnectionState>(ConnectionState.Reconectando(2))
        val job = launch {
            val ok = VoiceConnectionGate.awaitConnected(
                state = state,
                isConnected = { false },
                timeoutMs = VoiceConnectionGate.SAFETY_CEILING_MS,
            )
            assertFalse(ok)
        }
        runCurrent()
        advanceTimeBy(200)
        state.value = ConnectionState.Error("sin red", "NETWORK_UNREACHABLE")
        runCurrent()
        job.join()
    }

    @Test
    fun awaitConnected_hangUntilCeiling_fails() = runTest {
        val state = MutableStateFlow<ConnectionState>(ConnectionState.Reconectando(5))
        val job = launch {
            val ok = VoiceConnectionGate.awaitConnected(
                state = state,
                isConnected = { false },
                timeoutMs = VoiceConnectionGate.SAFETY_CEILING_MS,
            )
            assertFalse(ok)
        }
        runCurrent()
        advanceTimeBy(VoiceConnectionGate.SAFETY_CEILING_MS + 1)
        runCurrent()
        job.join()
    }

    @Test
    fun awaitConnected_skipsStaleConectadoUntilFreshHelloOk() = runTest {
        // Tras reconnectNow el StateFlow puede seguir en Conectado residual.
        val state = MutableStateFlow<ConnectionState>(ConnectionState.Conectado)
        var online = false
        val job = launch {
            val ok = VoiceConnectionGate.awaitConnected(
                state = state,
                isConnected = { online },
                timeoutMs = VoiceConnectionGate.SAFETY_CEILING_MS,
                skipStaleTerminal = true,
            )
            assertTrue(ok)
        }
        runCurrent()
        advanceTimeBy(100)
        state.value = ConnectionState.Reconectando(0)
        runCurrent()
        advanceTimeBy(4_200)
        online = true
        state.value = ConnectionState.Conectado
        runCurrent()
        job.join()
    }

    @Test
    fun awaitConnected_skipsStaleErrorUntilReconnectResolves() = runTest {
        val state = MutableStateFlow<ConnectionState>(
            ConnectionState.Error("previo", "AUTH_TOKEN_MISMATCH"),
        )
        var online = false
        val job = launch {
            val ok = VoiceConnectionGate.awaitConnected(
                state = state,
                isConnected = { online },
                timeoutMs = VoiceConnectionGate.SAFETY_CEILING_MS,
                skipStaleTerminal = true,
            )
            assertTrue(ok)
        }
        runCurrent()
        state.value = ConnectionState.Reconectando(0)
        runCurrent()
        advanceTimeBy(500)
        online = true
        state.value = ConnectionState.Conectado
        runCurrent()
        job.join()
    }
}
