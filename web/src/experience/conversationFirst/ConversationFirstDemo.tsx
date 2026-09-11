/**
 * Conversation-first adaptive demo — UI mock (no LLM / network).
 */
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { ExperienceChannel } from "../contract";
import { detectIntent } from "./detectIntent";
import {
  ARTICLE_AUTO_STEPS,
  ARTICLE_PLAN,
  CLAIM_TEXT,
  MANUSCRIPT_SECTIONS,
  MOCK_AGENT_RESOURCES,
  MOCK_EVIDENCE,
  MOCK_UNIVERSITIES,
  MOCK_USER_RESOURCES,
  RESEARCH_STEPS_DOCTORADO,
} from "./mockContent";
import {
  DEMO_SCENARIOS,
  ARTICLE_UNDERSTANDING,
  ARTICLE_WORK_PLAN,
  type DemoScenario,
} from "./scenarios";
import type {
  ChatMessage,
  DelegationMode,
  DemoScenarioId,
  ExperienceKind,
  FlowPhase,
  LabDimensions,
  MessageCard,
  ProjectNavId,
  ProjectState,
} from "./types";

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function emptyProject(
  title: string,
  opts?: {
    projectType?: ProjectState["projectType"];
    understanding?: string;
  },
): ProjectState {
  return {
    title,
    projectType: opts?.projectType || "generic",
    understanding: opts?.understanding,
    nav: "resumen",
    experience: "conversation",
    emerged: {
      research: false,
      manuscript: false,
      tasks: false,
      artifacts: false,
      sources: false,
    },
    researchPhase: "idle",
    researchStep: 0,
    manuscriptClaimSelected: false,
    evidenceOpen: false,
    manualSection: null,
    articlePhase: "idle",
    articleStep: 0,
    articleType: null,
    awaitingDelegation: opts?.projectType === "scientific_article",
  };
}

const SUGGESTIONS = [
  "Investigar algo",
  "Escribir un documento",
  "Analizar un archivo",
  "Organizar una tarea",
];

const CREATE_CHIPS = [
  { id: "scientific_article", label: "Artículo científico" },
  { id: "document", label: "Documento" },
  { id: "research", label: "Investigación" },
] as const;

type Props = {
  channel?: ExperienceChannel;
  dimensions?: LabDimensions;
  onDimensions?: (d: LabDimensions) => void;
};

/**
 * Home → conversación → (tarea | proyecto) → experiencias adaptativas.
 */
