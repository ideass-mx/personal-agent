package mx.ideass.personal.agent.voice

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.app.MainActivity
import mx.ideass.personal.agent.service.AgentService

/**
 * FGS efímero tipo [ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE] mientras
 * dura una [VoiceSession]. Es el ancla de proceso/mic cuando la ventana VIS
 * desaparece (pantalla apagada); no sustituye a [AgentService] (specialUse).
 * Se libera solo al colgar o [VoiceSession.stop], no al hide del VIS.
 */
class VoiceMicForegroundService : Service() {

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopForegroundAndSelf()
            return START_NOT_STICKY
        }
        createChannel()
        val started = runCatching {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                buildNotification(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
            )
            true
        }.getOrElse { e ->
            Log.e(TAG, "No se pudo promover FGS microphone: ${e.message}")
            false
        }
        if (!started) {
            stopSelf()
            return START_NOT_STICKY
        }
        return START_STICKY
    }

    override fun onDestroy() {
        runCatching {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        }
        super.onDestroy()
    }

    private fun stopForegroundAndSelf() {
        runCatching {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        }
        stopSelf()
    }

    private fun createChannel() {
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notification_channel_voz),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = getString(R.string.notification_channel_voz_desc)
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val open = Intent(this, MainActivity::class.java).apply {
            action = AgentService.ACTION_HABLAR
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(
            this,
            2,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.notification_voz_escuchando))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(pending)
            .build()
    }

    companion object {
        private const val TAG = "VoiceMicFgs"
        private const val CHANNEL_ID = "voz_mic"
        private const val NOTIFICATION_ID = 43
        private const val ACTION_STOP = "mx.ideass.personal.agent.voice.STOP_MIC"

        fun start(context: Context) {
            val intent = Intent(context, VoiceMicForegroundService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "start VoiceMicForegroundService: ${e.message}")
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, VoiceMicForegroundService::class.java).apply {
                action = ACTION_STOP
            }
            runCatching { context.startService(intent) }
                .onFailure {
                    // Si ya no corre, stopService basta.
                    runCatching {
                        context.stopService(Intent(context, VoiceMicForegroundService::class.java))
                    }
                }
        }
    }
}
