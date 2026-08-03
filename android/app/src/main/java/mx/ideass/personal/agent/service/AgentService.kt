package mx.ideass.personal.agent.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.app.MainActivity
import mx.ideass.personal.agent.chat.ChatHistorySync
import mx.ideass.personal.agent.chat.ChatStore
import mx.ideass.personal.agent.network.ChatConnection
import mx.ideass.personal.agent.network.ChatInbound
import mx.ideass.personal.agent.network.ConnectionState
import mx.ideass.personal.agent.voice.VoiceLaunch
import javax.inject.Inject

/**
 * Dueño único de la conexión (hub o Gateway). Sobrevive a que la UI muera;
 * la Activity solo se une (bind) para observar estado.
 *
 * Tipo FGS: [ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE] — canal persistente
 * 24/7 sin el tope de 6h de dataSync (Android 15).
 */
@AndroidEntryPoint
class AgentService : Service() {

    @Inject lateinit var chatConnection: ChatConnection
    @Inject lateinit var chatStore: ChatStore
    @Inject lateinit var chatHistorySync: ChatHistorySync
    @Inject lateinit var healthTracker: ConnectionHealthTracker

    private val binder = LocalBinder()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private var wakeLock: PowerManager.WakeLock? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var lastNotificationText: String? = null
    /** Solo reconectamos al recuperar red tras haberla perdido (evita el onAvailable inicial). */
    private var networkWasLost = false

    inner class LocalBinder : Binder() {
        fun getService(): AgentService = this@AgentService
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        if (!startInForeground(getString(R.string.notification_reconnectando))) {
            // Red de seguridad: sin FGS no somos útiles como service; el socket
            // singleton puede seguir vivo si otro código ya lo arrancó.
            stopSelf()
            return
        }
        chatConnection.start()
        chatHistorySync.start()
        observeConnection()
        observeMessages()
        registerNetworkCallback()
        startHeartbeat()
        Log.i(TAG, "AgentService creado")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_HABLAR) {
            launchVoiceFallback()
        }
        // Idempotente: si ya estamos en foreground, no re-promover.
        if (!AgentForegroundGate.isActive) {
            if (!startInForeground(currentNotificationText())) {
                stopSelf()
                return START_NOT_STICKY
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onTimeout(startId: Int, fgsType: Int) {
        // specialUse no tiene cuota de 6h; defensa ante cambios futuros de tipo.
        Log.w(TAG, "onTimeout fgsType=$fgsType — stopSelf limpio")
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        AgentForegroundGate.markInactive()
        stopSelf(startId)
    }

    override fun onDestroy() {
        unregisterNetworkCallback()
        releaseWakeLock()
        scope.cancel()
        AgentForegroundGate.markInactive()
        Log.i(TAG, "AgentService destruido")
        super.onDestroy()
    }

    private fun observeConnection() {
        scope.launch {
            chatConnection.connectionState.collectLatest { state ->
                healthTracker.onConnectionState(state)
                updateNotification(state)
                if (state is ConnectionState.Conectado) {
                    chatStore.markQueuedAsSent()
                }
            }
        }
    }

    private fun observeMessages() {
        scope.launch {
            chatStore.ensureLoaded()
            chatConnection.inbound.collect { msg ->
                Log.i(PA_TAG, "mensaje recibido: ${msg::class.simpleName}")
                healthTracker.onMessageReceived()
                when (msg) {
                    is ChatInbound.AssistantDelta -> acquireWakeLock()
                    is ChatInbound.AssistantDone,
                    is ChatInbound.Error,
                    -> releaseWakeLock()
                }
                chatStore.handleInbound(msg)
            }
        }
    }

    private fun startHeartbeat() {
        scope.launch {
            while (true) {
                delay(HEARTBEAT_INTERVAL_MS)
                Log.i(PA_TAG, "service vivo, estado=${chatConnection.connectionState.value}")
            }
        }
    }

    private fun registerNetworkCallback() {
        val cm = getSystemService(ConnectivityManager::class.java) ?: return
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onLost(network: Network) {
                networkWasLost = true
                Log.i(TAG, "Red perdida")
            }

            override fun onAvailable(network: Network) {
                if (!networkWasLost) return
                networkWasLost = false
                Log.i(TAG, "Red disponible — reconexión inmediata")
                chatConnection.reconnectNow()
            }

            override fun onCapabilitiesChanged(
                network: Network,
                networkCapabilities: NetworkCapabilities,
            ) {
                if (!networkWasLost) return
                if (networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                ) {
                    networkWasLost = false
                    Log.i(TAG, "Red validada — reconexión inmediata")
                    chatConnection.reconnectNow()
                }
            }
        }
        networkCallback = callback
        cm.registerNetworkCallback(request, callback)
    }

    private fun unregisterNetworkCallback() {
        val callback = networkCallback ?: return
        networkCallback = null
        runCatching {
            getSystemService(ConnectivityManager::class.java)
                ?.unregisterNetworkCallback(callback)
        }
    }

    private fun acquireWakeLock() {
        val existing = wakeLock
        if (existing?.isHeld == true) return
        val pm = getSystemService(PowerManager::class.java) ?: return
        val lock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "Agente:respuesta",
        ).apply {
            setReferenceCounted(false)
            acquire(WAKE_LOCK_TIMEOUT_MS)
        }
        wakeLock = lock
    }

