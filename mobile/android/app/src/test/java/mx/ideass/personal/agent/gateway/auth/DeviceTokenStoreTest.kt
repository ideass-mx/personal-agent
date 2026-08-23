package mx.ideass.personal.agent.gateway.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DeviceTokenStoreTest {
    @Test
    fun saveLoadClear_roundTrip() {
        val store = DeviceTokenStore(InMemorySecureStringStore())
        store.saveToken(
            gatewayId = "wss://gw.example:18789",
            deviceId = "ABC",
            role = "Operator",
            token = " secret-token ",
            scopes = listOf("operator.write", "operator.read"),
        )

        val entry = store.loadEntry("wss://gw.example:18789", "abc", "operator")
        requireNotNull(entry)
        assertEquals("secret-token", entry.token)
        assertEquals("operator", entry.role)
        assertEquals(listOf("operator.read", "operator.write"), entry.scopes)

        store.clearToken("wss://gw.example:18789", "abc", "operator")
        assertNull(store.loadEntry("wss://gw.example:18789", "abc", "operator"))
    }
}
