/**
 * Extensión `system`: aporta system.info.
 * Código local empaquetado; no hay carga dinámica ni privilegios extra.
 */
import { systemInfoTool } from "../tools/system.ts";
import type { AgentExtension } from "./types.ts";

export const systemExtension: AgentExtension = {
  name: "system",
  version: "1.0.0",
  tools: [systemInfoTool],
};
