package mx.ideass.personal.agent.workspace

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class HubConversationCreateTest {

    @Test
    fun casual_isNull_doesNotInheritPreviousWorkspace() = runBlocking {
        val fake = FakeWorkspaceGateway()
        fake.addWorkspace("w_x", "Libro")
        val previous = executeHubConversationCreate(
            fake,
            hubConversationInWorkspace("A", "w_x"),
        )
        val casual = hubCasualConversation("Desde X")
        assertNull(casual.workspaceId)
        val created = executeHubConversationCreate(fake, casual)
        assertNull(created.workspaceId)
        assertEquals("w_x", fake.conversations[previous.id]?.workspaceId)
        assertNotEquals(previous.id, created.id)
    }

    @Test
    fun inWorkspace_persistsX_andNavigatesToNewId() = runBlocking {
        val fake = FakeWorkspaceGateway()
        fake.addWorkspace("w_x", "Libro")
        val created = executeHubConversationCreate(
            fake,
            hubConversationInWorkspace("B", "w_x"),
        )
        assertEquals("w_x", created.workspaceId)
        assertEquals("w_x", fake.association[created.id])
        assertEquals("B", created.title)
    }

    @Test
    fun twoConversations_sameWorkspace_distinctIds() = runBlocking {
        val fake = FakeWorkspaceGateway()
        fake.addWorkspace("w_x", "X")
        val a = executeHubConversationCreate(fake, hubConversationInWorkspace("A", "w_x"))
        val b = executeHubConversationCreate(fake, hubConversationInWorkspace("B", "w_x"))
        assertEquals("w_x", a.workspaceId)
        assertEquals("w_x", b.workspaceId)
        assertNotEquals(a.id, b.id)
    }

    @Test
    fun creatingB_doesNotChangeA() = runBlocking {
        val fake = FakeWorkspaceGateway()
        fake.addWorkspace("w_x", "X")
        fake.addWorkspace("w_y", "Y")
        val a = executeHubConversationCreate(fake, hubConversationInWorkspace("A", "w_x"))
        val b = executeHubConversationCreate(fake, hubConversationInWorkspace("B", "w_y"))
        assertEquals("w_x", fake.conversations[a.id]?.workspaceId)
        assertEquals("w_y", b.workspaceId)
    }

    @Test
    fun missingWorkspace_errors() {
        val fake = FakeWorkspaceGateway()
        assertThrows(WorkspaceHttpException::class.java) {
            runBlocking {
                executeHubConversationCreate(fake, hubConversationInWorkspace("Z", "w_nope"))
            }
        }
    }
}
