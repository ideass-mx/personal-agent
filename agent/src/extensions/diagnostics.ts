/**
 * Extensión `diagnostics`: aporta diagnostics.ping.
 * Código local empaquetado; no hay carga dinámica ni privilegios extra.
 */
import { diagnosticsPingTool } from "../tools/diagnostics.ts";
import type { AgentExtension } from "./types.ts";

export const diagnosticsExtension: AgentExtension = {
  name: "diagnostics",
  version: "1.0.0",
  tools: [diagnosticsPingTool],
};
