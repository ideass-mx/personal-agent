import { useState } from "react";
import type { CapabilityId } from "../types";
import { CAPABILITY_LABELS } from "../types";
import { ConversationFirstDemo } from "./conversationFirst/ConversationFirstDemo";
import {
  PRINCIPLE_INTERNAL,
  PRINCIPLE_VISIBLE,
} from "./conversationFirst/scenarios";
import type { LabDimensions } from "./conversationFirst/types";
import {
  FIXTURE_RESEARCH_COMPLETED,
  type ExperienceAgentId,
  type ExperienceChannel,
  type ExperienceMode,
} from "./contract";
import { ResearchExperience } from "./ResearchExperience";
import { StructuredBlockRenderer } from "./renderers/StructuredBlockRenderer";

const AGENTS: ExperienceAgentId[] = [
  "personal",
  "research",
  "trading",
  "office",
  "computer",
];

type CompareTask = "universities" | "portfolio" | "files";
type LabTab = "conversation" | "lab" | "compare";

/**
 * Experience Lab — conversation-first adaptive + Universal vs Adaptive.
 * Mock-only: sin LLM, Cloud ni red.
 */
export function ExperienceLabScreen() {
  const [mode, setMode] = useState<ExperienceMode>("adaptive");
  const [agent, setAgent] = useState<ExperienceAgentId>("research");
  const [channel, setChannel] = useState<ExperienceChannel>("desktop");
  const [compareTask, setCompareTask] = useState<CompareTask>("universities");
  const [tab, setTab] = useState<LabTab>("conversation");
  const [dims, setDims] = useState<LabDimensions>({
    startingPoint: "conversation",
    intent: "ask",
    complexity: "simple",
    delegation: "together",
    channel: "desktop",
  });

  return (
    <div className="screen exp-lab">
      <header className="screen-header">
        <div>
          <p className="exp-kicker">Experience Lab</p>
          <h1>Experiencia del agente</h1>
          <p className="muted lead">
            El usuario expresa la intención. Personal Agent organiza el trabajo.
            La interfaz se adapta.
          </p>
        </div>
      </header>

      <div className="exp-lab-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "conversation"}
          className={tab === "conversation" ? "active" : ""}
          onClick={() => setTab("conversation")}
        >
          Conversación → Trabajo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "lab"}
          className={tab === "lab" ? "active" : ""}
          onClick={() => setTab("lab")}
        >
          Capas / canales
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "compare"}
          className={tab === "compare" ? "active" : ""}
          onClick={() => setTab("compare")}
        >
          Universal vs Adaptive
        </button>
      </div>

      {tab === "conversation" ? (
        <>
          <DimensionBoard dims={{ ...dims, channel }} onChange={setDims} />
          <div className={`exp-lab-stage channel-${channel}`}>
            <div className="exp-controls" style={{ marginBottom: 16 }}>
              <fieldset>
                <legend>Canal</legend>
                {(["desktop", "mobile", "voice"] as const).map((c) => (
                  <label key={c}>
                    <input
                      type="radio"
                      name="cf-channel"
                      checked={channel === c}
                      onChange={() => {
                        setChannel(c);
                        setDims((d) => ({ ...d, channel: c }));
                      }}
                    />{" "}
                    {c === "desktop"
                      ? "Desktop"
                      : c === "mobile"
                        ? "Mobile"
                        : "Voice"}
                  </label>
                ))}
              </fieldset>
            </div>
            <ConversationFirstDemo
              channel={channel}
              dimensions={{ ...dims, channel }}
              onDimensions={setDims}
            />
          </div>
        </>
      ) : null}

      {tab === "lab" ? (
        <>
          <section className="exp-controls" aria-label="Modelo de experiencia">
            <fieldset>
              <legend>Modelo</legend>
              <label>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "universal"}
                  onChange={() => setMode("universal")}
                />{" "}
                Universal
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "adaptive"}
                  onChange={() => setMode("adaptive")}
                />{" "}
                Adaptive
              </label>
            </fieldset>

            <fieldset>
              <legend>Superficie (legacy lab)</legend>
              <div className="exp-agent-row">
                {AGENTS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`btn ${agent === id ? "primary" : ""}`}
                    onClick={() => setAgent(id)}
                  >
                    {CAPABILITY_LABELS[id as CapabilityId] || id}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Canal</legend>
              {(["desktop", "mobile", "voice"] as const).map((c) => (
                <label key={c}>
                  <input
                    type="radio"
                    name="channel"
                    checked={channel === c}
                    onChange={() => setChannel(c)}
                  />{" "}
                  {c === "desktop"
                    ? "Desktop"
                    : c === "mobile"
                      ? "Mobile"
                      : "Voice"}
                </label>
              ))}
            </fieldset>
          </section>

          <div className={`exp-lab-stage channel-${channel}`}>
            {mode === "universal" ? (
              <UniversalChatMock agent={agent} />
            ) : agent === "research" ? (
              <ResearchExperience channel={channel} />
            ) : (
              <MockAdaptiveAgent agent={agent} channel={channel} />
            )}
          </div>
        </>
      ) : null}

      {tab === "compare" ? (
        <ComparisonBoard task={compareTask} onTask={setCompareTask} />
      ) : null}
    </div>
  );
}

