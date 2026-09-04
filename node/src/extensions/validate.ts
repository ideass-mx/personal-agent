/**
 * Validación fail-closed de Agent Extensions.
 * Sin schema framework: reglas mínimas reutilizando la forma de AgentTool.
 */
import type { AgentTool } from "../tools/types.ts";
import type { AgentExtension } from "./types.ts";

/** Nombre público MCP: `filesystem.read`, `agent.echo`. */
export const TOOL_NAME_RE = /^[a-z][a-z0-9._-]{0,127}$/i;

/**
 * Identidad de extensión: corta, sin path, URL ni punto
 * (el punto separa namespace de tool).
 */
export const EXTENSION_NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;

/**
 * Parte local tras `<extension>.`.
 * Un segmento (`read`) o anidado (`excel.read`) bajo el mismo namespace.
 * No autoriza tools de otra extensión (`filesystem.read` en `office`).
 */
export const TOOL_LOCAL_NAME_RE =
  /^[a-z][a-z0-9_-]{0,63}(\.[a-z][a-z0-9_-]{0,63}){0,3}$/;

export const ECHO_EXTENSION_NAME = "echo";
/** Compatibilidad histórica: la extensión `echo` expone `agent.echo`. */
export const ECHO_COMPAT_TOOL_NAME = "agent.echo";

export function isValidToolName(name: string): boolean {
  return TOOL_NAME_RE.test(name);
}

export function isValidExtensionName(name: string): boolean {
  return EXTENSION_NAME_RE.test(name);
}

/**
 * `echo` → `agent.echo` (excepción documentada).
 * Resto: `<extension-name>.<local>` p. ej. `filesystem.read`.
 */
export function isToolInExtensionNamespace(
  extensionName: string,
  toolName: string,
): boolean {
  if (extensionName === ECHO_EXTENSION_NAME) {
    return toolName === ECHO_COMPAT_TOOL_NAME;
  }
  const prefix = `${extensionName}.`;
  if (!toolName.startsWith(prefix)) return false;
  return TOOL_LOCAL_NAME_RE.test(toolName.slice(prefix.length));
}

export function assertValidAgentTool(tool: unknown, context: string): AgentTool {
  if (typeof tool !== "object" || tool === null) {
    throw new Error(`${context}: AgentTool inválida`);
  }
  const rec = tool as Partial<AgentTool>;
  if (typeof rec.name !== "string" || !isValidToolName(rec.name)) {
    throw new Error(`${context}: nombre de tool inválido`);
  }
  if (typeof rec.description !== "string" || rec.description.length === 0) {
    throw new Error(`${context}: description inválida (${rec.name})`);
  }
  if (typeof rec.execute !== "function") {
    throw new Error(`${context}: execute inválido (${rec.name})`);
  }
  if (
    rec.inputSchema !== undefined &&
    (typeof rec.inputSchema !== "object" || rec.inputSchema === null)
  ) {
    throw new Error(`${context}: inputSchema inválido (${rec.name})`);
  }
  return rec as AgentTool;
}

/**
 * Extensión sin tools: válida y no-op (no registra nada).
 * Extensión inválida: lanza; el caller no debe arrancar MCP.
 */
export function assertValidExtension(extension: unknown): AgentExtension {
  if (typeof extension !== "object" || extension === null) {
    throw new Error("Extensión inválida: no es un objeto");
  }
  const rec = extension as Partial<AgentExtension>;
  if (typeof rec.name !== "string" || !isValidExtensionName(rec.name)) {
    throw new Error(
      `Extensión inválida: name ${JSON.stringify(rec.name)}`,
    );
  }
  if (rec.version !== undefined && typeof rec.version !== "string") {
    throw new Error(`Extensión "${rec.name}": version inválida`);
  }
  if (!Array.isArray(rec.tools)) {
    throw new Error(`Extensión "${rec.name}": tools debe ser un array`);
  }
  const seen = new Set<string>();
  const tools: AgentTool[] = [];
  for (const tool of rec.tools) {
    const valid = assertValidAgentTool(tool, `Extensión "${rec.name}"`);
    if (!isToolInExtensionNamespace(rec.name, valid.name)) {
      throw new Error(
        `Extensión "${rec.name}": tool fuera de namespace ${valid.name}`,
      );
    }
    if (seen.has(valid.name)) {
      throw new Error(
        `Extensión "${rec.name}": tool duplicada ${valid.name}`,
      );
    }
    seen.add(valid.name);
    tools.push(valid);
  }
  return {
    name: rec.name,
    ...(rec.version !== undefined ? { version: rec.version } : {}),
    tools,
  };
}
