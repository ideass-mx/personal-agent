package mx.ideass.personal.agent.workspace

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ConversationWorkspaceCoordinatorTest {

    private fun ready(fake: FakeWorkspaceGateway): ConversationWorkspaceCoordinator {
        val c = ConversationWorkspaceCoordinator(fake)
        c.setHubAvailable(true)
        return c
    }

    @Test
    fun load_conversationWithWorkspace() = runBlocking {
        val fake = FakeWorkspaceGateway()
        fake.addWorkspace("w_x", "Libro")
        fake.association["c_a"] = "w_x"
        val c = ready(fake)
        c.load("c_a")
        assertEquals("Libro", c.state.conversationWorkspace?.name)
        assertFalse(c.state.loading)
        assertEquals("Libro", c.state.label())
    }

    @Test
    fun load_casualIsNull_sinWorkspace() = runBlocking {
        val fake = FakeWorkspaceGateway()
        fake.addWorkspace("w_x", "Libro")
        fake.association["c_c"] = null
        val c = ready(fake)
        c.load("c_c")
        assertNull(c.state.conversationWorkspace)
        assertEquals("Sin Workspace", c.state.label())
    }

    @Test
    fun select_change_and_clear() = runBlocking {
        val fake = FakeWorkspaceGateway()
        fake.addWorkspace("w_x", "X")
        fake.addWorkspace("w_y", "Y")
        val c = ready(fake)
        c.load("c_1")
        c.selectWorkspace("w_x")
        assertEquals("w_x", c.state.conversationWorkspace?.id)
        c.selectWorkspace("w_y")
        assertEquals("w_y", c.state.conversationWorkspace?.id)
        c.selectWorkspace(null)
        assertNull(c.state.conversationWorkspace)
        assertEquals("c_1", c.state.conversationId)
        assertEquals(null, fake.association["c_1"])
    }

    @Test
    fun create_withoutAutoAssociate() = runBlocking {
        val fake = FakeWorkspaceGateway()
        val c = ready(fake)
        c.load("c_1")
        c.setCreateName("Nuevo")
        c.createWorkspace(useAfterCreate = false)
        assertEquals(1, fake.workspaces.size)
        assertNull(c.state.conversationWorkspace)
    }

    @Test
    fun create_and_use() = runBlocking {
        val fake = FakeWorkspaceGateway()
        val c = ready(fake)
        c.load("c_1")
        c.setCreateName("Nuevo")
        c.createWorkspace(useAfterCreate = true)
        assertEquals("Nuevo", c.state.conversationWorkspace?.name)
    }

    @Test
    fun headerFollowsConversation_notAGlobalWorkspace() = runBlocking {
        val fake = FakeWorkspaceGateway()
        fake.addWorkspace("w_x", "X")
        fake.addWorkspace("w_y", "Y")
        val c = ready(fake)
        c.load("c_a")
        c.selectWorkspace("w_x")
        assertEquals("X", c.state.label())
        val b = executeHubConversationCreate(fake, hubConversationInWorkspace("B", "w_y"))
        c.load(b.id)
        assertEquals("Y", c.state.conversationWorkspace?.name)
        assertEquals("Y", c.state.label())
        c.load("c_a")
        assertEquals("X", c.state.conversationWorkspace?.name)
    }

    @Test
    fun twoConversationsIndependentAndShared() = runBlocking {
        val fake = FakeWorkspaceGateway()
        fake.addWorkspace("w_x", "X")
        fake.addWorkspace("w_y", "Y")
        fake.association["c_a"] = "w_x"
        fake.association["c_b"] = "w_y"
        val c = ready(fake)
        c.load("c_a")
        assertEquals("X", c.state.conversationWorkspace?.name)
        c.load("c_b")
        assertEquals("Y", c.state.conversationWorkspace?.name)
        fake.association["c_b"] = "w_x"
        c.load("c_b")
        assertEquals("X", c.state.conversationWorkspace?.name)
        c.load("c_a")
        assertEquals("X", c.state.conversationWorkspace?.name)
    }

    @Test
    fun errors_404_401_network() = runBlocking {
        val fake = FakeWorkspaceGateway()
        val c = ready(fake)
        c.load("c_missing")
        assertTrue(c.state.errorMessage!!.contains("Conversation"))
        fake.failKind = WorkspaceHttpKind.Unauthorized
        fake.failStatus = 401
        c.load("c_1")
        assertTrue(c.state.errorMessage!!.contains("token") || c.state.errorMessage!!.contains("autoriz"))
        fake.failKind = WorkspaceHttpKind.Network
        fake.failStatus = 0
        c.load("c_1")
        assertTrue(c.state.errorMessage!!.contains("red"))
    }

    @Test
    fun loading_flag_and_staleLoadIgnored() = runBlocking {
        val fake = FakeWorkspaceGateway()
        fake.addWorkspace("w_x", "X")
        fake.association["c_slow"] = "w_x"
        fake.delayMs = 40
        val c = ready(fake)
        coroutineScope {
            val slow = async { c.load("c_slow") }
            delay(5)
            fake.delayMs = 0
            fake.association["c_fast"] = null
            c.load("c_fast")
            slow.await()
        }
        assertNull(c.state.conversationWorkspace)
        assertEquals("c_fast", c.state.conversationId)
        assertFalse(c.state.loading)
    }

    @Test
    fun remount_reloadsFromGateway() = runBlocking {
        val fake = FakeWorkspaceGateway()
        fake.addWorkspace("w_x", "X")
        fake.association["c_1"] = "w_x"
        val first = ready(fake)
        first.load("c_1")
        assertEquals("X", first.state.conversationWorkspace?.name)
        fake.association["c_1"] = null
        val second = ready(fake)
        second.load("c_1")
        assertNull(second.state.conversationWorkspace)
    }

    @Test
    fun noActiveWorkspaceFields() {
        val names = ConversationWorkspaceUiState::class.java.declaredFields.map { it.name }
        assertFalse(names.any { it.contains("activeWorkspace", ignoreCase = true) })
    }
}
