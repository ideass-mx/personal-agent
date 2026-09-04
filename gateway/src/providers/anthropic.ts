import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_AGENT_MODEL } from "../agents/definition.ts";
import { SYSTEM_PROMPT } from "../agents/prompts.ts";
import { config } from "../config.ts";
import type {
  LLMContentBlock,
  LLMMessage,
  LLMProvider,
  LLMRequest,
} from "./types.ts";

function toAnthropicContent(
  content: string | LLMContentBlock[],
): string | Anthropic.ContentBlockParam[] {
  if (typeof content === "string") return content;

  return content.map((block): Anthropic.ContentBlockParam => {
    switch (block.type) {
      case "text":
        return { type: "text", text: block.text };
      case "tool_call":
        return {
          type: "tool_use",
          id: block.id,
          name: block.name,
          input:
            typeof block.input === "object" && block.input !== null
              ? (block.input as Record<string, unknown>)
              : {},
        };
      case "tool_result":
        return {
          type: "tool_result",
          tool_use_id: block.toolCallId,
          content: block.content,
          is_error: block.isError,
        };
    }
  });
}

function toAnthropicMessages(
  messages: LLMMessage[],
): Anthropic.MessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content: toAnthropicContent(m.content),
  }));
}

/** Provider concreto Anthropic. El SDK no debe usarse fuera de este módulo. */
export function createAnthropicProvider(): LLMProvider {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  return {
    async *stream(request: LLMRequest) {
      const params: Anthropic.MessageCreateParams = {
        // Modelo efectivo: AgentDefinition vía Runtime (request.model).
        model: request.model ?? DEFAULT_AGENT_MODEL,
        max_tokens: config.maxTokens,
        system: request.system ?? SYSTEM_PROMPT,
        messages: toAnthropicMessages(request.messages),
      };

      if (request.tools && request.tools.length > 0) {
        params.tools = request.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        }));
      }

      const stream = client.messages.stream(params);

      let currentTool: { id: string; name: string; json: string } | null =
        null;

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "tool_use") {
            currentTool = { id: block.id, name: block.name, json: "" };
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            yield { type: "text_delta", text: event.delta.text };
          } else if (
            event.delta.type === "input_json_delta" &&
            currentTool
          ) {
            currentTool.json += event.delta.partial_json;
          }
        } else if (event.type === "content_block_stop" && currentTool) {
          let input: unknown = {};
          try {
            input = currentTool.json ? JSON.parse(currentTool.json) : {};
          } catch {
            input = {};
          }
          yield {
            type: "tool_call",
            id: currentTool.id,
            name: currentTool.name,
            input,
          };
          currentTool = null;
        }
      }

      yield { type: "done" };
    },
  };
}
