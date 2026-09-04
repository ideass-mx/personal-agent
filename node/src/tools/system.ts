/**
 * system.info — metadatos no privilegiados del proceso Node.
 * Sin spawn, filesystem ni variables de entorno.
 */
import type { AgentTool, ToolResult } from "./types.ts";

export const SYSTEM_INFO_NAME = "system.info";

const EMPTY_INPUT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export const systemInfoTool: AgentTool = {
  name: SYSTEM_INFO_NAME,
  description:
    "Información no privilegiada del proceso Agent: platform, arch, nodeVersion, pid.",
  inputSchema: EMPTY_INPUT_SCHEMA,
  executionMode: "automatic",
  async execute(): Promise<ToolResult> {
    return {
      ok: true,
      content: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        pid: process.pid,
      },
    };
  },
};
