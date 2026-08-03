package mx.ideass.personal.agent.voice

import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.util.Log
import mx.ideass.personal.agent.R
import mx.ideass.personal.agent.app.MainActivity
import mx.ideass.personal.agent.service.AgentService

/**
 * Tile de ajustes rápidos «Hablar»: mismo disparador fallback que la
 * notificación del [AgentService].
 */
class HablarTileService : TileService() {

    override fun onStartListening() {
        qsTile?.apply {
            label = getString(R.string.notification_action_hablar)
            state = Tile.STATE_INACTIVE
            updateTile()
        }
    }

    override fun onClick() {
        Log.i(TAG, "Tile Hablar pulsado")
        val launch = Intent(this, MainActivity::class.java).apply {
            action = AgentService.ACTION_HABLAR
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        // Colapsar el panel y abrir; MainActivity / VIS resuelven el flujo.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val pending = android.app.PendingIntent.getActivity(
                this,
                3,
                launch,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or
                    android.app.PendingIntent.FLAG_IMMUTABLE,
            )
            startActivityAndCollapse(pending)
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(launch)
        }
    }

    private companion object {
        const val TAG = "HablarTile"
    }
}
