package mx.ideass.personal.agent.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** Revive [AgentService] tras reiniciar el teléfono. */
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
