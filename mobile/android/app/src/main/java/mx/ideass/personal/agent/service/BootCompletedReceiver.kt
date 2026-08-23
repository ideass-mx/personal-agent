package mx.ideass.personal.agent.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Revive [AgentService] tras reiniciar el teléfono.
 *
 * Android 15 restringe arrancar ciertos FGS desde BOOT_COMPLETED (dataSync,
 * camera, mediaPlayback, etc.). [specialUse] está en la allowlist del
 * framework, así que el arranque en boot es viable y lo mantenemos.
 * Si en un OEM concreto fallara, [AgentService.start] captura la excepción
 * sin tumbar el proceso; el usuario recupera al abrir la app.
 */
class BootCompletedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
        Log.i(TAG, "BOOT_COMPLETED — arrancando AgentService")
        AgentService.start(context.applicationContext)
    }

    companion object {
        private const val TAG = "BootCompletedReceiver"
    }
}
