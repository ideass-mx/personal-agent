/**
 * Crear proyecto — lenguaje natural, sin menús ni plantillas.
 */
import { useEffect, useId, useRef, useState } from "react";
import { IconRailArrow, IconRailSpark } from "../../components/railIcons";
import { useCompanion } from "./CompanionContext";
import {
  interpretProjectGoal,
  type ProjectInterpretation,
} from "./policies/interpretProjectGoal";

type Phase = "input" | "loading" | "interp" | "error";

const EXAMPLES = [
  "Escribir un artículo científico sobre IA generativa y productividad",
  "Investigar la regulación de privacidad de datos en México",
  "Construir un modelo financiero para mi startup",
];

export function ProjectCreateScreen() {
  const {
    createPreset,
    clearCreatePreset,
    createWorkspaceFromGoal,
    openWorkspace,
    setCompanionNav,
    pushToast,
  } = useCompanion();

  const [text, setText] = useState(createPreset || "");
  const [phase, setPhase] = useState<Phase>("input");
  const [interp, setInterp] = useState<(ProjectInterpretation & { said: string }) | null>(
    null,
  );
  const taRef = useRef<HTMLTextAreaElement>(null);
  const formId = useId();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (createPreset) {
      setText(createPreset);
      setPhase("input");
      setInterp(null);
    }
  }, [createPreset]);

  useEffect(() => {
    if (phase === "input") {
      window.setTimeout(() => taRef.current?.focus(), 40);
    }
  }, [phase]);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  function runInterpret() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setPhase("loading");
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      try {
        const result = interpretProjectGoal(trimmed);
        if (!result.objective) {
          setPhase("error");
          return;
        }
        setInterp({ ...result, said: trimmed });
        setPhase("interp");
      } catch {
        setPhase("error");
      }
    }, 900);
  }

  function createFromInterp() {
    if (!interp) return;
    const ws = createWorkspaceFromGoal(interp.objective, {
      kind: interp.kind,
      sections: interp.sections,
      name: `${interp.label} · ${interp.objective.slice(0, 40)}`,
    });
    clearCreatePreset();
    pushToast(`Proyecto «${ws.name}» creado`, `workspace:${ws.id}`);
    openWorkspace(ws.id);
  }

  return (
    <div className="np-wrap" data-agent="personal">
      <div className="np-eyebrow">
        <IconRailSpark size={16} /> Nuevo proyecto
      </div>

      {phase !== "interp" ? (
        <>
          <h2 className="np-q">¿Qué quieres lograr?</h2>
          <div className="np-box">
            <textarea
              id={formId}
              ref={taRef}
              className="np-ta"
              autoFocus
              value={text}
              placeholder="Ej. Quiero escribir un artículo científico sobre cómo la IA generativa afecta la productividad de los desarrolladores."
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  runInterpret();
                }
              }}
              aria-label="Qué quieres lograr"
            />
          </div>
          <div className="np-foot">
            <div className="np-eg">
              Prueba:{" "}
              {EXAMPLES.map((eg, i) => (
                <span key={eg}>
                  <button
                    type="button"
                    className="np-eg-btn"
                    onClick={() => {
                      setText(eg);
                      taRef.current?.focus();
                    }}
                  >
                    {eg}
                  </button>
                  {i < EXAMPLES.length - 1 ? " · " : ""}
                </span>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={runInterpret}
              disabled={!text.trim() || phase === "loading"}
              style={{ opacity: text.trim() && phase !== "loading" ? 1 : 0.5 }}
            >
              Continuar <IconRailArrow size={15} />
            </button>
          </div>
          {phase === "loading" ? (
            <div className="np-thinking" role="status">
              <span className="spin" aria-hidden /> Entendiendo tu objetivo y
              dando forma al espacio…
            </div>
          ) : null}
          {phase === "error" ? (
            <div className="np-error" role="alert">
              <p>No pude interpretar eso. Reformúlalo con lo que quieres lograr.</p>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setPhase("input")}
              >
                Reintentar
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {phase === "interp" && interp ? (
        <>
          <h2 className="np-q" style={{ fontSize: 22 }}>
            Así lo configuraría.
          </h2>
          <div className="interp">
            <div className="interp-head">
              <div className="interp-said">“{interp.said}”</div>
            </div>
            <div className="interp-body">
              <div className="interp-field">
                <div className="if-label">Proyecto</div>
                <div className="if-val">{interp.label}</div>
              </div>
              <div className="interp-field">
                <div className="if-label">Objetivo</div>
                <div className="if-obj">{interp.objective}</div>
              </div>
              <div className="interp-field">
                <div className="if-label">Espacio sugerido</div>
                <div className="if-note">
                  Empezaré con estas secciones — puedes cambiarlas cuando
                  quieras.
                </div>
                <div className="sugg-flow">
                  {interp.sections.map((s, i) => (
                    <span key={s} className="sugg-flow-item">
                      <span className="sugg-node">{s}</span>
                      {i < interp.sections.length - 1 ? (
                        <span className="sugg-arrow" aria-hidden>
                          <IconRailArrow size={14} />
                        </span>
                      ) : null}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="interp-foot">
              <button
                type="button"
                className="btn btn-primary"
                onClick={createFromInterp}
              >
                Crear proyecto
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setPhase("input");
                }}
              >
                Ajustar
              </button>
            </div>
          </div>
        </>
      ) : null}

      <button
        type="button"
        className="btn btn-ghost np-cancel"
        onClick={() => {
          clearCreatePreset();
          setCompanionNav("projects");
        }}
      >
        Cancelar
      </button>
    </div>
  );
}
