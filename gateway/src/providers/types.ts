/**
 * Contrato mínimo de proveedor LLM para el AgentRuntime.
 * Soporta chat con streaming de texto y tool calling básico (sin paralelo).
 */

export type LLMRole = "user" | "assistant";

export interface LLMToolDescriptor {
  name: string;
  description: string;
  /** JSON Schema-compatible. */
  inputSchema: Record<string, unknown>;
}

export type LLMContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | {
      type: "tool_result";
      toolCallId: string;
      content: string;
      isError?: boolean;
    };

export interface LLMMessage {
  role: LLMRole;
  content: string | LLMContentBlock[];
}

export interface LLMRequest {
  messages: LLMMessage[];
  tools?: LLMToolDescriptor[];
  /** Prompt del Agent Definition. */
  system?: string;
  /** Modelo del Agent Definition. */
  model?: string;
  /** Correlation id técnico de la request actual. */
  diagnosticId?: string;
  /** Preferencia de inteligencia de esta conversación (opcional). */
  intelligenceConnectionId?: string;
}

export type LLMEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "done" };

export interface LLMCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  vision: boolean;
  structuredOutput: boolean;
  maxContext?: number;
}

export interface LLMProvider {
  id?: string;
  capabilities?: LLMCapabilities;
  stream(request: LLMRequest): AsyncIterable<LLMEvent>;
}
