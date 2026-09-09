/**
 * PHASE 64 — Structured UI contract (semantic results, never HTML/JSX).
 * AgentRuntime decides WHAT happened; Experience Layer describes results;
 * Channel Renderer decides presentation.
 */

export type ExperienceActionVariant = "primary" | "secondary" | "danger";

export type ExperienceAction = {
  id: string;
  label: string;
  action: string;
  variant?: ExperienceActionVariant;
};

/** Aligns with PHASE 60.15.1 AgentSource (wire/protocol). */
export type ExperienceSource = {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  sourceType?: "web" | "academic" | "knowledge" | "official";
};

export type CardBlock = {
  type: "card";
  title: string;
  description?: string;
  metadata?: Record<string, string>;
  actions?: ExperienceAction[];
};

export type TableBlock = {
  type: "table";
  title?: string;
  columns: string[];
  rows: string[][];
};

export type ProgressStep = {
  id: string;
  label: string;
  status: "pending" | "active" | "completed" | "failed";
};

export type ProgressBlock = {
  type: "progress";
  title: string;
  status: "working" | "completed" | "failed";
  steps: ProgressStep[];
};

export type ResearchItem = {
  id: string;
  title: string;
  description?: string;
  metadata?: Record<string, string>;
};

export type ResearchBlock = {
  type: "research";
  title: string;
  status: "idle" | "working" | "completed" | "failed";
  summary?: string;
  resultCount?: number;
  items?: ResearchItem[];
  sources?: ExperienceSource[];
  actions?: ExperienceAction[];
};

export type ComparisonColumn = {
  id: string;
  title: string;
  attributes: Record<string, string>;
};

export type ComparisonBlock = {
  type: "comparison";
  title: string;
  columns: ComparisonColumn[];
};

export type SourcesBlock = {
  type: "sources";
  sources: ExperienceSource[];
};

export type ArtifactBlock = {
  type: "artifact";
  id: string;
  name: string;
  kind: "document" | "spreadsheet" | "image" | "pdf" | "chart";
  status: "created" | "processing" | "failed";
  actions?: ExperienceAction[];
};

export type TaskBlock = {
  type: "task";
  title: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  dueAt?: string;
  actions?: ExperienceAction[];
};

export type ApprovalBlock = {
  type: "approval";
  title: string;
  description: string;
  status: "pending" | "approved" | "rejected";
  actions: ExperienceAction[];
};

export type StructuredBlock =
  | CardBlock
  | TableBlock
  | ProgressBlock
  | ResearchBlock
  | ComparisonBlock
  | SourcesBlock
  | ArtifactBlock
  | TaskBlock
  | ApprovalBlock;

export type StructuredResult = {
  blocks: StructuredBlock[];
};

export type ExperienceAgentId =
  | "personal"
  | "research"
  | "trading"
  | "office"
  | "computer";

export type ExperienceMode = "universal" | "adaptive";

export type ExperienceChannel = "desktop" | "mobile" | "voice";

const BLOCK_TYPES = new Set([
  "card",
  "table",
  "progress",
  "research",
  "comparison",
  "sources",
  "artifact",
  "task",
  "approval",
]);

/** Reject agent payloads that try to smuggle HTML/script fields. */
export function assertSafeStructuredResult(value: unknown): StructuredResult {
  if (!value || typeof value !== "object") {
    throw new Error("structured_result_invalid");
  }
  const raw = value as { blocks?: unknown };
  if (!Array.isArray(raw.blocks)) {
    throw new Error("structured_result_blocks_required");
  }
  const blocks: StructuredBlock[] = [];
  for (const b of raw.blocks) {
    if (!b || typeof b !== "object") throw new Error("structured_block_invalid");
    const block = b as Record<string, unknown>;
    if (typeof block.type !== "string" || !BLOCK_TYPES.has(block.type)) {
      throw new Error("structured_block_type_unknown");
    }
    for (const forbidden of [
      "html",
      "css",
      "jsx",
      "javascript",
      "script",
      "dom",
      "componentName",
      "dangerouslySetInnerHTML",
    ]) {
      if (forbidden in block) {
        throw new Error(`structured_block_forbidden_field:${forbidden}`);
      }
    }
    blocks.push(block as StructuredBlock);
  }
  return { blocks };
}

export function isStructuredBlockType(
  type: string,
): type is StructuredBlock["type"] {
  return BLOCK_TYPES.has(type);
}
