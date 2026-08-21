import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.ts";
import type { HistoryEntry } from "../memory/history.ts";
import { SYSTEM_PROMPT } from "../agent/prompts.ts";

const client = new Anthropic({ apiKey: config.anthropicApiKey });

/**
 * Genera la respuesta del agente en streaming, pedazo a pedazo.
 * `history` ya incluye el último mensaje del usuario.
 */
export async function* streamReply(
  history: HistoryEntry[],
): AsyncGenerator<string> {
  const stream = client.messages.stream({
    model: config.model,
    max_tokens: config.maxTokens,
    system: SYSTEM_PROMPT,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      yield event.delta.text;
    }
  }
}
