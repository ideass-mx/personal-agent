/**
 * Extensión `filesystem`: read, list y write.
 * Recibe NodeConfig (filesystem.root); no lee process.env aquí.
 */
import type { AgentConfig } from "../config.ts";
import { createFilesystemListTool } from "../tools/filesystem-list.ts";
import { createFilesystemReadTool } from "../tools/filesystem-read.ts";
import { createFilesystemWriteTool } from "../tools/filesystem-write.ts";
import type { AgentExtension } from "./types.ts";

export function createFilesystemExtension(
  config: AgentConfig = {},
): AgentExtension {
  const root = config.filesystem?.root;
  return {
    name: "filesystem",
    version: "1.0.0",
    tools: [
      createFilesystemReadTool({ root }),
      createFilesystemListTool({ root }),
      createFilesystemWriteTool({ root }),
    ],
  };
}
