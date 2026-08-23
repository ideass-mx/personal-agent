package mx.ideass.personal.agent.app

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class AgentApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // AgentService se arranca desde MainActivity (presencia del usuario)
        // o BootCompletedReceiver — no desde Application (evita start duplicado).
    }
}
