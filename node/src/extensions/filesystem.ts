/**
 * Extensión `filesystem`: search, read, list, write, delete (PHASE 59).
 * Recibe NodeConfig (filesystem.root); root ancla relativos / cerca escritura.
 */
import type { AgentConfig } from "../config.ts";
import { createFilesystemDeleteTool } from "../tools/filesystem-delete.ts";
import { createFilesystemListTool } from "../tools/filesystem-list.ts";
import { createFilesystemReadTool } from "../tools/filesystem-read.ts";
import { createFilesystemSearchTool } from "../tools/filesystem-search.ts";
import { createFilesystemWriteTool } from "../tools/filesystem-write.ts";
import type { AgentExtension } from "./types.ts";

export function createFilesystemExtension(
  config: AgentConfig = {},
): AgentExtension {
  const root = config.filesystem?.root;
  return {
    name: "filesystem",
    version: "1.1.0",
    tools: [
      // Búsqueda amplia: no usa filesystem.root como cerca (PHASE 59).
      createFilesystemSearchTool(),
      createFilesystemReadTool({ root }),
      createFilesystemListTool({ root }),
      createFilesystemWriteTool({ root }),
      createFilesystemDeleteTool({ root }),
    ],
  };
}