export function ConversationFirstDemo({
  channel = "desktop",
  dimensions,
  onDimensions,
}: Props) {
  const [phase, setPhase] = useState<FlowPhase>("home");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [project, setProject] = useState<ProjectState | null>(null);
  const [delegation, setDelegation] = useState<DelegationMode>("together");
  const [pendingTitle, setPendingTitle] = useState("Proyecto");
  const [sheet, setSheet] = useState<"ai" | "sources" | "project" | null>(null);
  const [awaitingArticleTopic, setAwaitingArticleTopic] = useState(false);
  const [aiOpen, setAiOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const formId = useId();

  const dims: LabDimensions = dimensions || {
    startingPoint: "conversation",
    intent: "ask",
    complexity: "simple",
    delegation,
    channel,
  };

  function priorUserTexts(): string[] {
    return messages.filter((m) => m.role === "user").map((m) => m.text);
  }

  function push(msgs: Omit<ChatMessage, "id">[]) {
    setMessages((m) => [
      ...m,
      ...msgs.map((x) => ({ ...x, id: uid(x.role) })),
    ]);
  }

  function setDims(partial: Partial<LabDimensions>) {
    onDimensions?.({ ...dims, ...partial });
  }

  function resetHome() {
    setPhase("home");
    setMessages([]);
    setProject(null);
    setDraft("");
    setPendingTitle("Proyecto");
    setSheet(null);
    setVoiceLine(null);
    setDelegation("together");
    setAwaitingArticleTopic(false);
    setAiOpen(true);
  }

  function enterConversation(
    seed?: { role: "user" | "assistant"; text: string }[],
  ) {
    setPhase("conversation");
    if (seed?.length) {
      setMessages(
        seed.map((s) => ({
          id: uid(s.role),
          role: s.role,
          text: s.text,
        })),
      );
    }
  }

  function createArticleProject(title: string) {
    setPhase("project_creating");
    setVoiceLine(
      channel === "voice"
        ? "Voy a organizar el artículo científico como proyecto."
        : null,
    );
    window.setTimeout(() => {
      setProject({
        ...emptyProject(title, {
          projectType: "scientific_article",
          understanding: ARTICLE_UNDERSTANDING,
        }),
        awaitingDelegation: true,
        nav: "resumen",
        emerged: {
          research: true,
          manuscript: true,
          tasks: false,
          artifacts: false,
          sources: true,
        },
      });
      setPhase("project_active");
      setAiOpen(true);
      push([
        {
          role: "assistant",
          text: `Artículo científico\n${title}\n\nEsta conversación forma parte del proyecto.`,
        },
      ]);
    }, 700);
  }

  function createProject(
    title: string,
    nextExperience: ExperienceKind = "conversation",
  ) {
    setPhase("project_creating");
    setVoiceLine(
      channel === "voice"
        ? "Voy a organizar la investigación como proyecto."
        : null,
    );
    window.setTimeout(() => {
      setProject({
        ...emptyProject(title),
        experience: nextExperience,
        nav: "trabajo",
        emerged: {
          ...emptyProject(title).emerged,
          research: nextExperience === "research",
          manuscript: nextExperience === "manuscript",
        },
      });
      setPhase("project_active");
      push([
        {
          role: "assistant",
          text: `${title}\nTrabajemos aquí.\nEsta conversación ya forma parte del proyecto.`,
        },
      ]);
    }, 900);
  }

  function startDirectArticleFlow() {
    setAwaitingArticleTopic(true);
    enterConversation();
    setMessages([
      {
        id: uid("assistant"),
        role: "assistant",
        text: "Vamos a crear tu artículo científico.\n¿Qué quieres investigar?",
      },
    ]);
    setDims({
      startingPoint: "direct_article",
      intent: "scientific_article",
      complexity: "long_running",
    });
  }

  function startResearch() {
    setProject((p) =>
      p
        ? {
            ...p,
            experience: "research",
            emerged: { ...p.emerged, research: true, sources: true },
            researchPhase: "working",
            researchStep: 0,
            nav: "trabajo",
          }
        : p,
    );
  }

  function openManuscript() {
    setProject((p) =>
      p
        ? {
            ...p,
            experience: "manuscript",
            emerged: { ...p.emerged, manuscript: true, sources: true },
            nav: "trabajo",
          }
        : p,
    );
  }

  function handleUserText(
    raw: string,
    opts?: {
      inProject?: boolean;
      ensureConversation?: boolean;
      priorUserTexts?: string[];
    },
  ) {
    const text = raw.trim();
    if (!text) return;
    setDraft("");
    const ensureConversation = opts?.ensureConversation ?? phase === "home";
    if (ensureConversation && phase === "home") enterConversation();

    const inProject =
      opts?.inProject ?? (phase === "project_active" && !!project);
    const prior = opts?.priorUserTexts ?? priorUserTexts();
    push([{ role: "user", text }]);

    if (awaitingArticleTopic && !inProject) {
      setAwaitingArticleTopic(false);
      const title = text;
      setPendingTitle(title);
      push([
        {
          role: "assistant",
          text: `Perfecto.\nPuedo ayudarte a:\n• investigar literatura científica\n• encontrar fuentes\n• comparar enfoques\n• identificar tendencias\n• construir la estructura\n• redactar el manuscrito`,
          card: {
            kind: "project_auto",
            title: "Artículo científico",
            body: `Entendí que quieres:\n${ARTICLE_UNDERSTANDING}`,
            plan: ARTICLE_WORK_PLAN,
          },
        },
      ]);
      setPhase("project_proposed");
      setDims({
        startingPoint: "direct_article",
        intent: "scientific_article",
        complexity: "long_running",
      });
      return;
    }

    const intent = detectIntent(text, {
      inProject,
      priorUserTexts: prior,
    });

    if (channel === "voice" && intent.kind === "scientific_article_propose") {
      setVoiceLine(
        "Esto ya parece un artículo científico. ¿Quieres que lo organice como proyecto?",
      );
    }

    if (inProject) {
      handleInProjectIntent(intent.kind, intent.reply);
      return;
    }

    switch (intent.kind) {
      case "simple_ask":
      case "conversation_continue":
      case "research_only":
        setPhase("conversation");
        push([{ role: "assistant", text: intent.reply || "" }]);
        setDims({
          intent: intent.kind === "research_only" ? "research" : "ask",
          complexity:
            intent.kind === "research_only" ? "multi_step" : "simple",
        });
        break;
      case "task":
        setPhase("task_offer");
        push([
          {
            role: "assistant",
            text: intent.reply || "Detecté una tarea.",
            card: {
              kind: "task_offer",
              title: "Revisar la propuesta",
              dueLabel: "Mañana · 9:00 AM",
            },
          },
        ]);
        setDims({ intent: "organize", complexity: "simple" });
        break;
      case "artifact":
        setPhase("artifact_offer");
        push([
          {
            role: "assistant",
            text: intent.reply || "Artefacto listo.",
            card: {
              kind: "artifact",
              name: "report.pdf",
              kindLabel: "PDF",
            },
          },
        ]);
        setDims({ intent: "create", complexity: "simple" });
        break;
      case "scientific_article_propose": {
        const title = intent.projectTitle || "Artículo científico";
        setPendingTitle(title);
        setPhase("project_proposed");
        push([
          {
            role: "assistant",
            text: intent.reply || "",
            card: {
              kind: "project_propose",
              title: "Proyecto de artículo científico",
              body: "La investigación, las fuentes y el manuscrito permanecerán juntos.",
              createLabel: "Crear proyecto",
              continueLabel: "Seguir conversando",
            },
          },
        ]);
        setDims({
          intent: "scientific_article",
          complexity: "long_running",
        });
        break;
      }
      case "scientific_article_direct": {
        const title = intent.projectTitle || "Artículo científico";
        setPendingTitle(title);
        setPhase("project_proposed");
        push([
          {
            role: "assistant",
            text: intent.reply || "",
            card: {
              kind: "project_auto",
              title: "Artículo científico",
              body: `Entendí que quieres:\n${ARTICLE_UNDERSTANDING}`,
              plan: ARTICLE_WORK_PLAN,
            },
          },
        ]);
        setDims({
          startingPoint: "direct_article",
          intent: "scientific_article",
          complexity: "long_running",
        });
        break;
      }
      case "complex_work": {
        const title = intent.projectTitle || "Proyecto";
        setPendingTitle(title);
        setPhase("project_proposed");
        push([
          {
            role: "assistant",
            text: intent.reply || "",
            card: {
              kind: "project_propose",
              title: "Organizar como proyecto",
              body: intent.reply || "",
            },
          },
        ]);
        setDims({ intent: "research", complexity: "multi_step" });
        break;
      }
      case "explicit_work":
      case "computer_task": {
        const title = intent.projectTitle || "Proyecto";
        setPendingTitle(title);
        setPhase("project_proposed");
        push([
          {
            role: "assistant",
            text: intent.reply || "",
            card: {
              kind: "project_auto",
              title: "Organizar este trabajo",
              body: intent.reply || "",
              plan: intent.kind === "explicit_work" ? ARTICLE_PLAN : undefined,
            },
          },
        ]);
        setDims({
          intent: intent.kind === "computer_task" ? "organize" : "write",
          complexity: "long_running",
        });
        break;
      }
      default:
        setPhase("conversation");
        push([
          {
            role: "assistant",
            text: intent.reply || "¿En qué te ayudo?",
          },
        ]);
    }
  }

  function handleInProjectIntent(
    kind: ReturnType<typeof detectIntent>["kind"],
    reply?: string,
  ) {
    if (kind === "research_in_project") {
      push([{ role: "assistant", text: reply || "Investigando…" }]);
      startResearch();
      return;
    }
    if (kind === "write_in_project") {
      push([{ role: "assistant", text: reply || "" }]);
      openManuscript();
      return;
    }
    if (kind === "find_evidence") {
      push([{ role: "assistant", text: reply || "" }]);
      setProject((p) =>
        p
          ? {
              ...p,
              experience: "research",
              emerged: { ...p.emerged, research: true, sources: true },
              evidenceOpen: true,
              manuscriptClaimSelected: true,
            }
          : p,
      );
      return;
    }
    if (kind === "control_manual") {
      push([{ role: "assistant", text: reply || "" }]);
      setProject((p) =>
        p ? { ...p, manualSection: "Metodología", experience: "manuscript" } : p,
      );
      setDelegation("i_control");
      return;
    }
    if (kind === "control_agent") {
      push([{ role: "assistant", text: reply || "" }]);
      setProject((p) => (p ? { ...p, manualSection: null } : p));
      setDelegation("do_it");
      return;
    }
    push([{ role: "assistant", text: reply || "Seguimos desde aquí." }]);
  }

  function loadScenario(id: DemoScenarioId) {
    const sc = DEMO_SCENARIOS.find((s) => s.id === id);
    if (!sc) return;
    setDraft("");
    setSheet(null);
    setVoiceLine(null);
    setProject(null);
    setPendingTitle("Proyecto");
    onDimensions?.(sc.dimensions);
    setDelegation(sc.dimensions.delegation);

    if (id === "evidence") {
      setPhase("project_active");
      setProject({
        ...emptyProject("Optimización en trading", {
          projectType: "scientific_article",
          understanding: ARTICLE_UNDERSTANDING,
        }),
        experience: "manuscript",
        nav: "resultados",
        awaitingDelegation: false,
        emerged: {
          research: true,
          manuscript: true,
          tasks: false,
          artifacts: false,
          sources: true,
        },
        manuscriptClaimSelected: true,
      });
      setMessages([
        {
          id: uid("assistant"),
          role: "assistant",
          text: "Estás en el manuscrito. Selecciona la afirmación para buscar evidencia.",
        },
      ]);
      return;
    }

    const seed = sc.seedThread || [];
    setPhase("conversation");
    setMessages(
      seed.map((s) => ({
        id: uid(s.role),
        role: s.role,
        text: s.text,
      })),
    );
    if (sc.seedUser) {
      const priorFromSeed = seed
        .filter((s) => s.role === "user")
        .map((s) => s.text);
      window.setTimeout(() => {
        handleUserText(sc.seedUser!, {
          inProject: false,
          ensureConversation: false,
          priorUserTexts: priorFromSeed,
        });
      }, 30);
    }
  }

  // Research progress animation
  useEffect(() => {
    if (!project || project.researchPhase !== "working") return;
    if (project.researchStep >= RESEARCH_STEPS_DOCTORADO.length - 1) {
      const t = window.setTimeout(() => {
        setProject((p) =>
          p
            ? {
                ...p,
                researchPhase: "completed",
                researchStep: RESEARCH_STEPS_DOCTORADO.length,
              }
            : p,
        );
        push([
          {
            role: "assistant",
            text: "Investigación completada. 14 universidades encontradas.",
          },
        ]);
      }, 700);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      setProject((p) =>
        p ? { ...p, researchStep: p.researchStep + 1 } : p,
      );
    }, 650);
    return () => window.clearTimeout(t);
  }, [project?.researchPhase, project?.researchStep]);

  // Article automation
  useEffect(() => {
    if (!project || project.articlePhase !== "working") return;
    if (project.articleStep === 3 && delegation !== "do_it") {
      // checkpoint for together / i_control mid-way optional — skip for do_it
    }
    if (project.articleStep === 2 && delegation === "together") {
      const t = window.setTimeout(() => {
        setProject((p) => (p ? { ...p, articlePhase: "checkpoint" } : p));
        push([
          {
            role: "assistant",
            text: "Encontré dos formas razonables de estructurar el artículo.",
            card: {
              kind: "checkpoint",
              title: "¿Cómo estructuramos el artículo?",
              optionA: "Enfoque metodológico",
              optionB: "Enfoque histórico + comparativo",
            },
          },
        ]);
      }, 500);
      return () => window.clearTimeout(t);
    }
    if (project.articleStep >= ARTICLE_AUTO_STEPS.length - 1) {
      const t = window.setTimeout(() => {
        setProject((p) =>
          p
            ? {
                ...p,
                articlePhase: "completed",
                articleStep: ARTICLE_AUTO_STEPS.length,
                experience: "manuscript",
                emerged: {
                  ...p.emerged,
                  manuscript: true,
                  research: true,
                  sources: true,
                  artifacts: true,
                },
              }
            : p,
        );
        push([
          {
            role: "assistant",
            text: "Artículo preparado (datos de demostración).",
          },
        ]);
      }, 700);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      setProject((p) =>
        p ? { ...p, articleStep: p.articleStep + 1 } : p,
      );
    }, 600);
    return () => window.clearTimeout(t);
  }, [project?.articlePhase, project?.articleStep, delegation]);

  const isMobile = channel === "mobile";
  const isVoice = channel === "voice";

  return (
    <div className={`cf-root channel-${channel}`}>
      <ScenarioBar onLoad={loadScenario} />

      {phase === "home" ? (
        <HomeHero
          formId={formId}
          draft={draft}
          setDraft={setDraft}
          onSubmit={() => handleUserText(draft)}
          onSuggestion={(s) => {
            setDraft(
              s === "Investigar algo"
                ? "Quiero investigar mis opciones de doctorado y comparar universidades."
                : s,
            );
            inputRef.current?.focus();
          }}
          onCreateChip={(id) => {
            if (id === "scientific_article") {
              startDirectArticleFlow();
              return;
            }
            if (id === "research") {
              setDraft(
                "Quiero investigar los principales algoritmos utilizados en trading cuantitativo.",
              );
              inputRef.current?.focus();
              return;
            }
            setDraft("Quiero escribir un documento.");
            inputRef.current?.focus();
          }}
          inputRef={inputRef}
          isVoice={isVoice}
        />
      ) : null}

      {phase === "project_creating" ? (
        <div className="cf-creating" role="status">
          <p className="exp-kicker">Proyecto</p>
          <h2>Creando proyecto…</h2>
        </div>
      ) : null}

      {phase !== "home" && phase !== "project_creating" ? (
        <div
          className={`cf-layout ${project ? "has-project" : ""} ${isMobile ? "is-mobile" : ""}`}
        >
          {project && !isMobile ? (
            <ProjectNav
              project={project}
              onNav={(nav) => setProject((p) => (p ? { ...p, nav } : p))}
              onExperience={(experience) =>
                setProject((p) => (p ? { ...p, experience } : p))
              }
            />
          ) : null}

          <div className="cf-main">
            {project &&
            (project.nav === "trabajo" ||
              (project.projectType === "scientific_article" &&
                project.nav === "resultados")) ? (
              <ExperienceSurface
                project={
                  project.nav === "resultados"
                    ? { ...project, experience: "manuscript", nav: "trabajo" }
                    : project.projectType === "scientific_article" &&
                        project.nav === "trabajo"
                      ? { ...project, experience: "research" }
                      : project
                }
                channel={channel}
                delegation={delegation}
                onDelegation={setDelegation}
                setProject={setProject}
                push={push}
                startResearch={startResearch}
                openManuscript={openManuscript}
              />
            ) : null}
            {project && project.nav === "resumen" ? (
              <ProjectResumen
                project={project}
                messageCount={messages.length}
                delegation={delegation}
                onDelegation={(d) => {
                  setDelegation(d);
                  setProject((p) =>
                    p ? { ...p, awaitingDelegation: false } : p,
                  );
                }}
                onBegin={() => {
                  setProject((p) =>
                    p
                      ? {
                          ...p,
                          awaitingDelegation: false,
                          nav: "trabajo",
                          experience: "research",
                          researchPhase: "working",
                          researchStep: 0,
                          articlePhase:
                            p.projectType === "scientific_article"
                              ? "working"
                              : p.articlePhase,
                        }
                      : p,
                  );
                }}
                onOpenManuscript={openManuscript}
                onOpenResearch={startResearch}
              />
            ) : null}
            {project && project.nav === "fuentes" ? <ResourcesPanel /> : null}
            {project && project.nav === "archivos" ? (
              <ResourcesPanel filesOnly />
            ) : null}
            {project && project.nav === "tareas" ? (
              <TasksPanel emerged={project.emerged.tasks} />
            ) : null}
            {project &&
            project.nav === "resultados" &&
            project.projectType !== "scientific_article" ? (
              <ResultsPanel project={project} />
            ) : null}

            {(!project || isMobile) ? (
            <ConversationPane
              messages={messages}
              draft={draft}
              setDraft={setDraft}
              onSubmit={() => handleUserText(draft)}
              compact={!!project}
              isMobile={isMobile}
              isVoice={isVoice}
              voiceLine={voiceLine}
              onCardAction={(msg, action) =>
                handleCardAction(msg, action, {
                  pendingTitle,
                  createProject,
                  createArticleProject,
                  setPhase,
                  push,
                  setProject,
                  setDelegation,
                  startResearch,
                  openManuscript,
                })
              }
            />
            ) : null}
          </div>

          {project && !isMobile ? (
            <aside
              className={`cf-ai-panel ${aiOpen ? "is-open" : "is-collapsed"}`}
              aria-label="AI"
            >
              <div className="cf-ai-panel-head">
                <strong>AI</strong>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setAiOpen((v) => !v)}
                >
                  {aiOpen ? "Cerrar" : "Abrir"}
                </button>
              </div>
              {aiOpen ? (
                <div className="cf-ai-panel-body">
                  <p className="muted">
                    La conversación del proyecto sigue aquí. Pregunta o pide
                    cambios sin salir del trabajo.
                  </p>
                  <ConversationPane
                    messages={messages}
                    draft={draft}
                    setDraft={setDraft}
                    onSubmit={() => handleUserText(draft)}
                    compact
                    isMobile={false}
                    isVoice={isVoice}
                    voiceLine={voiceLine}
                    onCardAction={(msg, action) =>
                      handleCardAction(msg, action, {
                        pendingTitle,
                        createProject,
                        createArticleProject,
                        setPhase,
                        push,
                        setProject,
                        setDelegation,
                        startResearch,
                        openManuscript,
                      })
                    }
                  />
                </div>
              ) : null}
            </aside>
          ) : null}

          {isMobile && project ? (
            <div className="cf-mobile-bar">
              <button type="button" className="btn" onClick={() => setSheet("ai")}>
                AI
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setSheet("sources")}
              >
                Fuentes
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setSheet("project")}
              >
                Proyecto
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {sheet && isMobile ? (
        <MobileSheet
          kind={sheet}
          project={project}
          onClose={() => setSheet(null)}
          onNav={(nav) => {
            setProject((p) => (p ? { ...p, nav } : p));
            setSheet(null);
          }}
        />
      ) : null}

      <div className="cf-footer-actions">
        <button type="button" className="btn" onClick={resetHome}>
          Reiniciar demo
        </button>
      </div>
    </div>
  );
}

