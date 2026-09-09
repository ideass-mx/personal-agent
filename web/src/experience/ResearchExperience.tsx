import { useEffect, useMemo, useState } from "react";
import type { AgentSource } from "../sources/types";
import { SourcesPanel } from "../sources/SourcesPanel";
import {
  FIXTURE_RESEARCH_ARTIFACT,
  FIXTURE_RESEARCH_COMPARISON,
  FIXTURE_RESEARCH_COMPLETED,
  FIXTURE_RESEARCH_WORKING,
  type ApprovalBlock,
  type ExperienceAction,
  type StructuredResult,
} from "./contract";
import { StructuredBlockRenderer } from "./renderers/StructuredBlockRenderer";

type Phase = "idle" | "working" | "completed" | "failed";
type Channel = "desktop" | "mobile" | "voice";

type Msg = { id: string; role: "user" | "assistant"; text: string };

type Props = {
  channel?: Channel;
  /** When true, show conversation under experience. */
  showConversation?: boolean;
};

function toAgentSources(
  result: StructuredResult | null,
): AgentSource[] {
  if (!result) return [];
  const out: AgentSource[] = [];
  for (const b of result.blocks) {
    if (b.type === "research" && b.sources) out.push(...b.sources);
    if (b.type === "sources") out.push(...b.sources);
  }
  return out;
}

function approvalFixture(): ApprovalBlock {
  return {
    type: "approval",
    title: "Acción pendiente",
    description: "127 archivos duplicados",
    status: "pending",
    actions: [
      { id: "review", label: "Revisar", action: "approval.review", variant: "secondary" },
      { id: "cancel", label: "Cancelar", action: "approval.reject", variant: "secondary" },
      { id: "authorize", label: "Autorizar", action: "approval.approve", variant: "primary" },
    ],
  };
}

/**
 * Research adaptive experience — mock workflow, no LLM/network.
 */
