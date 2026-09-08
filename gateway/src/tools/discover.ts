/**
 * Descubre Tools del MCP Server local (proceso `agent/`) vía listTools
 * y las registra como RemoteAgentTool. No importa el SDK MCP.
 * executionMode: Tool Policy del Agent (AgentDefinition.toolPolicy).
 * Si no se pasa policy, se usa DEFAULT_TOOL_POLICY (mismo default del Agent implícito).
 * Omitir una tool en la policy = deny, nunca allow-all.
 */
import { HubAgentError, MCP_DISCOVERY_ERROR } from "../runtime/errors.ts";
import {
  syncLocalNodeCapabilities,
  type CapabilityIndex,
} from "../capabilities/index.ts";
import type { RemoteToolExecutor } from "./remote.ts";
import { createRemoteAgentTool } from "./remote.ts";
import { ToolRegistry } from "./registry.ts";
import {
  DEFAULT_TOOL_POLICY,
  assertToolPolicyAnnounced,
  assertValidToolPolicy,
  type ToolPolicy,
} from "./policy.ts";
import {
  GENERIC_INPUT_SCHEMA,
  sanitizeDiscoveredInputSchema,
} from "./schema-sanitize.ts";

export { GENERIC_INPUT_SCHEMA, sanitizeDiscoveredInputSchema };
export {
  SCHEMA_FALLBACK_KEY,
  isSchemaFallback,
} from "./schema-sanitize.ts";

const PROCESS_EXECUTE_DEFAULT_TIMEOUT_MS = 30_000;
const PROCESS_EXECUTE_MIN_TIMEOUT_MS = 1_000;
const PROCESS_EXECUTE_MAX_TIMEOUT_MS = 120_000;
const PROCESS_EXECUTE_MCP_SLACK_MS = 5_000;

/** Debe superar EXCEL_COM_TIMEOUT_MS (15s en Agent). No cambia filesystem/echo. */
export const OFFICE_EXCEL_MCP_TIMEOUT_MS = 20_000;

export function mcpTimeoutMsForOfficeExcel(): number {
  return OFFICE_EXCEL_MCP_TIMEOUT_MS;
}

export function mcpTimeoutMsForProcessExecute(input: unknown): number {
  if (typeof input === "object" && input !== null) {
    const raw = (input as { timeoutMs?: unknown }).timeoutMs;
    if (
      typeof raw === "number" &&
      Number.isInteger(raw) &&
      raw >= PROCESS_EXECUTE_MIN_TIMEOUT_MS &&
      raw <= PROCESS_EXECUTE_MAX_TIMEOUT_MS
    ) {
      return raw + PROCESS_EXECUTE_MCP_SLACK_MS;
    }
  }
  return PROCESS_EXECUTE_DEFAULT_TIMEOUT_MS + PROCESS_EXECUTE_MCP_SLACK_MS;
}

const REQUIRED_AGENT_TOOLS = [
  "filesystem.search",
  "filesystem.read",
  "filesystem.list",
  "filesystem.write",
  "filesystem.delete",
  "process.execute",
] as const;

const TOOL_NAME_RE = /^[a-z][a-z0-9._-]{0,127}$/i;

export type ListedMcpTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

/** Cliente MCP estructural: discovery no importa el SDK. */
export type McpListToolsClient = {
  listTools(): Promise<{ tools: ListedMcpTool[] }>;
};

export type RegisterDiscoveredAgentToolsOptions = {
  policy?: unknown;
  /**
   * Índice de capabilities (PHASE 63). Discovery MCP → ToolImplementation.
   * Opcional: tests legacy pueden omitirlo.
   */
  capabilityIndex?: CapabilityIndex;
};

export function isValidDiscoveredToolName(name: string): boolean {
  return TOOL_NAME_RE.test(name);
}

function timeoutMsForDiscoveredTool(
  name: string,
): ((input: unknown) => number) | undefined {
  if (name === "process.execute") return mcpTimeoutMsForProcessExecute;
  if (name === "office.excel.read" || name === "office.excel.write") {
    return () => mcpTimeoutMsForOfficeExcel();
  }
  return undefined;
}

export function isValidDiscoveredInputSchema(schema: unknown): boolean {
  return typeof schema === "object" && schema !== null && !Array.isArray(schema);
}

export function assertListedAgentTools(tools: ListedMcpTool[]): void {
  const seen = new Set<string>();
  for (const tool of tools) {
    if (typeof tool.name !== "string" || !isValidDiscoveredToolName(tool.name)) {
      throw new HubAgentError(
        MCP_DISCOVERY_ERROR,
        `Tool MCP con nombre inválido: ${String(tool.name)}`,
      );
    }
    if (seen.has(tool.name)) {
      throw new HubAgentError(
        MCP_DISCOVERY_ERROR,
        `Tool MCP duplicada: ${tool.name}`,
      );
    }
    seen.add(tool.name);
    if (
      tool.inputSchema !== undefined &&
      !isValidDiscoveredInputSchema(tool.inputSchema)
    ) {
      throw new HubAgentError(
        MCP_DISCOVERY_ERROR,
        `Tool MCP sin schema válido: ${tool.name}`,
      );
    }
  }
  for (const required of REQUIRED_AGENT_TOOLS) {
    if (!seen.has(required)) {
      throw new HubAgentError(
        MCP_DISCOVERY_ERROR,
        `Falta tool requerida del Agent: ${required}`,
      );
    }
  }
}

export async function registerDiscoveredAgentTools(
  registry: ToolRegistry,
  client: McpListToolsClient,
  executor: RemoteToolExecutor,
  options: RegisterDiscoveredAgentToolsOptions = {},
): Promise<string[]> {
  const policy: ToolPolicy = assertValidToolPolicy(
    options.policy ?? DEFAULT_TOOL_POLICY,
  );
  const listed = await client.listTools();
  assertListedAgentTools(listed.tools);
  assertToolPolicyAnnounced(
    policy,
    listed.tools.map((t) => t.name),
  );
  const registered: string[] = [];
  for (const tool of listed.tools) {
    const executionMode = policy[tool.name];
    if (executionMode === undefined) continue;
    const sanitized = sanitizeDiscoveredInputSchema(tool.inputSchema);
    registry.register(
      createRemoteAgentTool({
        name: tool.name,
        description: tool.description ?? tool.name,
        inputSchema: sanitized.schema,
        executionMode,
        executor,
        timeoutMsFor: timeoutMsForDiscoveredTool(tool.name),
      }),
    );
    registered.push(tool.name);
  }
  for (const required of REQUIRED_AGENT_TOOLS) {
    if (!registered.includes(required)) {
      throw new HubAgentError(
        MCP_DISCOVERY_ERROR,
        `Tool requerida no autorizada por Tool Policy: ${required}`,
      );
    }
  }
  if (options.capabilityIndex) {
    syncLocalNodeCapabilities(
      options.capabilityIndex,
      listed.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    );
  }
  return registered;
}
