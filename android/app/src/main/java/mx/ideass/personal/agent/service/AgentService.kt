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
import mx.ideass.personal.agent.chat.ChatStore
import mx.ideass.personal.agent.network.ConnectionState
import mx.ideass.personal.agent.network.HubClient
import mx.ideass.personal.agent.protocol.ServerMessage
import javax.inject.Inject

/**
 * Dueño único de la conexión con el hub. Sobrevive a que la UI muera;
 * la Activity solo se une (bind) para observar estado.
 */
@AndroidEntryPoint
class AgentService : Service() {

    @Inject lateinit var hubClient: HubClient
    @Inject lateinit var chatStore: ChatStore
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
        startInForeground(getString(R.string.notification_reconnectando))
        hubClient.start()
        observeConnection()
        observeMessages()
        registerNetworkCallback()
        startHeartbeat()
        Log.i(TAG, "AgentService creado")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Por si el sistema recrea el service sin pasar por onCreate a tiempo.
        startInForeground(currentNotificationText())
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder = binder

    override fun onDestroy() {
        unregisterNetworkCallback()
        releaseWakeLock()
        scope.cancel()
        Log.i(TAG, "AgentService destruido")
        super.onDestroy()
    }

    private fun observeConnection() {
        scope.launch {
            hubClient.connectionState.collectLatest { state ->
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
            hubClient.serverMessages.collect { msg ->
                Log.i(PA_TAG, "mensaje recibido: ${msg::class.simpleName}")
                healthTracker.onMessageReceived()
                when (msg) {
                    is ServerMessage.AssistantChunk -> acquireWakeLock()
                    is ServerMessage.AssistantDone,
                    is ServerMessage.Error,
                    -> releaseWakeLock()
                    else -> Unit
                }
                chatStore.handleServer(msg)
            }
        }
    }

    private fun startHeartbeat() {
        scope.launch {
            while (true) {
                delay(HEARTBEAT_INTERVAL_MS)
                Log.i(PA_TAG, "service vivo, estado=${hubClient.connectionState.value}")
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
                hubClient.reconnectNow()
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
                    hubClient.reconnectNow()
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

    private fun startInForeground(text: String) {
        val notification = buildNotification(text)
        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
        )
        lastNotificationText = text
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
        return when (hubClient.connectionState.value) {
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
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pending)
            .build()
    }

    companion object {
        private const val TAG = "AgentService"
        private const val PA_TAG = "PersonalAgent"
        private const val CHANNEL_ID = "conexion"
        private const val NOTIFICATION_ID = 42
        private const val WAKE_LOCK_TIMEOUT_MS = 10 * 60 * 1000L
        private const val HEARTBEAT_INTERVAL_MS = 60 * 1000L

        fun start(context: Context) {
            val intent = Intent(context, AgentService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }
    }
}
