/**
 * PHASE 57.5 — Tool Safety Policy evaluation.
 *
 * Maps PersonalAgent ToolPolicy (executionMode) to explicit safety decisions.
 * Not RBAC. Not per-Device roles. UserContext is accepted for audit/identity
 * binding only — deviceId does not change the decision.
 */
import type { UserContext } from "../identity/types.ts";
import type { ToolPolicy } from "./policy.ts";
import type { ToolExecutionMode } from "./types.ts";

export type ToolSafetyDecision =
  | "ALLOWED"
  | "CONFIRMATION_REQUIRED"
  | "DENIED";

export type ToolSafetyEvaluation = {
  readonly decision: ToolSafetyDecision;
  readonly reason: string;
  readonly toolName: string;
  readonly executionMode: ToolExecutionMode | null;
};

export type EvaluateToolSafetyInput = {
  toolName: string;
  /** AgentDefinition.toolPolicy (PersonalAgent policy). */
  policy: ToolPolicy;
  /**
   * Mode stamped on a registered AgentTool (from policy at discovery).
   * If absent and tool not in policy → DENIED (unknown / omit).
   */
  executionMode?: ToolExecutionMode;
  /**
   * Server-derived identity. Used for diagnostics binding only.
   * Must not drive per-device privilege tiers.
   */
  userContext?: UserContext;
};

function modeFromPolicy(
  policy: ToolPolicy,
  toolName: string,
): ToolExecutionMode | undefined {
  return policy[toolName];
}

function mapMode(mode: ToolExecutionMode): ToolSafetyDecision {
  return mode === "confirm" ? "CONFIRMATION_REQUIRED" : "ALLOWED";
}

/**
 * Evaluate whether a tool may run automatically, needs HITL, or is denied.
 * Unknown / omitted tools → DENIED (fail-closed; matches deny-by-omission).
 */
export function evaluateToolSafety(
  input: EvaluateToolSafetyInput,
): ToolSafetyEvaluation {
  const toolName = input.toolName;
  const fromStamp = input.executionMode;
  const fromPolicy = modeFromPolicy(input.policy, toolName);
  const mode = fromStamp ?? fromPolicy;

  // Identity binding checks (non-RBAC): never treat missing context as a role.
  // deviceId must not alter the decision — evaluated once from policy/mode.
  void input.userContext?.deviceId;
  void input.userContext?.userId;
  void input.userContext?.agentId;

  if (!mode) {
    return {
      decision: "DENIED",
      reason: "unknown_tool_deny_by_default",
      toolName,
      executionMode: null,
    };
  }

  const decision = mapMode(mode);
  return {
    decision,
    reason:
      decision === "ALLOWED"
        ? "policy_automatic"
        : "policy_confirmation_required",
    toolName,
    executionMode: mode,
  };
}

/** ToolResult for DENIED (registered but policy-denied, or unknown). */
export function toolSafetyDeniedResult(
  evaluation: ToolSafetyEvaluation,
  registered: boolean,
): {
  ok: false;
  error: { code: string; message: string };
} {
  if (!registered) {
    return {
      ok: false,
      error: {
        code: "tool_not_found",
        message: `Herramienta no encontrada: ${evaluation.toolName}`,
      },
    };
  }
  return {
    ok: false,
    error: {
      code: "policy_denied",
      message: `Tool denegada por política: ${evaluation.toolName}`,
    },
  };
}

/** Safe metadata for diagnostics (no secrets). */
export function toolSafetyDiagnosticMetadata(
  evaluation: ToolSafetyEvaluation,
  input: {
    sessionId?: string;
    deviceId?: string;
    userId?: string;
    agentId?: string;
  },
): Record<string, unknown> {
  return {
    tool: evaluation.toolName,
    decision: evaluation.decision,
    reason: evaluation.reason,
    executionMode: evaluation.executionMode,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.deviceId ? { deviceId: input.deviceId } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.agentId ? { agentId: input.agentId } : {}),
  };
}
