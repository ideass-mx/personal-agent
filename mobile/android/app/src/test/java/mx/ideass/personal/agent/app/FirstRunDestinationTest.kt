package mx.ideass.personal.agent.app

import org.junit.Assert.assertEquals
import org.junit.Test

class FirstRunDestinationTest {

    @Test
    fun notConfigured_goesToConnection() {
        assertEquals(FirstRunDestination.Connection, firstRunDestination(configured = false))
    }

    @Test
    fun configured_goesToChat() {
        assertEquals(FirstRunDestination.Chat, firstRunDestination(configured = true))
    }
}
