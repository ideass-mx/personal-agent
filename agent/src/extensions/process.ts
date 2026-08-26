/**
 * Extensión `process`: aporta `process.execute`.
 * Misma config de cwd/root que filesystem; sin ProcessConfig nuevo.
 */
import type { AgentConfig } from "../config.ts";
import { createProcessExecuteTool } from "../tools/process-execute.ts";
import type { AgentExtension } from "./types.ts";

export function createProcessExtension(
  config: AgentConfig = {},
): AgentExtension {
  return {
    name: "process",
    version: "1.0.0",
    tools: [createProcessExecuteTool({ root: config.filesystem?.root })],
  };
}