function DimensionBoard({
  dims,
  onChange,
}: {
  dims: LabDimensions;
  onChange: (d: LabDimensions) => void;
}) {
  return (
    <section className="cf-dims" aria-label="Dimensiones de experiencia">
      <p className="cf-principle-line">{PRINCIPLE_VISIBLE}</p>
      <p className="muted cf-principle-en">{PRINCIPLE_INTERNAL}</p>
      <div className="exp-controls">
        <fieldset>
          <legend>Starting point</legend>
          {(
            [
              ["conversation", "Conversation"],
              ["direct_article", "Direct article"],
              ["existing_project", "Existing Project"],
            ] as const
          ).map(([id, label]) => (
            <label key={id}>
              <input
                type="radio"
                name="start"
                checked={dims.startingPoint === id}
                onChange={() => onChange({ ...dims, startingPoint: id })}
              />{" "}
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>User intent</legend>
          {(
            [
              ["ask", "Conversation"],
              ["research", "Research"],
              ["scientific_article", "Scientific article"],
              ["write", "Write"],
              ["organize", "Organize"],
            ] as const
          ).map(([id, label]) => (
            <label key={id}>
              <input
                type="radio"
                name="intent"
                checked={dims.intent === id}
                onChange={() => onChange({ ...dims, intent: id })}
              />{" "}
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Complexity</legend>
          {(
            [
              ["simple", "Simple"],
              ["multi_step", "Multi-step"],
              ["long_running", "Long-running"],
            ] as const
          ).map(([id, label]) => (
            <label key={id}>
              <input
                type="radio"
                name="complexity"
                checked={dims.complexity === id}
                onChange={() => onChange({ ...dims, complexity: id })}
              />{" "}
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Delegation</legend>
          {(
            [
              ["do_it", "Do it for me"],
              ["together", "Work together"],
              ["i_control", "I control"],
            ] as const
          ).map(([id, label]) => (
            <label key={id}>
              <input
                type="radio"
                name="delegation"
                checked={dims.delegation === id}
                onChange={() => onChange({ ...dims, delegation: id })}
              />{" "}
              {label}
            </label>
          ))}
        </fieldset>
      </div>
      <p className="muted cf-flow-hint">
        Conversation → Intent → Work detection → Project (si hace falta) →
        Experience adapts
      </p>
    </section>
  );
}

function UniversalChatMock({ agent }: { agent: ExperienceAgentId }) {
  return (
    <div className="exp-universal panel">
      <h2>Conversación universal</h2>
      <p className="muted">
        Agente: {CAPABILITY_LABELS[agent as CapabilityId] || agent}. Todo ocurre
        en el chat.
      </p>
      <div className="exp-msgs">
        <div className="exp-msg role-user">
          <strong>Tú</strong>
          <p>Investiga y compara universidades.</p>
        </div>
        <div className="exp-msg role-assistant">
          <strong>Agente</strong>
          <p>
            Encontré varias opciones. UNIR, UTEL y TECH destacan por modalidad
            online. ¿Quieres que profundice en costos o requisitos?
          </p>
        </div>
      </div>
    </div>
  );
}

function MockAdaptiveAgent({
  agent,
  channel,
}: {
  agent: ExperienceAgentId;
  channel: ExperienceChannel;
}) {
  const title =
    agent === "trading"
      ? "Análisis financiero"
      : agent === "office"
        ? "Espacio de documentos"
        : agent === "computer"
          ? "Organización de archivos"
          : "Personal";
  return (
    <div className="exp-mock-adaptive panel">
      <h2>{title}</h2>
      <p className="muted">
        Experiencia adaptativa mock · canal {channel}. Misma aplicación Personal
        Agent, superficie distinta según el trabajo.
      </p>
      {agent === "trading" ? (
        <div className="exp-research-grid">
          <article className="exp-uni-card">
            <strong>Portfolio</strong>
            <span className="muted">Mock · sin runtime Trading</span>
          </article>
          <article className="exp-uni-card">
            <strong>Riesgo</strong>
            <span className="muted">Moderado</span>
          </article>
        </div>
      ) : null}
      {agent === "computer" ? (
        <StructuredBlockRenderer
          result={{
            blocks: [
              {
                type: "progress",
                title: "Organizando archivos",
                status: "working",
                steps: [
                  { id: "1", label: "Escaneé carpetas", status: "completed" },
                  { id: "2", label: "Detecté duplicados", status: "active" },
                  { id: "3", label: "Propuesta lista", status: "pending" },
                ],
              },
              {
                type: "task",
                title: "Revisar 127 duplicados",
                status: "pending",
                actions: [
                  {
                    id: "go",
                    label: "Revisar",
                    action: "noop",
                    variant: "primary",
                  },
                ],
              },
            ],
          }}
          channel={channel}
        />
      ) : null}
      {agent === "office" || agent === "personal" ? (
        <p className="lead">Continúa en conversación con contexto del trabajo.</p>
      ) : null}
    </div>
  );
}

function ComparisonBoard({
  task,
  onTask,
}: {
  task: CompareTask;
  onTask: (t: CompareTask) => void;
}) {
  const prompt =
    task === "universities"
      ? "Investiga y compara universidades."
      : task === "portfolio"
        ? "Analiza mi portfolio."
        : "Organiza mis archivos.";

  return (
    <div className="exp-compare-board">
      <div className="exp-controls">
        <fieldset>
          <legend>Tarea común</legend>
          {(
            [
              ["universities", "Universidades"],
              ["portfolio", "Portfolio"],
              ["files", "Archivos"],
            ] as const
          ).map(([id, label]) => (
            <label key={id}>
              <input
                type="radio"
                name="task"
                checked={task === id}
                onChange={() => onTask(id)}
              />{" "}
              {label}
            </label>
          ))}
        </fieldset>
        <p className="muted">
          Prompt: <em>{prompt}</em>
        </p>
      </div>

      <div className="exp-compare-cols exp-compare-cols-4">
        <section className="exp-col">
          <h3>Universal Chat</h3>
          <p className="muted">Todo es conversación</p>
          <div className="exp-msgs">
            <div className="exp-msg role-user">
              <strong>Tú</strong>
              <p>{prompt}</p>
            </div>
            <div className="exp-msg role-assistant">
              <strong>Agente</strong>
              <p>
                {task === "universities"
                  ? "Te resumo opciones en texto…"
                  : task === "portfolio"
                    ? "Tu cartera se ve balanceada… (texto)"
                    : "Encontré archivos duplicados… (texto)"}
              </p>
            </div>
          </div>
        </section>

        <section className="exp-col">
          <h3>Specialized Apps</h3>
          <p className="muted">Cada trabajo = otra app</p>
          <div className="exp-specialized">
            {task === "universities" ? "Research App" : null}
            {task === "portfolio" ? "Trading App" : null}
            {task === "files" ? "Files App" : null}
            <p className="muted">
              Se siente como otra aplicación, no como el mismo agente.
            </p>
          </div>
        </section>

        <section className="exp-col">
          <h3>Adaptive Agent</h3>
          <p className="muted">Misma app · experiencia según el trabajo</p>
          {task === "universities" ? (
            <StructuredBlockRenderer
              result={FIXTURE_RESEARCH_COMPLETED}
              channel="desktop"
            />
          ) : null}
          {task === "portfolio" ? (
            <MockAdaptiveAgent agent="trading" channel="desktop" />
          ) : null}
          {task === "files" ? (
            <MockAdaptiveAgent agent="computer" channel="desktop" />
          ) : null}
        </section>

        <section className="exp-col is-adaptive">
          <h3>Conversation-first Adaptive</h3>
          <p className="muted">
            Empieza como chat; estructura solo cuando hace falta
          </p>
          <ol className="cf-compare-flow">
            <li>Conversation</li>
            <li>Intent understanding</li>
            <li>¿Simple o trabajo?</li>
            <li>Project (si aplica)</li>
            <li>Adaptive experience</li>
          </ol>
          <p className="muted">
            Hipótesis a validar: el usuario no elige una app — expresa intención
            y el agente organiza.
          </p>
        </section>
      </div>
    </div>
  );
}
