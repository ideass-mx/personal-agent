/**
 * CapabilityExecutor — resolve + selección determinista + invoke.
 * Reutiliza ToolRegistry / RemoteAgentTool. No importa MCP SDK.
 * No enruta con AI, no balancea, no hace failover.
 */
import type { ToolPolicy } from "../tools/policy.ts";
import type { ToolRegistry } from "../tools/registry.ts";
import type { AgentTool, ToolContext, ToolResult } from "../tools/types.ts";
import {
  AGENT_DISCONNECTED,
  AGENT_TOOL_ERROR,
} from "../runtime/errors.ts";
import { REMOTE_TOOL_ERROR_CODE } from "../tools/remote.ts";
import type { CapabilityIndex } from "./capability-index.ts";
import {
  EXECUTION_SAFE_MESSAGES,
  newCapabilityRequestId,
  type CapabilityExecutionErrorCode,
  type CapabilityExecutionResult,
  type CapabilityRequest,
  type CapabilityResolution,
} from "./execution-types.ts";
import {
  selectDeterministicImplementation,
  toImplementationId,
} from "./select.ts";
import { assertCapabilityId } from "./types.ts";

/** Mirror of MCP adapter timeout code — no import del SDK MCP. */
const REMOTE_TOOL_TIMEOUT_CODE = "remote_tool_timeout";
export type CapabilityExecutorOptions = {
  readonly index: CapabilityIndex;
  /** Tools invocables (RemoteAgentTool hoy). */
  readonly tools: ToolRegistry;
  /** Policy del Agent (keys = CapabilityId). */
  readonly policy: ToolPolicy | (() => ToolPolicy);
  /**
   * Filtro enabledTools del Agent (opcional).
   * Si se omite, solo aplica ToolPolicy.
   */
  readonly isEnabled?: (capabilityId: string) => boolean;
};

export type CapabilityExecutor = {
  resolve(
    capabilityId: string,
    requestId?: string,
  ): CapabilityResolution | CapabilityExecutionResult;
  execute(request: CapabilityRequest): Promise<CapabilityExecutionResult>;
};

function readPolicy(
  policy: ToolPolicy | (() => ToolPolicy),
): ToolPolicy {
  return typeof policy === "function" ? policy() : policy;
}

function denied(
  requestId: string,
  code: CapabilityExecutionErrorCode = "policy_denied",
): CapabilityExecutionResult {
  return {
    requestId,
    status: "denied",
    error: {
      code,
      message: EXECUTION_SAFE_MESSAGES[code],
    },
  };
}

function failStatus(
  requestId: string,
  status: CapabilityExecutionResult["status"],
  code: CapabilityExecutionErrorCode,
  resolution?: CapabilityResolution,
): CapabilityExecutionResult {
  return {
    requestId,
    status,
    error: { code, message: EXECUTION_SAFE_MESSAGES[code] },
    resolution,
  };
}

function mapToolError(
  requestId: string,
  result: ToolResult & { ok: false },
  resolution: CapabilityResolution,
): CapabilityExecutionResult {
  const code = result.error.code;
  if (code === REMOTE_TOOL_TIMEOUT_CODE || /timeout/i.test(code)) {
    return failStatus(requestId, "timeout", "execution_timeout", resolution);
  }
  if (code === AGENT_DISCONNECTED || /disconnect|not connected/i.test(code)) {
    return failStatus(requestId, "unavailable", "transport_error", resolution);
  }
  if (code === REMOTE_TOOL_ERROR_CODE || code === AGENT_TOOL_ERROR) {
    return failStatus(requestId, "failed", "execution_failed", resolution);
  }
  if (/transport/i.test(code)) {
    return failStatus(requestId, "unavailable", "transport_error", resolution);
  }
  // Errores de dominio del Node (filesystem.*, etc.): el LLM necesita el
  // código real (file_not_found, access_denied, invalid_input…). Sin secretos.
  return {
    requestId,
    status: "failed",
    error: {
      code: sanitizeDomainErrorCode(code),
      message: sanitizeDomainErrorMessage(result.error.message),
    },
    resolution,
  };
}

const DOMAIN_ERROR_CODE_RE =
  /^[a-z][a-z0-9_]{0,63}$/;

function sanitizeDomainErrorCode(code: string): string {
  if (DOMAIN_ERROR_CODE_RE.test(code) && code !== "remote_tool_error") {
    return code;
  }
  return "execution_failed";
}