export function ResearchExperience({
  channel = "desktop",
  showConversation = true,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [query, setQuery] = useState("");
  const [extra, setExtra] = useState<StructuredResult | null>(null);
  const [approval, setApproval] = useState<ApprovalBlock>(approvalFixture);
  const [showProjectPrompt, setShowProjectPrompt] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (phase !== "working") return;
    const t = window.setTimeout(() => setPhase("completed"), 1600);
    return () => window.clearTimeout(t);
  }, [phase]);

  const primary: StructuredResult | null = useMemo(() => {
    if (phase === "idle") return null;
    if (phase === "working") return FIXTURE_RESEARCH_WORKING;
    if (phase === "failed") {
      return {
        blocks: [
          {
            type: "research",
            title: "Algo salió mal",
            status: "failed",
            summary: "No pude completar la investigación.",
            actions: [
              {
                id: "retry",
                label: "Reintentar",
                action: "research.retry",
                variant: "primary",
              },
            ],
          },
        ],
      };
    }
    return FIXTURE_RESEARCH_COMPLETED;
  }, [phase]);

  const sources = toAgentSources(primary);

  function startResearch(text: string) {
    const q = text.trim();
    if (!q) return;
    setQuery(q);
    setExtra(null);
    setShowProjectPrompt(false);
    setMessages((m) => [
      ...m,
      { id: `u_${Date.now()}`, role: "user", text: q },
      {
        id: `a_${Date.now()}`,
        role: "assistant",
        text: "Voy a investigar eso y te muestro los resultados aquí.",
      },
    ]);
    setPhase("working");
    setDraft("");
  }

  function onAction(action: ExperienceAction) {
    switch (action.action) {
      case "research.compare":
        setExtra(FIXTURE_RESEARCH_COMPARISON);
        setMessages((m) => [
          ...m,
          {
            id: `a_cmp_${Date.now()}`,
            role: "assistant",
            text: "Aquí tienes una comparación de las tres mejores opciones.",
          },
        ]);
        break;
      case "research.sources":
        setSourcesOpen(true);
        break;
      case "research.report":
        setExtra(FIXTURE_RESEARCH_ARTIFACT);
        break;
      case "research.save_project":
        setShowProjectPrompt(true);
        break;
      case "research.retry":
      case "research.start":
        startResearch(query || "Doctorado en línea");
        break;
      case "artifact.open":
        setMessages((m) => [
          ...m,
          {
            id: `a_open_${Date.now()}`,
            role: "assistant",
            text: "El informe mock está listo (no se genera un PDF real en esta fase).",
          },
        ]);
        break;
      case "approval.approve":
        setApproval((a) => ({ ...a, status: "approved", actions: [] }));
        break;
      case "approval.reject":
        setApproval((a) => ({ ...a, status: "rejected", actions: [] }));
        break;
      case "approval.review":
        setMessages((m) => [
          ...m,
          {
            id: `a_rev_${Date.now()}`,
            role: "assistant",
            text: "Revisión mock: no se ejecuta ninguna acción real.",
          },
        ]);
        break;
      default:
        break;
    }
  }

  return (
    <div className={`exp-research-root channel-${channel}`}>
      <header className="exp-research-head">
        <p className="exp-kicker">Research</p>
        {phase === "idle" ? (
          <h2>¿Qué quieres investigar?</h2>
        ) : phase === "working" ? (
          <h2>Investigando…</h2>
        ) : phase === "completed" ? (
          <h2>Investigación completada</h2>
        ) : (
          <h2>Algo salió mal</h2>
        )}
      </header>

      {phase === "idle" ? (
        <form
          className="exp-research-prompt"
          onSubmit={(e) => {
            e.preventDefault();
            startResearch(draft);
          }}
        >
          <label className="sr-only" htmlFor="research-q">
            Investiga algo
          </label>
          <input
            id="research-q"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Investiga algo…"
            autoComplete="off"
          />
          <button type="submit" className="btn primary" disabled={!draft.trim()}>
            Investigar
          </button>
        </form>
      ) : null}

      {primary ? (
        <StructuredBlockRenderer
          result={primary}
          channel={channel}
          onAction={onAction}
        />
      ) : null}

      {extra ? (
        <StructuredBlockRenderer
          result={extra}
          channel={channel}
          onAction={onAction}
        />
      ) : null}

      {phase === "completed" && channel === "desktop" ? (
        <StructuredBlockRenderer
          result={{ blocks: [approval] }}
          channel={channel}
          onAction={onAction}
        />
      ) : null}

      {showProjectPrompt ? (
        <div className="exp-project-prompt" role="dialog" aria-modal="true">
          <p>
            Esto parece un trabajo que podemos mantener organizado.
            ¿Quieres crear un proyecto?
          </p>
          <div className="exp-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setShowProjectPrompt(false);
                setMessages((m) => [
                  ...m,
                  {
                    id: `a_proj_${Date.now()}`,
                    role: "assistant",
                    text: "Proyecto mock creado. (Sin API real en esta fase.)",
                  },
                ]);
              }}
            >
              Crear proyecto
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setShowProjectPrompt(false)}
            >
              Continuar conversación
            </button>
          </div>
        </div>
      ) : null}

      {phase === "completed" ? (
        <p className="muted exp-followup">
          ¿Quieres que compare las tres mejores opciones?
        </p>
      ) : null}

      {showConversation ? (
        <section className="exp-conversation" aria-label="Conversación">
          <h3>Conversación</h3>
          <div className="exp-msgs">
            {messages.map((m) => (
              <div key={m.id} className={`exp-msg role-${m.role}`}>
                <strong>{m.role === "user" ? "Tú" : "Agente"}</strong>
                <p>{m.text}</p>
              </div>
            ))}
          </div>
          {phase !== "idle" ? (
            <form
              className="exp-research-prompt"
              onSubmit={(e) => {
                e.preventDefault();
                const t = draft.trim();
                if (!t) return;
                setMessages((m) => [
                  ...m,
                  { id: `u_${Date.now()}`, role: "user", text: t },
                  {
                    id: `a_${Date.now()}`,
                    role: "assistant",
                    text: "De acuerdo. Puedo profundizar en eso cuando quieras.",
                  },
                ]);
                setDraft("");
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Escribe un mensaje…"
                aria-label="Mensaje"
              />
              <button type="submit" className="btn primary" disabled={!draft.trim()}>
                Enviar
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {sourcesOpen ? (
        <>
          <button
            type="button"
            className="sources-backdrop"
            aria-label="Cerrar fuentes"
            onClick={() => setSourcesOpen(false)}
          />
          <SourcesPanel
            sources={sources}
            onClose={() => setSourcesOpen(false)}
            onOpenSource={(s) => {
              if (/^https?:\/\//i.test(s.url)) {
                window.open(s.url, "_blank", "noopener,noreferrer");
              }
            }}
            mobile={channel === "mobile"}
          />
        </>
      ) : null}
    </div>
  );
}
