package mx.ideass.personal.agent.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceOriginPolicyTest {
    @Test
    fun assistantInvocation_createsStreakAndTitles() {
        val plan = VoiceOriginPolicy.bindPlan(VoiceOrigin.AssistantInvocation)
        assertEquals(VoiceBindPlan.CreateStreak, plan)
        assertTrue(VoiceOriginPolicy.titlesOnHang(plan))
    }

    @Test
    fun inConversation_usesKeyWithoutTitle() {
        val plan = VoiceOriginPolicy.bindPlan(
            VoiceOrigin.InConversation("agent:main:dashboard:work-1"),
        )
        assertEquals(
            VoiceBindPlan.UseExisting("agent:main:dashboard:work-1"),
            plan,
        )
        assertFalse(VoiceOriginPolicy.titlesOnHang(plan))
    }

    @Test
    fun inConversation_blankKey_invalid() {
        assertEquals(
            VoiceBindPlan.Invalid,
            VoiceOriginPolicy.bindPlan(VoiceOrigin.InConversation("  ")),
        )
        assertFalse(VoiceOriginPolicy.titlesOnHang(VoiceBindPlan.Invalid))
    }
}
