import { useState } from "react";
import type { CapabilityId } from "../types";
import { CAPABILITY_LABELS } from "../types";
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

/**
 * Experience Lab — comparar Universal vs Adaptive y canales Desktop/Mobile/Voice.
 * Mock-only: sin LLM, Cloud ni red.
 */
export function ExperienceLabScreen() {
  const [mode, setMode] = useState<ExperienceMode>("adaptive");
  const [agent, setAgent] = useState<ExperienceAgentId>("research");
  const [channel, setChannel] = useState<ExperienceChannel>("desktop");
  const [compareTask, setCompareTask] = useState<CompareTask>("universities");
  const [tab, setTab] = useState<"lab" | "compare">("lab");

  return (
    <div className="screen exp-lab">
      <header className="screen-header">
        <div>
          <p className="exp-kicker">Experience Lab</p>
          <h1>Experiencia del agente</h1>
          <p className="muted lead">
            El mismo agente adapta su interfaz al trabajo — sin apps separadas.
          </p>
        </div>
      </header>

      <div className="exp-lab-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "lab"}
          className={tab === "lab" ? "active" : ""}
          onClick={() => setTab("lab")}
        >
          Laboratorio
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
              <legend>Agente</legend>
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
      ) : (
        <ComparisonBoard task={compareTask} onTask={setCompareTask} />
      )}
    </div>
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

      <div className="exp-compare-cols">
        <section className="exp-col">
          <h3>Universal Chat</h3>
          <p className="muted">Solo conversación</p>
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
          <h3>Specialized Agent</h3>
          <p className="muted">Dashboard independiente</p>
          <div className="exp-specialized">
            {task === "universities" ? "Research Dashboard" : null}
            {task === "portfolio" ? "Trading Dashboard" : null}
            {task === "files" ? "Computer Dashboard" : null}
            <p className="muted">
              Se siente como otra aplicación, no como el mismo agente.
            </p>
          </div>
        </section>

        <section className="exp-col is-adaptive">
          <h3>Adaptive Agent</h3>
          <p className="muted">
            Misma aplicación · experiencia que se adapta al trabajo
          </p>
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
          <div className="exp-msgs" style={{ marginTop: 12 }}>
            <div className="exp-msg role-assistant">
              <strong>Agente</strong>
              <p>¿Quieres que profundice desde la conversación?</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
