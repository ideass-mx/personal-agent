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
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Enruta micrófono y salida por Bluetooth (p. ej. Buds Pro 3)
 * durante la sesión de voz. Sin modo comunicación, muchos auriculares
 * solo reproducen y el mic sigue siendo el del teléfono.
 */
@Singleton
class BluetoothScoController @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val audioManager = context.getSystemService(AudioManager::class.java)
    private var focusRequest: AudioFocusRequest? = null
    private var scoReceiver: BroadcastReceiver? = null
    private var active = false
    private var usedLegacySco = false

    fun start() {
        val am = audioManager ?: return
        if (active) return
        active = true
        requestFocus(am)
        am.mode = AudioManager.MODE_IN_COMMUNICATION
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            routeModern(am)
        } else {
            routeLegacySco(am)
        }
    }

    fun stop() {
        if (!active) return
        active = false
        val am = audioManager
        unregisterScoReceiver()
        if (am != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                runCatching { am.clearCommunicationDevice() }
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
    }

    private fun routeModern(am: AudioManager) {
        val devices = am.availableCommunicationDevices
        val preferred = devices.firstOrNull { device ->
            device.type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
                device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                device.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
        }
        if (preferred != null) {
            val ok = am.setCommunicationDevice(preferred)
            Log.i(TAG, "communicationDevice type=${preferred.type} ok=$ok")
            if (ok) return
        }
        // Fallback SCO clásico si el dispositivo no expone communication device.
        routeLegacySco(am)
    }

    private fun routeLegacySco(am: AudioManager) {
        registerScoReceiver()
        @Suppress("DEPRECATION")
        if (am.isBluetoothScoAvailableOffCall) {
            usedLegacySco = true
            runCatching {
                @Suppress("DEPRECATION")
                am.startBluetoothSco()
                @Suppress("DEPRECATION")
                am.isBluetoothScoOn = true
            }.onFailure {
                Log.w(TAG, "No se pudo arrancar Bluetooth SCO: ${it.message}")
            }
        }
    }

    private fun requestFocus(am: AudioManager) {
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(attrs)
            .setAcceptsDelayedFocusGain(true)
            .setOnAudioFocusChangeListener { /* half-duplex propio */ }
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
                Log.i(TAG, "SCO estado=$state")
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

    companion object {
        private const val TAG = "BluetoothSco"
    }
}