    private fun releaseWakeLock() {
        val lock = wakeLock ?: return
        if (lock.isHeld) {
            runCatching { lock.release() }
        }
        wakeLock = null
    }

    private fun createNotificationChannel() {
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notification_channel_conexion),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = getString(R.string.notification_channel_conexion_desc)
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    /**
     * Promueve a foreground. Idempotente si ya estamos activos.
     *
     * La captura de excepciones es **red de seguridad**, no la solución:
     * el tipo correcto es specialUse (sin tope de 6h de dataSync).
     *
     * @return true si el servicio está (o ya estaba) en foreground.
     */
    private fun startInForeground(text: String): Boolean {
        if (AgentForegroundGate.isActive) {
            if (text != lastNotificationText) {
                lastNotificationText = text
                val manager = getSystemService(NotificationManager::class.java)
                manager?.notify(NOTIFICATION_ID, buildNotification(text))
            }
            return true
        }
        return try {
            val notification = buildNotification(text)
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
            AgentForegroundGate.markActive()
            lastNotificationText = text
            true
        } catch (e: Exception) {
            // Red de seguridad: no tumbar el proceso.
            // Nombre por string: la clase es API 31+ y minSdk es 29.
            if (isFgsStartDenied(e)) {
                Log.e(TAG, "FGS no permitido (red de seguridad): ${e.message}")
            } else {
                Log.e(TAG, "Fallo al promover a foreground: ${e.javaClass.simpleName}: ${e.message}")
            }
            AgentForegroundGate.markInactive()
            false
        }
    }

    private fun updateNotification(state: ConnectionState) {
        val text = when (state) {
            is ConnectionState.Conectado -> getString(R.string.notification_conectado)
            else -> getString(R.string.notification_reconnectando)
        }
        if (text == lastNotificationText) return
        lastNotificationText = text
        val manager = getSystemService(NotificationManager::class.java) ?: return
        manager.notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun currentNotificationText(): String {
        return when (chatConnection.connectionState.value) {
            is ConnectionState.Conectado -> getString(R.string.notification_conectado)
            else -> getString(R.string.notification_reconnectando)
        }
    }

    private fun buildNotification(text: String): Notification {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val hablarIntent = Intent(this, AgentService::class.java).apply {
            action = ACTION_HABLAR
        }
        val hablarPending = PendingIntent.getService(
            this,
            1,
            hablarIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(pending)
            .addAction(
                R.drawable.ic_notification,
                getString(R.string.notification_action_hablar),
                hablarPending,
            )
            .build()
    }

    /**
     * Disparador fallback «Hablar»: VIS si el rol de asistente está vivo;
     * si no, abre la pantalla de voz de la app.
     */
    private fun launchVoiceFallback() {
        VoiceLaunch.fromFallback(this)
    }

    companion object {
        private const val TAG = "AgentService"
        private const val PA_TAG = "PersonalAgent"
        private const val CHANNEL_ID = "conexion"
        private const val NOTIFICATION_ID = 42
        private const val WAKE_LOCK_TIMEOUT_MS = 10 * 60 * 1000L
        private const val HEARTBEAT_INTERVAL_MS = 60 * 1000L
        private const val FGS_DENIED_CLASS =
            "android.app.ForegroundServiceStartNotAllowedException"

        /** Acción de notificación / tile: iniciar flujo de voz (racha). */
        const val ACTION_HABLAR = "mx.ideass.personal.agent.action.HABLAR"

        /**
         * Arranca el FGS si aún no está en foreground (idempotente).
         * La captura aquí es red de seguridad; la solución es specialUse.
         */
        fun start(context: Context) {
            if (AgentForegroundGate.shouldSkipStart()) {
                Log.d(TAG, "AgentService ya en foreground — start omitido")
                return
            }
            val intent = Intent(context, AgentService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                if (isFgsStartDenied(e)) {
                    Log.e(TAG, "startForegroundService no permitido (red de seguridad): ${e.message}")
                } else {
                    Log.e(TAG, "Fallo al arrancar AgentService: ${e.javaClass.simpleName}: ${e.message}")
                }
            }
        }

        private fun isFgsStartDenied(e: Throwable): Boolean =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                e.javaClass.name == FGS_DENIED_CLASS
    }
}
