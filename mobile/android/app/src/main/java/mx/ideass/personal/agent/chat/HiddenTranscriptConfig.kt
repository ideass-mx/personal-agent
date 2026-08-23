package mx.ideass.personal.agent.chat

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import mx.ideass.personal.agent.R
import javax.inject.Inject
import javax.inject.Singleton

/** Prompts de voz ocultables, leídos de recursos (marca blanca). */
@Singleton
class HiddenTranscriptConfig @Inject constructor(
    @ApplicationContext context: Context,
) {
    val styleInstruction: String =
        context.getString(R.string.voice_style_instruction)

    val styleSeparator: String =
        context.getString(R.string.voice_style_separator)

    val styleInstructionHistory: List<String> =
        context.resources.getStringArray(R.array.voice_style_instruction_history).toList()

    val titlePromptHistory: List<String> =
        context.resources.getStringArray(R.array.voice_streak_title_prompt_history).toList()
}
