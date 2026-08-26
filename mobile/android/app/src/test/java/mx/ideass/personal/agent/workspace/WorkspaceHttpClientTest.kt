package mx.ideass.personal.agent.workspace

import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import kotlinx.coroutines.runBlocking
import mx.ideass.personal.agent.protocol.ClientMessage
import mx.ideass.personal.agent.protocol.ProtocolJson

class WorkspaceHttpClientTest {
    private lateinit var server: MockWebServer
    private lateinit var client: WorkspaceHttpClient

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        client = WorkspaceHttpClient()
        client.configure(server.url("/").toString(), "secret")
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun list_usesBearer_noDeviceId() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                """{"workspaces":[{"id":"w_1","name":"Libro","description":null,"createdAt":"t","updatedAt":"t"}]}""",
            ),
        )
        val listed = client.listWorkspaces()
        assertEquals("w_1", listed.single().id)
        val recorded = server.takeRequest()
        assertEquals("Bearer secret", recorded.getHeader("Authorization"))
        assertNull(recorded.getHeader("deviceId"))
        assertEquals("/workspaces", recorded.path)
    }

    @Test
    fun getConversationWorkspace_null() = runBlocking {
        server.enqueue(
            MockResponse().setBody("""{"conversationId":"c_1","workspace":null}"""),
        )
        assertNull(client.getConversationWorkspace("c_1"))
    }

    @Test
    fun user_message_hasNoWorkspaceId() {
        val json = ProtocolJson.encodeToString(
            ClientMessage.serializer(),
            ClientMessage.UserMessage(text = "hola", conversationId = "c_1"),
        )
        assertEquals(false, json.contains("workspaceId"))
        assertEquals(true, json.contains("conversationId"))
        assertEquals(true, json.contains("user_message"))
    }

    @Test
    fun getConversationMessages_returnsOrderedRows() = runBlocking {
        server.enqueue(
            MockResponse().setBody(
                """[{"id":"m_1","conversationId":"c_1","role":"user","content":"hola","deviceId":null,"createdAt":"t1"},""" +
                    """{"id":"m_2","conversationId":"c_1","role":"assistant","content":"hi","deviceId":null,"createdAt":"t2"}]""",
            ),
        )
        val messages = client.getConversationMessages("c_1")
        assertEquals(2, messages.size)
        assertEquals("m_1", messages[0].id)
        assertEquals("user", messages[0].role)
        assertEquals("m_2", messages[1].id)
        val recorded = server.takeRequest()
        assertEquals("/conversations/c_1/messages", recorded.path)
        assertEquals("Bearer secret", recorded.getHeader("Authorization"))
    }

    @Test
    fun httpOrigin_stripsWs() {
        assertEquals("http://host:8787", HubHttpOrigin.fromAddress("ws://host:8787/ws"))
        assertEquals("https://host", HubHttpOrigin.fromAddress("wss://host/ws"))
    }
}