function sanitizeDomainErrorMessage(message: string): string {
  let out = message
    .replace(/\b(sk-[a-zA-Z0-9_-]+|HUB_TOKEN|api[_-]?key\s*[:=]\s*\S+)/gi, "[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]");
  if (out.length > 480) out = `${out.slice(0, 480)}…`;
  return out.trim().length > 0 ? out : EXECUTION_SAFE_MESSAGES.execution_failed;
}

function toToolResult(exec: CapabilityExecutionResult): ToolResult {
  if (exec.status === "success") {
    return {
      ok: true,
      content: exec.content ?? null,
      ...(exec.artifacts ? { artifacts: [...exec.artifacts] } : {}),
    };
  }
  return {
    ok: false,
    error: {
      code: exec.error?.code ?? "execution_failed",
      message:
        exec.error?.message ?? EXECUTION_SAFE_MESSAGES.execution_failed,
    },
  };
}

export function createCapabilityExecutor(
  options: CapabilityExecutorOptions,
): CapabilityExecutor {
  const { index, tools } = options;

  function authorize(capabilityId: string, requestId: string): CapabilityExecutionResult | null {
    if (options.isEnabled && !options.isEnabled(capabilityId)) {
      return denied(requestId, "policy_denied");
    }
    const policy = readPolicy(options.policy);
    if (policy[capabilityId] === undefined) {
      return denied(requestId, "policy_denied");
    }
    return null;
  }

  function resolveInternal(
    capabilityIdRaw: string,
    requestId: string,
  ): CapabilityResolution | CapabilityExecutionResult {
    let capabilityId: string;
    try {
      capabilityId = assertCapabilityId(capabilityIdRaw);
    } catch {
      return failStatus(requestId, "failed", "capability_not_found");
    }

    const auth = authorize(capabilityId, requestId);
    if (auth) return auth;

    if (!index.hasDescriptor(capabilityId)) {
      const candidates = index.resolve(capabilityId);
      if (candidates.length === 0) {
        return failStatus(requestId, "failed", "capability_not_found");
      }
    }

    const candidates = index.resolve(capabilityId);
    if (candidates.length === 0) {
      if (index.hasDescriptor(capabilityId)) {
        return failStatus(requestId, "unavailable", "target_unavailable");
      }
      return failStatus(requestId, "failed", "capability_not_found");
    }

    const selected = selectDeterministicImplementation(candidates);
    if (!selected) {
      return failStatus(
        requestId,
        "unavailable",
        "implementation_unavailable",
      );
    }

    return {
      requestId,
      capabilityId,
      implementationId: toImplementationId(selected),
      executionTargetId: selected.executionTargetId,
      toolName: selected.toolName,
      implementationKind: selected.implementationKind,
      transport: selected.transport,
    };
  }

  return {
    resolve(capabilityId, requestId = newCapabilityRequestId()) {
      return resolveInternal(capabilityId, requestId);
    },

    async execute(request: CapabilityRequest): Promise<CapabilityExecutionResult> {
      const requestId = request.requestId ?? newCapabilityRequestId();
      const resolved = resolveInternal(request.capabilityId, requestId);
      if ("status" in resolved) {
        return resolved;
      }
      const resolution = resolved;

      const tool: AgentTool | undefined = tools.get(resolution.toolName);
      if (!tool) {
        return failStatus(
          requestId,
          "unavailable",
          "implementation_unavailable",
          resolution,
        );
      }

      const context: ToolContext = {
        ...request.context,
        requestId,
      };

      let toolResult: ToolResult;
      try {
        toolResult = await tool.execute(request.input, context);
      } catch {
        return failStatus(
          requestId,
          "failed",
          "execution_failed",
          resolution,
        );
      }

      if (toolResult.ok) {
        return {
          requestId,
          status: "success",
          content: toolResult.content,
          artifacts: toolResult.artifacts,
          resolution,
        };
      }
      return mapToolError(requestId, toolResult, resolution);
    },
  };
}

/**
 * Envuelve ToolRegistry para que AgentRuntime invoque vía CapabilityExecutor.
 * Runtime no importa capabilities/; solo ve AgentTool.
 */
export function bindToolsToCapabilityExecutor(
  registry: ToolRegistry,
  executor: CapabilityExecutor,
): {
  get(name: string): AgentTool | undefined;
  list(): AgentTool[];
} {
  const wrap = (tool: AgentTool): AgentTool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    executionMode: tool.executionMode,
    async execute(input, context) {
      const exec = await executor.execute({
        capabilityId: tool.name,
        input,
        context,
        requestId: context.requestId,
      });
      return toToolResult(exec);
    },
  });

  return {
    get(name: string) {
      const tool = registry.get(name);
      return tool ? wrap(tool) : undefined;
    },
    list() {
      return registry.list().map(wrap);
    },
  };
}

export { toToolResult };
