import type { AgentTool } from "./types.ts";
import type { LLMToolDescriptor } from "../providers/types.ts";

/** Descriptor seguro para el LLM: sin execute, executionMode ni datos privados. */
export function toLLMToolDescriptor(tool: AgentTool): LLMToolDescriptor {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}
