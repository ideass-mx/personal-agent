/**
 * Extensión `echo`: aporta `agent.echo` (compatibilidad histórica;
 * el namespace canónico sería `echo.*`, pero no se renombra).
 * Código local empaquetado; no hay carga dinámica.
 */
import { agentEchoTool } from "../tools/echo.ts";
import type { AgentExtension } from "./types.ts";

export const echoExtension: AgentExtension = {
  name: "echo",
  version: "1.0.0",
  tools: [agentEchoTool],
};
