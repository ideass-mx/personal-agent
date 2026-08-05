package mx.ideass.personal.agent.voice.audio

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Un único canal SCO por sesión, 100 % basado en eventos.
 *
 * - [AudioManager.setMode] / focus: solo al inicio y al fin.
 * - Estado SCO: solo vía [AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED]
 *   (sin polling de getMode / isBluetoothScoOn).
 * - Un solo camino de apertura (communication device O SCO legacy), nunca ambos.
 */
@Singleton
class BluetoothScoController @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val audioManager = context.getSystemService(AudioManager::class.java)
    private val mainHandler = Handler(Looper.getMainLooper())
    private var focusRequest: AudioFocusRequest? = null
    private var scoReceiver: BroadcastReceiver? = null
    private var active = false
    private var scoConnected = false
    private var usedLegacySco = false
    private var usedCommunicationDevice = false
    /** Ya pedimos startBluetoothSco en esta sesión (evitar "already in ACTIVE mode"). */
    private var scoStartRequested = false
    /** Último estado SCO visto por evento; evita reaccionar a sticky/duplicados. */
    private var lastScoState: Int? = null
    private var reconnectScheduled = false
    private var readyCallback: ((Boolean) -> Unit)? = null
    private var connectTimeoutRunnable: Runnable? = null
    private var reconnectRunnable: Runnable? = null

    /**
     * True si el broadcast reportó SCO CONNECTED en esta sesión.
     * TTS/earcons lo usan para elegir [VoicePlaybackRoute.Sco] vs Media.
     */
    val isScoConnected: Boolean get() = scoConnected

    /**
     * Abre el canal una vez. [onReady] en el hilo principal al recibir
     * CONNECTED por broadcast, o tras timeout / sin BT.
     */
    fun start(onReady: (connected: Boolean) -> Unit) {
        val am = audioManager
        if (am == null) {
            onReady(false)
            return
        }
        if (active) {
            onReady(scoConnected)
            return
        }
        active = true
        scoConnected = false
        scoStartRequested = false
        reconnectScheduled = false
        lastScoState = null
        readyCallback = onReady

        // Modo y focus UNA vez. Nunca re-aplicar en reconexión ni en el ciclo.
        requestFocus(am)
        am.mode = AudioManager.MODE_IN_COMMUNICATION
        @Suppress("DEPRECATION")
        am.isSpeakerphoneOn = false

        registerScoReceiver()
        openScoChannel(am)
        Log.i(TAG, "SCO: abierto (una vez)")

        connectTimeoutRunnable = Runnable {
            connectTimeoutRunnable = null
            if (!active) return@Runnable
            Log.w(TAG, "SCO: timeout esperando CONNECTED; continuando")
            deliverReady(scoConnected)
        }
        mainHandler.postDelayed(connectTimeoutRunnable!!, CONNECT_TIMEOUT_MS)
    }

    /** Diagnóstico: el ciclo half-duplex no debe tocar SCO ni el modo. */
    fun markCycleTransition(from: String, to: String) {
        Log.i(TAG, "SCO: transicion de ciclo SIN tocar SCO ($from → $to)")
    }

    fun stop() {
        if (!active) return
        active = false
        scoConnected = false
        scoStartRequested = false
        reconnectScheduled = false
        lastScoState = null
        readyCallback = null
        cancelConnectTimeout()
        cancelReconnect()

        val am = audioManager
        unregisterScoReceiver()
        if (am != null) {
            if (usedCommunicationDevice && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                runCatching { am.clearCommunicationDevice() }
                usedCommunicationDevice = false
            }
            if (usedLegacySco) {
                runCatching {
                    @Suppress("DEPRECATION")
                    am.stopBluetoothSco()
                    @Suppress("DEPRECATION")
                    am.isBluetoothScoOn = false
                }
                usedLegacySco = false
            }
            am.mode = AudioManager.MODE_NORMAL
            abandonFocus(am)
        }
        Log.i(TAG, "SCO: cerrado al fin de sesion")
    }

    /**
     * Un solo camino: communication device SCO/BLE en API 31+,
     * si no hay → SCO legacy. Nunca ambos a la vez (evita pelea en AudioDeviceBroker).
     */
    private fun openScoChannel(am: AudioManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val devices = am.availableCommunicationDevices
            val preferred = devices.firstOrNull { device ->
                device.type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
                    device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
            }
            if (preferred != null) {
                val ok = am.setCommunicationDevice(preferred)
                Log.i(TAG, "communicationDevice type=${preferred.type} ok=$ok")
                if (ok) {
                    usedCommunicationDevice = true
                    // setCommunicationDevice no siempre emite SCO broadcast;
                    // si ya hay estado sticky CONNECTED el receiver lo verá.
                    // Si no, el timeout entrega ready.
                    return
                }
            }
            Log.i(TAG, "Sin communicationDevice SCO/BLE; usando startBluetoothSco")
        }
        startLegacySco(am)
    }

    private fun startLegacySco(am: AudioManager) {
        if (scoAlreadyActive()) {
            Log.i(TAG, "SCO: ya ACTIVE, no re-solicitar startBluetoothSco")
            usedLegacySco = true
            deliverReady(true)
            return
        }
        @Suppress("DEPRECATION")
        if (!am.isBluetoothScoAvailableOffCall) {
            Log.w(TAG, "Bluetooth SCO no disponible off-call")
            deliverReady(false)
            return
        }
        usedLegacySco = true
        scoStartRequested = true
        runCatching {
            @Suppress("DEPRECATION")
            am.startBluetoothSco()
            @Suppress("DEPRECATION")
            am.isBluetoothScoOn = true
        }.onFailure {
            scoStartRequested = false
            Log.w(TAG, "No se pudo arrancar Bluetooth SCO: ${it.message}")
            deliverReady(false)
        }
    }

    /** True si el broadcast ya dijo CONNECTED/CONNECTING o ya pedimos start en esta sesión. */
    private fun scoAlreadyActive(): Boolean {
        if (scoConnected) return true
        val state = lastScoState
        if (state == AudioManager.SCO_AUDIO_STATE_CONNECTED ||
            state == AudioManager.SCO_AUDIO_STATE_CONNECTING
        ) {
            return true
        }
        return scoStartRequested && usedLegacySco
    }

    /**
     * Reconexión por evento DISCONNECTED real. Sin getMode/setMode.
     * Debounce largo; no re-pide SCO si ya volvió a ACTIVE.
     */
    private fun scheduleReconnect() {
        if (!active || reconnectScheduled) return
        reconnectScheduled = true
        Log.i(TAG, "SCO: DISCONNECT inesperado, reconectando")
        val runnable = Runnable {
            reconnectRunnable = null
            if (!active) {
                reconnectScheduled = false
                return@Runnable
            }
            if (scoConnected || lastScoState == AudioManager.SCO_AUDIO_STATE_CONNECTED ||
                lastScoState == AudioManager.SCO_AUDIO_STATE_CONNECTING
            ) {
                Log.i(TAG, "SCO: ya ACTIVE, no re-solicitar startBluetoothSco")
                reconnectScheduled = false
                return@Runnable
            }
            val am = audioManager
            if (am == null) {
                reconnectScheduled = false
                return@Runnable
            }
            runCatching {
                if (usedCommunicationDevice && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    val preferred = am.availableCommunicationDevices.firstOrNull { device ->
                        device.type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
                            device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                    }
                    if (preferred != null) {
                        am.setCommunicationDevice(preferred)
                        return@runCatching
                    }
                }
                if (scoStartRequested && usedLegacySco) {
                    // Ya pedimos SCO una vez; solo re-start si el estado es DISCONNECTED.
                    scoStartRequested = false
                }
                startLegacySco(am)
            }.onFailure {
                Log.w(TAG, "Reconexión SCO falló: ${it.message}")
                reconnectScheduled = false
            }
            mainHandler.postDelayed({
                if (active && !scoConnected) reconnectScheduled = false
            }, RECONNECT_COOLDOWN_MS)
        }
        reconnectRunnable = runnable
        mainHandler.postDelayed(runnable, RECONNECT_DEBOUNCE_MS)
    }

    private fun requestFocus(am: AudioManager) {
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(attrs)
            .setAcceptsDelayedFocusGain(true)
            .setWillPauseWhenDucked(false)
            .setOnAudioFocusChangeListener { /* half-duplex propio; no soltar SCO */ }
            .build()
        focusRequest = request
        am.requestAudioFocus(request)
    }

    private fun abandonFocus(am: AudioManager) {
        val request = focusRequest ?: return
        focusRequest = null
        am.abandonAudioFocusRequest(request)
    }

    private fun registerScoReceiver() {
        if (scoReceiver != null) return
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (intent?.action != AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED) return
                val state = intent.getIntExtra(
                    AudioManager.EXTRA_SCO_AUDIO_STATE,
                    AudioManager.SCO_AUDIO_STATE_DISCONNECTED,
                )
                // Solo reaccionar cuando el estado CAMBIA (eventos, no polling).
                if (state == lastScoState) return
                lastScoState = state
                Log.i(TAG, "SCO: estado cambiado (evento): ${scoStateName(state)}")

                when (state) {
                    AudioManager.SCO_AUDIO_STATE_CONNECTED -> {
                        scoConnected = true
                        reconnectScheduled = false
                        cancelReconnect()
                        deliverReady(true)
                    }
                    AudioManager.SCO_AUDIO_STATE_CONNECTING -> {
                        // Solo log (ya emitido arriba).
                    }
                    AudioManager.SCO_AUDIO_STATE_DISCONNECTED -> {
                        val wasConnected = scoConnected
                        scoConnected = false
                        if (active && wasConnected) {
                            scheduleReconnect()
                        }
                    }
                }
            }
        }
        scoReceiver = receiver
        val filter = IntentFilter(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(receiver, filter)
        }
    }

    private fun unregisterScoReceiver() {
        val receiver = scoReceiver ?: return
        scoReceiver = null
        runCatching { context.unregisterReceiver(receiver) }
    }

    private fun deliverReady(connected: Boolean) {
        cancelConnectTimeout()
        val cb = readyCallback ?: return
        readyCallback = null
        mainHandler.post { cb(connected) }
    }

    private fun cancelConnectTimeout() {
        connectTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
        connectTimeoutRunnable = null
    }

    private fun cancelReconnect() {
        reconnectRunnable?.let { mainHandler.removeCallbacks(it) }
        reconnectRunnable = null
    }

    private fun scoStateName(state: Int): String = when (state) {
        AudioManager.SCO_AUDIO_STATE_DISCONNECTED -> "DISCONNECTED"
        AudioManager.SCO_AUDIO_STATE_CONNECTED -> "CONNECTED"
        AudioManager.SCO_AUDIO_STATE_CONNECTING -> "CONNECTING"
        else -> "UNKNOWN($state)"
    }

    companion object {
        private const val TAG = "BluetoothSco"
        private const val CONNECT_TIMEOUT_MS = 2_500L
        /** Espera antes de reintentar tras DISCONNECT (nada de bucles cerrados). */
        private const val RECONNECT_DEBOUNCE_MS = 1_500L
        private const val RECONNECT_COOLDOWN_MS = 2_000L
    }
}
