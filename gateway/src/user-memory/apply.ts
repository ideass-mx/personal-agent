/**
 * Aplica el resultado del evaluador al store (y Agent Rules si aplica).
 */
import {
  createAgentRule,
} from "../agent-rules/store.ts";
import type { EvaluateResult, MemoryCandidate, UserMemory } from "./types.ts";
import {
  createUserMemory,
  mergeIntoUserMemory,
  supersedeUserMemory,
  updateUserMemory,
} from "./store.ts";

export type ApplyResult = {
  readonly applied: boolean;
  readonly outcome: EvaluateResult["outcome"];
  readonly reason: string;
  readonly memory?: UserMemory;
  readonly agentRuleId?: string;
};

function toCreateInput(
  userId: string,
  candidate: Required<Pick<MemoryCandidate, "content" | "category" | "type" | "scope">> &
    MemoryCandidate,
) {
  return {
    userId,
    content: candidate.content,
    category: candidate.category,
    type: candidate.type,
    scope: candidate.scope,
    importance: candidate.importance,
    confidence: candidate.confidence,
    sourceType: candidate.sourceType ?? null,
    sourceId: candidate.sourceId ?? null,
    sourceReason: candidate.sourceReason ?? null,
    projectId: candidate.projectId ?? null,
  };
}

export function applyEvaluateResult(
  userId: string,
  result: EvaluateResult,
): ApplyResult {
  switch (result.outcome) {
    case "IGNORE":
      return {
        applied: false,
        outcome: "IGNORE",
        reason: result.reason,
      };
    case "ROUTE_TO_AGENT_RULE": {
      const rule = createAgentRule({
        userId,
        content: result.content,
        sourceType: "memory_pipeline",
      });
      return {
        applied: true,
        outcome: "ROUTE_TO_AGENT_RULE",
        reason: result.reason,
        agentRuleId: rule.id,
      };
    }
    case "CREATE":
    case "PROMOTE_TO_GLOBAL": {
      const memory = createUserMemory(
        toCreateInput(userId, {
          ...result.candidate,
          scope:
            result.outcome === "PROMOTE_TO_GLOBAL"
              ? "GLOBAL"
              : result.candidate.scope,
          type:
            result.outcome === "PROMOTE_TO_GLOBAL"
              ? "PROJECT_DERIVED"
              : result.candidate.type,
        }),
      );
      return {
        applied: true,
        outcome: result.outcome,
        reason: result.reason,
        memory,
      };
    }
    case "UPDATE": {
      const memory = updateUserMemory(result.targetId, {
        content: result.candidate.content,
        category: result.candidate.category,
        type: result.candidate.type,
        confidence: result.candidate.confidence,
        sourceReason: result.candidate.sourceReason,
      });
      return {
        applied: true,
        outcome: "UPDATE",
        reason: result.reason,
        memory,
      };
    }
    case "MERGE": {
      const memory = mergeIntoUserMemory(result.targetId, {
        content: result.candidate.content,
        confidenceBoost: 0.1,
        sourceReason: result.candidate.sourceReason,
      });
      return {
        applied: true,
        outcome: "MERGE",
        reason: result.reason,
        memory,
      };
    }
    case "SUPERSEDE": {
      const { next } = supersedeUserMemory(
        result.targetId,
        toCreateInput(userId, result.candidate),
      );
      return {
        applied: true,
        outcome: "SUPERSEDE",
        reason: result.reason,
        memory: next,
      };
    }
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}
