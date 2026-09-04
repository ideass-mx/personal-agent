/**
 * Extensiones integradas del Agent.
 * Lista estática: sin import() dinámico, sin marketplace.
 */
import type { AgentConfig } from "../config.ts";
import { echoExtension } from "./echo.ts";
import { createFilesystemExtension } from "./filesystem.ts";
import { mathExtension } from "./math.ts";
import { createProcessExtension } from "./process.ts";
import { systemExtension } from "./system.ts";
import { diagnosticsExtension } from "./diagnostics.ts";
import { customerDemoExtension } from "./customer-demo.ts";
import { createOfficeExtension } from "./office.ts";
import type { AgentExtension } from "./types.ts";

export function createDefaultExtensions(
  config: AgentConfig = {},
): AgentExtension[] {
  return [
    echoExtension,
    createFilesystemExtension(config),
    createProcessExtension(config),
    mathExtension,
    systemExtension,
    diagnosticsExtension,
    customerDemoExtension,
    createOfficeExtension(config),
  ];
}
