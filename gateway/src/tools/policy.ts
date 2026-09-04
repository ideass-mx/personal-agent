/**
 * Tool Policy: qué capabilities se autorizan y con qué executionMode.
 * Keys = CapabilityId (p. ej. filesystem.read). No son identidades de Node ni MCP session.
 * Es el dato de AgentDefinition.toolPolicy. ToolRegistry no es la definición del Agent.
 * Deny por omisión. No es un sistema general de permisos.
 */
import { HubAgentError, TOOL_POLICY_ERROR } from "../runtime/errors.ts";
import type { ToolExecutionMode } from "./types.ts";

export { TOOL_POLICY_ERROR };

export type ToolPolicy = Readonly<Record<string, ToolExecutionMode>>;

const TOOL_NAME_RE = /^[a-z][a-z0-9._-]{0,127}$/i;

/**
 * Policy del deployment por defecto (bundle Agent actual).
 * Ausencia de una tool = deny. No hay default automatic.
 */
export const DEFAULT_TOOL_POLICY: ToolPolicy = Object.freeze({
  "agent.echo": "automatic",
  "filesystem.read": "automatic",
  "filesystem.list": "automatic",
  "filesystem.write": "confirm",
  "process.execute": "confirm",
  "math.add": "automatic",
  "math.subtract": "automatic",
  "math.multiply": "automatic",
  "math.divide": "automatic",
  "system.info": "automatic",
  "diagnostics.ping": "automatic",
  "customer.demo": "automatic",
  "office.excel.read": "automatic",
  "office.excel.write": "confirm",
});

export function assertValidToolPolicy(value: unknown): ToolPolicy {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HubAgentError(
      TOOL_POLICY_ERROR,
      "Tool Policy inválida: se espera un objeto { [tool]: automatic|confirm }.",
    );
  }
  const rec = value as Record<string, unknown>;
  const out: Record<string, ToolExecutionMode> = {};
  for (const key of Object.keys(rec)) {
    if (typeof key !== "string" || key.length === 0 || key.trim() !== key) {
      throw new HubAgentError(
        TOOL_POLICY_ERROR,
        `Tool Policy: nombre de tool vacío o inválido: ${JSON.stringify(key)}`,
      );
    }
    if (!TOOL_NAME_RE.test(key)) {
      throw new HubAgentError(
        TOOL_POLICY_ERROR,
        `Tool Policy: nombre de tool inválido: ${key}`,
      );
    }
    const mode = rec[key];
    if (mode !== "automatic" && mode !== "confirm") {
      throw new HubAgentError(
        TOOL_POLICY_ERROR,
        `Tool Policy: executionMode inválido para ${key}: ${JSON.stringify(mode)}`,
      );
    }
    if (key in out) {
      throw new HubAgentError(
        TOOL_POLICY_ERROR,
        `Tool Policy: tool duplicada ${key}`,
      );
    }
    out[key] = mode;
  }
  return Object.freeze(out);
}

/**
 * Toda entrada de policy debe estar anunciada en tools/list.
 * Tools anunciadas sin policy se omiten (deny), no abortan.
 */
export function assertToolPolicyAnnounced(
  policy: ToolPolicy,
  announcedNames: Iterable<string>,
): void {
  const announced = new Set(announcedNames);
  for (const name of Object.keys(policy)) {
    if (!announced.has(name)) {
      throw new HubAgentError(
        TOOL_POLICY_ERROR,
        `Tool Policy referencia tool no anunciada por el Agent: ${name}`,
      );
    }
  }
}

export function omitToolPolicyKeys(
  policy: ToolPolicy,
  keys: readonly string[],
): ToolPolicy {
  const drop = new Set(keys);
  const next: Record<string, ToolExecutionMode> = {};
  for (const [name, mode] of Object.entries(policy)) {
    if (!drop.has(name)) next[name] = mode;
  }
  return Object.freeze(next);
}
