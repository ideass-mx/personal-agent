/**
 * Conversation-first adaptive demo — mock state machine (no backend / LLM).
 */

export type FlowPhase =
  | "home"
  | "conversation"
  | "task_offer"
  | "project_proposed"
  | "project_creating"
  | "project_active"
  | "artifact_offer";

/** Surface that dominates the project shell when work is active. */
export type ExperienceKind =
  | "conversation"
  | "research"
  | "manuscript"
  | "task"
  | "artifact"
  | "computer"
  | "analysis";

export type DelegationMode = "do_it" | "together" | "i_control";

export type ProjectNavId =
  | "resumen"
  | "trabajo"
  | "fuentes"
  | "archivos"
  | "tareas"
  | "resultados";

export type ChatRole = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  /** Structured UI card embedded in the thread (not HTML from the agent). */
  card?: MessageCard;
};

export type MessageCard =
  | {
      kind: "project_propose";
      title: string;
      body: string;
      createLabel?: string;
      continueLabel?: string;
    }
  | {
      kind: "project_auto";
      title: string;
      body: string;
      plan?: string[];
    }
  | {
      kind: "task_offer";
      title: string;
      dueLabel: string;
    }
  | {
      kind: "artifact";
      name: string;
      kindLabel: string;
    }
  | {
      kind: "delegation";
      prompt: string;
    }
  | {
      kind: "checkpoint";
      title: string;
      optionA: string;
      optionB: string;
    }
  | {
      kind: "article_type";
      prompt: string;
    };

export type IntentKind =
  | "simple_ask"
  | "task"
  | "complex_work"
  | "explicit_work"
  | "computer_task"
  | "artifact"
  | "research_in_project"
  | "write_in_project"
  | "control_manual"
  | "control_agent"
  | "find_evidence"
  | "generic";

export type DetectedIntent = {
  kind: IntentKind;
  projectTitle?: string;
  reply?: string;
};

export type ResearchPhase = "idle" | "working" | "completed" | "stopped";

export type ArticleAutomationPhase =
  | "idle"
  | "working"
  | "checkpoint"
  | "completed";

export type ProjectState = {
  title: string;
  nav: ProjectNavId;
  experience: ExperienceKind;
  emerged: {
    research: boolean;
    manuscript: boolean;
    tasks: boolean;
    artifacts: boolean;
    sources: boolean;
  };
  researchPhase: ResearchPhase;
  researchStep: number;
  manuscriptClaimSelected: boolean;
  evidenceOpen: boolean;
  manualSection: string | null;
  articlePhase: ArticleAutomationPhase;
  articleStep: number;
  articleType: string | null;
  awaitingDelegation: boolean;
};

export type DemoScenarioId =
  | "simple"
  | "task"
  | "doctorado"
  | "article"
  | "files"
  | "evidence";

export type LabDimensions = {
  startingPoint: "conversation" | "existing_project";
  intent: "ask" | "research" | "write" | "analyze" | "execute" | "create" | "organize";
  complexity: "simple" | "multi_step" | "long_running";
  delegation: DelegationMode;
  channel: "desktop" | "mobile" | "voice";
};
