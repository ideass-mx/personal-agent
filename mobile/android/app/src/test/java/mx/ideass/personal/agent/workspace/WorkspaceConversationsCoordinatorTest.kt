package mx.ideass.personal.agent.workspace

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WorkspaceConversationsCoordinatorTest {

    @Test
    fun emptyWorkspace_listsNothing() = runBlocking {
        val fake = FakeWorkspaceGateway()
        fake.addWorkspace("w_a", "A")
        val c = WorkspaceConversationsCoordinator(fake)
        c.open(fake.workspaces.getValue("w_a"))
        assertTrue(c.state.conversations.isEmpty())
        assertFalse(c.state.loading)
        assertEquals("w_a", c.state.listingWorkspace?.id)
    }

    @Test
    fun listsOnlyThatWorkspace_inDeterministicOrder_excludesCasual() = runBlocking {
        val fake = FakeWorkspaceGateway()
        fake.addWorkspace("w_a", "A")
        fake.addWorkspace("w_b", "B")
        fake.conversations["c_old"] = ConversationRecordDto(
            id = "c_old",
            title = "vieja",
            createdAt = "2026-01-01",
            workspaceId = "w_a",
        )
        fake.conversations["c_new"] = ConversationRecordDto(
            id = "c_new",
            title = "nueva",
            createdAt = "2026-02-01",
            workspaceId = "w_a",
        )
        fake.conversations["c_b"] = ConversationRecordDto(
            id = "c_b",
            title = "B",
            createdAt = "2026-03-01",
            workspaceId = "w_b",
        )
        fake.conversations["c_casual"] = ConversationRecordDto(
            id = "c_casual",
            title = "casual",
            createdAt = "2026-04-01",
            workspaceId = null,
        )
        val c = WorkspaceConversationsCoordinator(fake)
        c.open(fake.workspaces.getValue("w_a"))
        assertEquals(listOf("c_new", "c_old"), c.state.conversations.map { it.id })
        assertFalse(c.state.conversations.any { it.id == "c_b" })
        assertFalse(c.state.conversations.any { it.id == "c_casual" })
    }

    @Test
    fun selectConversation_keepsIdForChat() = runBlocking {
        val fake = FakeWorkspaceGateway()
        fake.addWorkspace("w_a", "A")
        val created = executeHubConversationCreate(
            fake,
            hubConversationInWorkspace("Libro", "w_a"),
        )
        val c = WorkspaceConversationsCoordinator(fake)
        c.open(fake.workspaces.getValue("w_a"))
        val chosen = c.state.conversations.single()
        assertEquals(created.id, chosen.id)
        assertEquals("Libro", conversationListTitle(chosen))
        assertEquals("w_a", chosen.workspaceId)
    }

    @Test
    fun moveWorkspace_leavesPreviousList() = runBlocking {
        val fake = FakeWorkspaceGateway()
        fake.addWorkspace("w_a", "A")
        fake.addWorkspace("w_b", "B")
        val conv = executeHubConversationCreate(
            fake,
            hubConversationInWorkspace("Mover", "w_a"),
        )
        fake.setConversationWorkspace(conv.id, "w_b")
        val c = WorkspaceConversationsCoordinator(fake)
        c.open(fake.workspaces.getValue("w_a"))
        assertTrue(c.state.conversations.none { it.id == conv.id })
        c.open(fake.workspaces.getValue("w_b"))
        assertEquals(conv.id, c.state.conversations.single().id)
    }

    @Test
    fun deleteWorkspace_conversationRemainsCasual_list404() = runBlocking {
        val fake = FakeWorkspaceGateway()
        fake.addWorkspace("w_a", "A")
        val conv = executeHubConversationCreate(
            fake,
            hubConversationInWorkspace("Keep", "w_a"),
        )
        fake.removeWorkspace("w_a")
        assertNull(fake.conversations[conv.id]?.workspaceId)
        val c = WorkspaceConversationsCoordinator(fake)
        c.open(WorkspaceDto(id = "w_a", name = "A", createdAt = "t", updatedAt = "t"))
        assertTrue(c.state.conversations.isEmpty())
        assertEquals("Workspace inexistente.", c.state.errorMessage)
    }
}
