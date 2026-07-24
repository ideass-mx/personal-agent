package mx.ideass.personal.agent.app

import android.app.Application
import dagger.hilt.android.HiltAndroidApp
import mx.ideass.personal.agent.service.AgentService

@HiltAndroidApp
class AgentApp : Application() {
    override fun onCreate() {
        super.onCreate()
        AgentService.start(this)
    }
}