function HomeHero({
  formId,
  draft,
  setDraft,
  onSubmit,
  onSuggestion,
  onCreateChip,
  inputRef,
  isVoice,
}: {
  formId: string;
  draft: string;
  setDraft: (s: string) => void;
  onSubmit: () => void;
  onSuggestion: (s: string) => void;
  onCreateChip: (id: (typeof CREATE_CHIPS)[number]["id"]) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  isVoice: boolean;
}) {
  return (
    <section className="cf-home">
      <p className="exp-kicker">Personal Agent</p>
      <h2 className="cf-home-title">¿Qué quieres hacer?</h2>
      {isVoice ? (
        <p className="cf-voice-hint" role="status">
          Voice · Listening…
        </p>
      ) : null}
      <form
        id={formId}
        className="cf-composer"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escribe algo…"
          aria-label="Escribe algo"
          autoComplete="off"
        />
        <button type="submit" className="btn primary" disabled={!draft.trim()}>
          Enviar
        </button>
        <span className="cf-mic" aria-hidden="true" title="Voz (mock)">
          🎙
        </span>
      </form>
      <div className="cf-create-row">
        <span className="muted">Crear</span>
        {CREATE_CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            className="cf-create-chip"
            onClick={() => onCreateChip(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <ul className="cf-suggestions">
        {SUGGESTIONS.map((s) => (
          <li key={s}>
            <button type="button" onClick={() => onSuggestion(s)}>
              {s}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScenarioBar({ onLoad }: { onLoad: (id: DemoScenarioId) => void }) {
  return (
    <div className="cf-scenarios" aria-label="Escenarios de demostración">
      <span className="muted">Escenarios</span>
      {DEMO_SCENARIOS.map((s: DemoScenario) => (
        <button
          key={s.id}
          type="button"
          className="btn"
          title={s.description}
          onClick={() => onLoad(s.id)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function ConversationPane({
  messages,
  draft,
  setDraft,
  onSubmit,
  compact,
  isMobile,
  isVoice,
  voiceLine,
  onCardAction,
}: {
  messages: ChatMessage[];
  draft: string;
  setDraft: (s: string) => void;
  onSubmit: () => void;
  compact: boolean;
  isMobile: boolean;
  isVoice: boolean;
  voiceLine: string | null;
  onCardAction: (msg: ChatMessage, action: string) => void;
}) {
  return (
    <section
      className={`cf-chat ${compact ? "is-side" : ""} ${isMobile ? "is-mobile" : ""}`}
      aria-label="Conversación"
    >
      {!compact ? null : <h3>Conversación</h3>}
      {isVoice && voiceLine ? (
        <div className="cf-voice-bubble" role="status">
          <p className="exp-kicker">Voice</p>
          <p>“{voiceLine}”</p>
          <p className="muted">Listening…</p>
        </div>
      ) : null}
      <div className="exp-msgs">
        {messages.map((m) => (
          <div key={m.id} className={`exp-msg role-${m.role}`}>
            <strong>
              {m.role === "user"
                ? "Tú"
                : m.role === "system"
                  ? "Sistema"
                  : "Agente"}
            </strong>
            <p style={{ whiteSpace: "pre-wrap" }}>{m.text}</p>
            {m.card ? (
              <MessageCardView
                card={m.card}
                onAction={(a) => onCardAction(m, a)}
              />
            ) : null}
          </div>
        ))}
      </div>
      <form
        className="cf-composer"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escribe algo…"
          aria-label="Mensaje"
        />
        <button type="submit" className="btn primary" disabled={!draft.trim()}>
          Enviar
        </button>
      </form>
    </section>
  );
}

function MessageCardView({
  card,
  onAction,
}: {
  card: MessageCard;
  onAction: (action: string) => void;
}) {
  if (card.kind === "project_propose") {
    return (
      <div className="cf-card">
        <p>{card.body}</p>
        <div className="exp-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => onAction("create_project")}
          >
            {card.createLabel || "Crear proyecto"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onAction("keep_chat")}
          >
            {card.continueLabel || "Seguir conversando"}
          </button>
        </div>
      </div>
    );
  }
  if (card.kind === "project_auto") {
    return (
      <div className="cf-card">
        <p>{card.body}</p>
        {card.plan ? (
          <>
            <p className="muted">Propongo trabajar en:</p>
            <ol className="cf-plan">
              {card.plan.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </>
        ) : null}
        <div className="exp-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => onAction("start_auto")}
          >
            Comenzar
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onAction("review_plan")}
          >
            Revisar plan
          </button>
        </div>
      </div>
    );
  }
  if (card.kind === "task_offer") {
    return (
      <div className="cf-card">
        <p className="exp-kicker">Detecté una tarea</p>
        <strong>{card.title}</strong>
        <p className="muted">{card.dueLabel}</p>
        <div className="exp-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => onAction("create_task")}
          >
            Crear tarea
          </button>
          <button type="button" className="btn" onClick={() => onAction("dismiss")}>
            No ahora
          </button>
        </div>
      </div>
    );
  }
  if (card.kind === "artifact") {
    return (
      <div className="cf-card">
        <p className="exp-kicker">Artifact created</p>
        <strong>
          📄 {card.name}
        </strong>
        <p className="muted">{card.kindLabel} · demo</p>
        <div className="exp-actions">
          <button type="button" className="btn primary" onClick={() => onAction("open")}>
            Open
          </button>
          <button type="button" className="btn" onClick={() => onAction("download")}>
            Download
          </button>
          <button type="button" className="btn" onClick={() => onAction("edit")}>
            Continue editing
          </button>
        </div>
      </div>
    );
  }
  if (card.kind === "delegation") {
    return (
      <div className="cf-card">
        <p>{card.prompt}</p>
        <div className="cf-delegation">
          <button type="button" className="btn" onClick={() => onAction("do_it")}>
            ⚡ Hazlo por mí
            <span className="muted">Yo me encargo de revisar el resultado.</span>
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onAction("together")}
          >
            🤝 Trabajemos juntos
            <span className="muted">
              Consúltame cuando una decisión sea importante.
            </span>
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onAction("i_control")}
          >
            ✍️ Yo controlo el proceso
            <span className="muted">Quiero decidir qué hacemos en cada paso.</span>
          </button>
        </div>
      </div>
    );
  }
  if (card.kind === "checkpoint") {
    return (
      <div className="cf-card">
        <p className="exp-kicker">Decisión importante</p>
        <strong>{card.title}</strong>
        <div className="exp-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => onAction("opt_a")}
          >
            A · {card.optionA}
          </button>
          <button type="button" className="btn" onClick={() => onAction("opt_b")}>
            B · {card.optionB}
          </button>
        </div>
      </div>
    );
  }
  if (card.kind === "article_type") {
    return (
      <div className="cf-card">
        <p>{card.prompt}</p>
        <div className="exp-actions">
          <button type="button" className="btn" onClick={() => onAction("lit")}>
            Revisión de literatura
          </button>
          <button type="button" className="btn" onClick={() => onAction("concept")}>
            Artículo conceptual
          </button>
          <button type="button" className="btn" onClick={() => onAction("compare")}>
            Comparación metodológica
          </button>
          <button type="button" className="btn" onClick={() => onAction("later")}>
            Decidir después
          </button>
        </div>
      </div>
    );
  }
  return null;
}

type CardCtx = {
  pendingTitle: string;
  createProject: (title: string, exp?: ExperienceKind) => void;
  createArticleProject: (title: string) => void;
  setPhase: (p: FlowPhase) => void;
  push: (msgs: Omit<ChatMessage, "id">[]) => void;
  setProject: Dispatch<SetStateAction<ProjectState | null>>;
  setDelegation: (d: DelegationMode) => void;
  startResearch: () => void;
  openManuscript: () => void;
};

function handleCardAction(msg: ChatMessage, action: string, ctx: CardCtx) {
  const card = msg.card;
  if (!card) return;

  if (action === "create_project") {
    if (card.kind === "project_propose" && card.title.includes("artículo")) {
      ctx.createArticleProject(ctx.pendingTitle);
      return;
    }
    ctx.createProject(ctx.pendingTitle, "conversation");
    return;
  }
  if (action === "keep_chat") {
    ctx.setPhase("conversation");
    ctx.push([
      {
        role: "assistant",
        text: "Perfecto, seguimos conversando. Cuando quieras organizar esto como proyecto, dímelo.",
      },
    ]);
    return;
  }
  if (action === "start_auto") {
    const isArticle = Boolean(card.kind === "project_auto" && card.plan?.length);
    if (isArticle) {
      ctx.createArticleProject(ctx.pendingTitle);
      return;
    }
    ctx.createProject(ctx.pendingTitle, "computer");
    window.setTimeout(() => {
      ctx.setProject((p) =>
        p
          ? {
              ...p,
              experience: "computer",
              emerged: { ...p.emerged, tasks: true },
            }
          : p,
      );
    }, 1000);
    return;
  }
  if (action === "review_plan") {
    ctx.push([
      {
        role: "assistant",
        text: "Puedes ajustar el plan cuando quieras. Por ahora el alcance propuesto está listo — pulsa Comenzar cuando quieras seguir.",
      },
    ]);
    return;
  }
  if (action === "create_task") {
    ctx.setPhase("conversation");
    ctx.push([{ role: "assistant", text: "✓ Tarea creada" }]);
    return;
  }
  if (action === "dismiss") {
    ctx.setPhase("conversation");
    ctx.push([
      {
        role: "assistant",
        text: "De acuerdo, no creo la tarea. Seguimos conversando.",
      },
    ]);
    return;
  }
  if (action === "open" || action === "download" || action === "edit") {
    ctx.push([
      {
        role: "assistant",
        text: "Acción mock sobre el artefacto (sin archivo real en esta demo).",
      },
    ]);
    return;
  }
  if (action === "do_it" || action === "together" || action === "i_control") {
    const d: DelegationMode =
      action === "do_it"
        ? "do_it"
        : action === "together"
          ? "together"
          : "i_control";
    ctx.setDelegation(d);
    if (d !== "do_it") {
      ctx.push([
        {
          role: "assistant",
          text: "Antes de comenzar, hay una decisión importante: ¿qué tipo de artículo quieres?",
          card: {
            kind: "article_type",
            prompt: "¿Qué tipo de artículo quieres?",
          },
        },
      ]);
      return;
    }
    ctx.push([
      {
        role: "assistant",
        text: "Preparando investigación…",
      },
    ]);
    ctx.setProject((p) =>
      p
        ? {
            ...p,
            experience: "research",
            articlePhase: "working",
            articleStep: 0,
            emerged: { ...p.emerged, research: true, sources: true },
          }
        : p,
    );
    return;
  }
  if (
    action === "lit" ||
    action === "concept" ||
    action === "compare" ||
    action === "later"
  ) {
    const label =
      action === "lit"
        ? "Revisión de literatura"
        : action === "concept"
          ? "Artículo conceptual"
          : action === "compare"
            ? "Comparación metodológica"
            : "Decidir después";
    ctx.setProject((p) =>
      p
        ? {
            ...p,
            articleType: label,
            experience: "research",
            articlePhase: "working",
            articleStep: 0,
            emerged: { ...p.emerged, research: true },
          }
        : p,
    );
    ctx.push([
      {
        role: "assistant",
        text: `Perfecto — ${label}. Primero voy a definir el alcance y buscar literatura relevante.`,
      },
    ]);
    return;
  }
  if (action === "opt_a" || action === "opt_b") {
    ctx.push([
      {
        role: "assistant",
        text:
          action === "opt_a"
            ? "Usaremos un enfoque metodológico. Continúo automáticamente."
            : "Usaremos un enfoque histórico + comparativo. Continúo automáticamente.",
      },
    ]);
    ctx.setProject((p) =>
      p ? { ...p, articlePhase: "working", articleStep: p.articleStep + 1 } : p,
    );
  }
}

function ProjectNav({
  project,
  onNav,
  onExperience,
}: {
  project: ProjectState;
  onNav: (n: ProjectNavId) => void;
  onExperience: (e: ExperienceKind) => void;
}) {
  const isArticle = project.projectType === "scientific_article";
  const items: { id: ProjectNavId; label: string; show: boolean }[] = isArticle
    ? [
        { id: "resumen", label: "Resumen", show: true },
        { id: "trabajo", label: "Investigación", show: true },
        { id: "resultados", label: "Manuscrito", show: true },
        { id: "fuentes", label: "Fuentes", show: true },
      ]
    : [
        { id: "resumen", label: "Resumen", show: true },
        { id: "trabajo", label: "Trabajo", show: true },
        { id: "fuentes", label: "Fuentes", show: project.emerged.sources },
        { id: "archivos", label: "Archivos", show: project.emerged.artifacts },
        { id: "tareas", label: "Tareas", show: project.emerged.tasks },
        { id: "resultados", label: "Resultados", show: true },
      ];
  return (
    <aside className="cf-project-nav" aria-label="Proyecto">
      <p className="exp-kicker">
        {isArticle ? "Artículo científico" : "Proyecto"}
      </p>
      <h3>{project.title}</h3>
      <nav>
        {items
          .filter((i) => i.show)
          .map((i) => (
            <button
              key={i.id}
              type="button"
              className={project.nav === i.id ? "active" : ""}
              onClick={() => {
                onNav(i.id);
                if (isArticle && i.id === "trabajo") onExperience("research");
                if (isArticle && i.id === "resultados")
                  onExperience("manuscript");
              }}
            >
              {i.label}
            </button>
          ))}
      </nav>
    </aside>
  );
}

function ExperienceSurface({
  project,
  channel,
  delegation,
  onDelegation,
  setProject,
  push,
  startResearch,
  openManuscript,
}: {
  project: ProjectState;
  channel: ExperienceChannel;
  delegation: DelegationMode;
  onDelegation: (d: DelegationMode) => void;
  setProject: Dispatch<SetStateAction<ProjectState | null>>;
  push: (msgs: Omit<ChatMessage, "id">[]) => void;
  startResearch: () => void;
  openManuscript: () => void;
}) {
  if (project.experience === "research" || project.articlePhase === "working") {
    return (
      <ResearchSurface
        project={project}
        setProject={setProject}
        onBackToManuscript={() => openManuscript()}
      />
    );
  }
  if (project.experience === "manuscript") {
    return (
      <ManuscriptSurface
        project={project}
        setProject={setProject}
        push={push}
      />
    );
  }
  if (project.experience === "computer") {
    return (
      <div className="cf-surface panel">
        <p className="exp-kicker">Computer</p>
        <h2>Organizando archivos</h2>
        <ul className="exp-steps">
          <li data-status="completed">✓ Escaneé Downloads</li>
          <li data-status="active">● Detectando duplicados</li>
          <li data-status="pending">○ Propuesta de organización</li>
        </ul>
      </div>
    );
  }

  return (
    <div className="cf-surface panel">
      <p className="exp-kicker">{project.title}</p>
      <h2>¿Qué quieres hacer ahora?</h2>
      <p className="muted">
        La estructura aparece según el trabajo. Aún no hay paneles fijos.
      </p>
      <div className="exp-actions">
        <button type="button" className="btn primary" onClick={startResearch}>
          Investigar
        </button>
        <button type="button" className="btn" onClick={openManuscript}>
          Escribir
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            setProject((p) =>
              p
                ? {
                    ...p,
                    emerged: { ...p.emerged, tasks: true },
                    experience: "task",
                  }
                : p,
            )
          }
        >
          Crear tarea
        </button>
      </div>
      <DelegationInline value={delegation} onChange={onDelegation} />
      {channel === "voice" ? (
        <p className="muted">Misma transición disponible por voz.</p>
      ) : null}
    </div>
  );
}

function DelegationInline({
  value,
  onChange,
}: {
  value: DelegationMode;
  onChange: (d: DelegationMode) => void;
}) {
  return (
    <div className="cf-delegation-inline" aria-label="Delegación">
      <p className="muted">¿Cómo quieres trabajar?</p>
      {(
        [
          ["do_it", "⚡ Hazlo por mí"],
          ["together", "🤝 Juntos"],
          ["i_control", "✍️ Yo controlo"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={`btn ${value === id ? "primary" : ""}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ResearchSurface({
  project,
  setProject,
  onBackToManuscript,
}: {
  project: ProjectState;
  setProject: Dispatch<SetStateAction<ProjectState | null>>;
  onBackToManuscript: () => void;
}) {
  if (project.articlePhase === "working" || project.articlePhase === "completed") {
    return (
      <div className="cf-surface panel">
        <p className="exp-kicker">Research · demo</p>
        <h2>
          {project.articlePhase === "completed"
            ? "Artículo preparado"
            : "Preparando investigación"}
        </h2>
        <ul className="exp-steps">
          {ARTICLE_AUTO_STEPS.map((label, i) => {
            let status: "completed" | "active" | "pending" = "pending";
            if (i < project.articleStep) status = "completed";
            else if (i === project.articleStep) status = "active";
            const mark =
              status === "completed" ? "✓" : status === "active" ? "●" : "○";
            return (
              <li key={label} data-status={status}>
                {mark} {label}
              </li>
            );
          })}
        </ul>
        {project.articlePhase === "completed" ? (
          <div className="cf-article-done">
            <p>
              <strong>8,420</strong> palabras · <strong>42</strong> referencias
            </p>
            <p className="muted">Evidence health</p>
            <div className="cf-health" aria-label="87%">
              <span style={{ width: "87%" }} />
            </div>
            <p className="muted">
              32 afirmaciones · 28 respaldadas · 3 parciales · 1 requiere
              evidencia
            </p>
            <p className="muted cf-demo-tag">Datos de demostración</p>
            <div className="exp-actions">
              <button
                type="button"
                className="btn primary"
                onClick={onBackToManuscript}
              >
                Revisar artículo
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setProject((p) =>
                    p ? { ...p, experience: "research", nav: "fuentes" } : p,
                  )
                }
              >
                Ver fuentes
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={() =>
              setProject((p) =>
                p ? { ...p, articlePhase: "idle", researchPhase: "stopped" } : p,
              )
            }
          >
            Detener
          </button>
        )}
        {project.evidenceOpen ? <EvidencePanel /> : null}
      </div>
    );
  }

  const steps = RESEARCH_STEPS_DOCTORADO;
  return (
    <div className="cf-surface panel">
      <p className="exp-kicker">Research</p>
      <h2>
        {project.researchPhase === "working"
          ? "Investigando…"
          : project.researchPhase === "completed"
            ? "Investigación completada"
            : "Research"}
      </h2>
      {project.researchPhase === "working" ||
      project.researchPhase === "completed" ? (
        <ul className="exp-steps">
          {steps.map((label, i) => {
            let status: "completed" | "active" | "pending" = "pending";
            if (project.researchPhase === "completed" || i < project.researchStep)
              status = "completed";
            else if (i === project.researchStep) status = "active";
            const mark =
              status === "completed" ? "✓" : status === "active" ? "●" : "○";
            return (
              <li key={label} data-status={status}>
                {mark} {label}
              </li>
            );
          })}
        </ul>
      ) : null}
      {project.researchPhase === "working" ? (
        <button
          type="button"
          className="btn"
          onClick={() =>
            setProject((p) =>
              p ? { ...p, researchPhase: "stopped", experience: "conversation" } : p,
            )
          }
        >
          Detener
        </button>
      ) : null}
      {project.researchPhase === "completed" ? (
        <>
          <p>
            <strong>14</strong> universidades encontradas
          </p>
          <div className="exp-research-grid">
            {MOCK_UNIVERSITIES.map((u) => (
              <article key={u.id} className="exp-uni-card">
                <strong>{u.name}</strong>
                <span className="muted">{u.modality}</span>
                <span className="muted">Costo {u.cost}</span>
              </article>
            ))}
          </div>
          <div className="exp-actions">
            <button type="button" className="btn primary">
              Comparar
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                setProject((p) => (p ? { ...p, nav: "fuentes" } : p))
              }
            >
              Ver fuentes
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                setProject((p) =>
                  p
                    ? {
                        ...p,
                        emerged: { ...p.emerged, artifacts: true },
                        experience: "artifact",
                      }
                    : p,
                )
              }
            >
              Crear informe
            </button>
            <button type="button" className="btn" onClick={onBackToManuscript}>
              Convertir en artículo
            </button>
          </div>
        </>
      ) : null}
      {project.evidenceOpen ? (
        <>
          <EvidencePanel />
          <button type="button" className="btn" onClick={onBackToManuscript}>
            Volver al manuscrito
          </button>
        </>
      ) : null}
    </div>
  );
}

function ManuscriptSurface({
  project,
  setProject,
  push,
}: {
  project: ProjectState;
  setProject: Dispatch<SetStateAction<ProjectState | null>>;
  push: (msgs: Omit<ChatMessage, "id">[]) => void;
}) {
  return (
    <div className="cf-surface cf-manuscript panel">
      <p className="exp-kicker">Artículo</p>
      <h2>Manuscrito</h2>
      {project.manualSection ? (
        <p className="cf-control-banner">
          Control manual · {project.manualSection}. Ahora tú tienes el control de
          esta sección.
        </p>
      ) : (
        <p className="muted">
          Personal Agent puede ayudar con cada sección. Di «déjame escribir» o
          «haz esta parte por mí».
        </p>
      )}
      <div className="cf-manuscript-layout">
        <nav className="cf-sections" aria-label="Secciones">
          {MANUSCRIPT_SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={project.manualSection === s ? "active" : ""}
              onClick={() =>
                setProject((p) => (p ? { ...p, manualSection: s } : p))
              }
            >
              {s}
            </button>
          ))}
        </nav>
        <article className="cf-doc">
          <h3>Introducción</h3>
          <p>
            Este artículo revisa algoritmos de optimización usados en trading
            cuantitativo y sintetiza hallazgos recientes.
          </p>
          <h3>Marco teórico</h3>
          <p
            className={`cf-claim ${project.manuscriptClaimSelected ? "is-selected" : ""}`}
            onClick={() =>
              setProject((p) =>
                p ? { ...p, manuscriptClaimSelected: true } : p,
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                setProject((p) =>
                  p ? { ...p, manuscriptClaimSelected: true } : p,
                );
              }
            }}
            role="button"
            tabIndex={0}
          >
            {CLAIM_TEXT}
          </p>
          {project.manuscriptClaimSelected ? (
            <div className="cf-claim-actions">
              <span className="muted">✓ 3 fuentes relacionadas</span>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  setProject((p) =>
                    p
                      ? {
                          ...p,
                          experience: "research",
                          evidenceOpen: true,
                          emerged: { ...p.emerged, research: true, sources: true },
                        }
                      : p,
                  );
                  push([
                    {
                      role: "assistant",
                      text: "Buscando evidencia para esta afirmación… 3 fuentes encontradas.",
                    },
                  ]);
                }}
              >
                Buscar evidencia
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setProject((p) => (p ? { ...p, nav: "fuentes" } : p))
                }
              >
                Ver fuentes
              </button>
            </div>
          ) : (
            <p className="muted">Selecciona la afirmación para ver evidencia.</p>
          )}
          {project.evidenceOpen && project.experience === "manuscript" ? (
            <EvidencePanel insertable />
          ) : null}
        </article>
      </div>
    </div>
  );
}

function EvidencePanel({ insertable }: { insertable?: boolean }) {
  return (
    <div className="cf-evidence">
      <p className="exp-kicker">Evidence</p>
      <p>3 fuentes respaldan esta afirmación.</p>
      <ul>
        {MOCK_EVIDENCE.map((e) => (
          <li key={e.id}>
            <strong>{e.title}</strong>
            <p className="muted">{e.snippet}</p>
          </li>
        ))}
      </ul>
      {insertable ? (
        <button type="button" className="btn primary">
          Insertar cita
        </button>
      ) : null}
    </div>
  );
}

function ResourcesPanel({ filesOnly }: { filesOnly?: boolean }) {
  return (
    <div className="cf-surface panel">
      {!filesOnly ? (
        <>
          <h3>Tus recursos</h3>
          <ul className="cf-resource-list">
            {MOCK_USER_RESOURCES.map((r) => (
              <li key={r.id}>
                📄 {r.name}
              </li>
            ))}
          </ul>
          <h3>Encontrados por Personal Agent</h3>
          <ul className="cf-resource-list">
            {MOCK_AGENT_RESOURCES.map((r) => (
              <li key={r.id}>
                📄 {r.name}
                <span className="muted"> · Fuente · Evidence · Where used</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <h3>Archivos</h3>
          <ul className="cf-resource-list">
            <li>📄 report.pdf</li>
            <li>📄 draft-article.md</li>
          </ul>
        </>
      )}
    </div>
  );
}

function TasksPanel({ emerged }: { emerged: boolean }) {
  if (!emerged) {
    return (
      <div className="cf-surface panel">
        <p className="muted">Aún no hay tareas. Surgen cuando las creas.</p>
      </div>
    );
  }
  return (
    <div className="cf-surface panel">
      <h3>Tareas</h3>
      <ul className="exp-steps">
        <li data-status="pending">○ Revisar la propuesta · Mañana 9:00</li>
      </ul>
    </div>
  );
}

function ProjectResumen({
  project,
  messageCount,
  delegation,
  onDelegation,
  onBegin,
  onOpenManuscript,
  onOpenResearch,
}: {
  project: ProjectState;
  messageCount: number;
  delegation: DelegationMode;
  onDelegation: (d: DelegationMode) => void;
  onBegin: () => void;
  onOpenManuscript: () => void;
  onOpenResearch: () => void;
}) {
  if (project.projectType === "scientific_article") {
    return (
      <div className="cf-surface panel cf-article-resumen">
        <p className="exp-kicker">Artículo científico</p>
        <h2>{project.title}</h2>
        <p className="muted">
          Esta conversación forma parte del proyecto · {messageCount} mensajes
        </p>
        <hr className="cf-soft-rule" />
        <p className="muted">Entendí que quieres:</p>
        <p>{project.understanding || ARTICLE_UNDERSTANDING}</p>
        <p className="muted">Propongo trabajar en:</p>
        <ol className="cf-plan">
          {ARTICLE_WORK_PLAN.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <hr className="cf-soft-rule" />
        <p className="muted">¿Cómo quieres trabajar?</p>
        <div className="cf-delegation">
          <button
            type="button"
            className={`btn ${delegation === "do_it" ? "primary" : ""}`}
            onClick={() => onDelegation("do_it")}
          >
            ⚡ Hazlo por mí
            <span className="muted">Yo revisaré el resultado.</span>
          </button>
          <button
            type="button"
            className={`btn ${delegation === "together" ? "primary" : ""}`}
            onClick={() => onDelegation("together")}
          >
            🤝 Trabajemos juntos
            <span className="muted">Consúltame cuando una decisión importe.</span>
          </button>
          <button
            type="button"
            className={`btn ${delegation === "i_control" ? "primary" : ""}`}
            onClick={() => onDelegation("i_control")}
          >
            ✍️ Yo controlo
            <span className="muted">Quiero decidir cada paso.</span>
          </button>
        </div>
        <div className="exp-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn primary" onClick={onBegin}>
            Comenzar
          </button>
          <button type="button" className="btn" onClick={onOpenResearch}>
            Ir a investigación
          </button>
          <button type="button" className="btn" onClick={onOpenManuscript}>
            Ir al manuscrito
          </button>
        </div>
      </div>
    );
  }

  const bits = useMemo(() => {
    const out: string[] = ["Conversación"];
    if (project.emerged.research) out.push("Research");
    if (project.emerged.manuscript) out.push("Manuscript");
    if (project.emerged.tasks) out.push("Tasks");
    if (project.emerged.artifacts) out.push("Artifacts");
    return out;
  }, [project.emerged]);
  return (
    <div className="cf-surface panel">
      <h2>{project.title}</h2>
      <p className="muted">{messageCount} mensajes en el contexto del proyecto.</p>
      <p>
        Estructura emergente: <strong>{bits.join(" → ")}</strong>
      </p>
    </div>
  );
}

function ResultsPanel({ project }: { project: ProjectState }) {
  return (
    <div className="cf-surface panel">
      <h3>Resultados</h3>
      {project.researchPhase === "completed" ? (
        <p>Comparación de universidades lista.</p>
      ) : (
        <p className="muted">Los resultados aparecerán cuando el trabajo avance.</p>
      )}
      {project.articlePhase === "completed" ? (
        <p>Artículo mock · 8,420 palabras · health 87%.</p>
      ) : null}
    </div>
  );
}

function MobileSheet({
  kind,
  project,
  onClose,
  onNav,
}: {
  kind: "ai" | "sources" | "project";
  project: ProjectState | null;
  onClose: () => void;
  onNav: (n: ProjectNavId) => void;
}) {
  return (
    <div className="cf-sheet" role="dialog" aria-modal="true">
      <button type="button" className="cf-sheet-backdrop" onClick={onClose} aria-label="Cerrar" />
      <div className="cf-sheet-body">
        {kind === "ai" ? (
          <p>Continúa la conversación abajo. El agente adapta la experiencia.</p>
        ) : null}
        {kind === "sources" ? <ResourcesPanel /> : null}
        {kind === "project" && project ? (
          <div>
            <h3>{project.title}</h3>
            {(
              [
                "resumen",
                "trabajo",
                "fuentes",
                "resultados",
              ] as ProjectNavId[]
            ).map((n) => (
              <button key={n} type="button" className="btn" onClick={() => onNav(n)}>
                {n}
              </button>
            ))}
          </div>
        ) : null}
        <button type="button" className="btn" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
