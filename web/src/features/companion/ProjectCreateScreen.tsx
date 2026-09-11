import { useEffect, useMemo, useState } from "react";
import { useCompanion } from "./CompanionContext";
import { kindLabel, type WorkspaceKind } from "./types";

export function ProjectCreateScreen() {
  const {
    createPreset,
    clearCreatePreset,
    createWorkspaceFromGoal,
    openWorkspace,
    setCompanionNav,
  } = useCompanion();
  const [goal, setGoal] = useState(createPreset || "");
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    if (createPreset) setGoal(createPreset);
  }, [createPreset]);

  const interpretation = useMemo(() => {
    const g = goal.trim();
    let kind: WorkspaceKind = "Generic";
    if (/libro|empleo|ia/i.test(g)) kind = "Book";
    else if (/viaje|jap[oó]n/i.test(g)) kind = "Travel";
    else if (/art[ií]culo|cient[ií]fico|paper/i.test(g)) kind = "Paper";
    else if (/inversi[oó]n|finanzas/i.test(g)) kind = "Finance";
    else if (/software|app|c[oó]digo/i.test(g)) kind = "Software";
    return {
      kind,
      objective: g || "Sin objetivo aún",
      sectionsHint:
        kind === "Book"
          ? "Concepto, Investigación, Esquema, Capítulos, Manuscrito, Revisión"
          : kind === "Travel"
            ? "Fechas, Vuelos, Alojamiento, Itinerario, Presupuesto, Reservas"
            : "Secciones adaptadas al objetivo",
    };
  }, [goal]);

  return (
    <div className="cp-create screen" data-agent="personal">
      <header className="screen-header">
        <p className="exp-kicker">Nuevo proyecto</p>
        <h1>¿Qué quieres lograr?</h1>
        <p className="muted">
          Una sola pregunta. El agente interpreta el espacio — tú confirmas.
        </p>
      </header>

      <form
        className="cp-create-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!goal.trim()) return;
          setAdjusting(false);
        }}
      >
        <textarea
          value={goal}
          onChange={(e) => {
            setGoal(e.target.value);
            setAdjusting(true);
          }}
          placeholder="Ej. Quiero escribir un libro sobre IA y empleo"
          rows={3}
          autoFocus
        />
      </form>

      {goal.trim() ? (
        <section className="cp-interpret fade-in">
          <p className="cp-card-kicker">Interpretación</p>
          <dl>
            <div>
              <dt>Tipo</dt>
              <dd>{kindLabel(interpretation.kind)}</dd>
            </div>
            <div>
              <dt>Objetivo</dt>
              <dd>{interpretation.objective}</dd>
            </div>
            <div>
              <dt>Secciones sugeridas</dt>
              <dd>{interpretation.sectionsHint}</dd>
            </div>
          </dl>
          <div className="cp-card-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const ws = createWorkspaceFromGoal(
                  goal.trim(),
                  interpretation.kind,
                );
                clearCreatePreset();
                openWorkspace(ws.id);
              }}
            >
              Crear
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setAdjusting(true);
                document.querySelector<HTMLTextAreaElement>(
                  ".cp-create-form textarea",
                )?.focus();
              }}
            >
              Ajustar
            </button>
          </div>
          {adjusting ? (
            <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
              Edita el objetivo arriba y vuelve a Crear.
            </p>
          ) : null}
        </section>
      ) : null}

      <button
        type="button"
        className="btn ghost"
        style={{ marginTop: 20 }}
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
