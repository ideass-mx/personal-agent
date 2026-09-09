/**
 * Re-export del contrato Structured UI (gateway Experience Layer).
 * Web solo consume tipos semánticos; no HTML del agente.
 */
export type {
  ApprovalBlock,
  ArtifactBlock,
  CardBlock,
  ComparisonBlock,
  ExperienceAction,
  ExperienceAgentId,
  ExperienceChannel,
  ExperienceMode,
  ExperienceSource,
  ProgressBlock,
  ResearchBlock,
  SourcesBlock,
  StructuredBlock,
  StructuredResult,
  TableBlock,
  TaskBlock,
} from "@pa/experience";

export {
  assertSafeStructuredResult,
  FIXTURE_APPROVAL,
  FIXTURE_BY_ID,
  FIXTURE_RESEARCH_ARTIFACT,
  FIXTURE_RESEARCH_COMPARISON,
  FIXTURE_RESEARCH_COMPLETED,
  FIXTURE_RESEARCH_FAILED,
  FIXTURE_RESEARCH_IDLE,
  FIXTURE_RESEARCH_WORKING,
  FIXTURE_TASK,
  RESEARCH_SOURCES,
} from "@pa/experience";
