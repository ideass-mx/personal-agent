import type { ExperienceAction, StructuredBlock } from "../contract";
import { ActionBar } from "./ActionBar";

type Channel = "desktop" | "mobile" | "voice";

type Props = {
  block: StructuredBlock;
  channel?: Channel;
  onAction?: (action: ExperienceAction) => void;
};

function stepMark(status: string): string {
  if (status === "completed") return "✓";
  if (status === "active") return "●";
  if (status === "failed") return "!";
  return "○";
}

export function StructuredBlockView({
  block,
  channel = "desktop",
  onAction,
}: Props) {
  const compact = channel === "mobile";
  const voice = channel === "voice";
  const fire = onAction ?? (() => undefined);

  switch (block.type) {
    case "card":
      return (
        <article className="exp-card content-card">
          <h3>{block.title}</h3>
          {block.description ? <p className="muted">{block.description}</p> : null}
          {block.metadata && !voice ? (
            <ul className="exp-meta">
              {Object.entries(block.metadata).map(([k, v]) => (
                <li key={k}>
                  <span className="muted">{k}</span> {v}
                </li>
              ))}
            </ul>
          ) : null}
          {block.actions ? (
            <ActionBar actions={block.actions} onAction={fire} compact={compact} />
          ) : null}
        </article>
      );

    case "table":
      if (voice) {
        return (
          <p className="exp-voice">
            {block.title ? `${block.title}. ` : ""}
            Tabla con {block.columns.length} columnas y {block.rows.length} filas.
          </p>
        );
      }
      return (
        <div className="exp-table-wrap">
          {block.title ? <h3>{block.title}</h3> : null}
          <table className="exp-table">
            <thead>
              <tr>
                {block.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "progress":
      if (voice) {
        const active = block.steps.find((s) => s.status === "active");
        return (
          <p className="exp-voice" aria-live="polite">
            {block.title}. {active ? `Ahora: ${active.label}.` : block.status}
          </p>
        );
      }
      return (
        <section className="exp-progress" aria-label={block.title}>
          <h3>{block.title}</h3>
          <ol className="exp-steps">
            {block.steps.map((s) => (
              <li key={s.id} data-status={s.status}>
                <span aria-hidden>{stepMark(s.status)}</span> {s.label}
              </li>
            ))}
          </ol>
        </section>
      );

    case "research":
      if (voice) {
        return (
          <p className="exp-voice">
            {block.title}. {block.summary || ""}
            {block.resultCount
              ? ` Encontré ${block.resultCount} resultados.`
              : ""}
          </p>
        );
      }
      return (
        <section className={`exp-research status-${block.status}`}>
          <h2>{block.title}</h2>
          {block.summary ? <p className="lead">{block.summary}</p> : null}
          {block.items && block.items.length > 0 ? (
            <div className={`exp-research-grid ${compact ? "is-compact" : ""}`}>
              {block.items.slice(0, compact ? 3 : 6).map((item) => (
                <article key={item.id} className="exp-uni-card">
                  <strong>{item.title}</strong>
                  {item.description ? (
                    <span className="muted">{item.description}</span>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
          {block.actions ? (
            <ActionBar actions={block.actions} onAction={fire} compact={compact} />
          ) : null}
        </section>
      );

    case "comparison":
      if (voice) {
        const names = block.columns.map((c) => c.title).join(", ");
        return (
          <p className="exp-voice">
            {block.title}. Opciones: {names}.
          </p>
        );
      }
      if (compact) {
        return (
          <section className="exp-comparison">
            <h3>{block.title}</h3>
            <ul className="exp-compare-list">
              {block.columns.map((col) => (
                <li key={col.id}>
                  <strong>{col.title}</strong>
                  <span className="muted">
                    {Object.entries(col.attributes)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      }
      {
        const keys = Array.from(
          new Set(block.columns.flatMap((c) => Object.keys(c.attributes))),
        );
        return (
          <section className="exp-comparison">
            <h3>{block.title}</h3>
            <div className="exp-table-wrap">
              <table className="exp-table">
                <thead>
                  <tr>
                    <th />
                    {block.columns.map((c) => (
                      <th key={c.id}>{c.title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k}>
                      <th scope="row">{k}</th>
                      {block.columns.map((c) => (
                        <td key={c.id}>{c.attributes[k] || "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      }

    case "sources":
      if (voice) {
        return (
          <p className="exp-voice">
            Tengo {block.sources.length} fuentes disponibles.
          </p>
        );
      }
      return (
        <section className="exp-sources" aria-label="Fuentes">
          <h3>Fuentes</h3>
          <ul className="exp-source-list">
            {block.sources.map((s) => (
              <li key={s.id}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
                <span className="muted"> · {s.domain}</span>
                {s.snippet && !compact ? (
                  <p className="muted">{s.snippet}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      );

    case "artifact":
      return (
        <article className="exp-artifact artifact-card">
          <h3>{block.name}</h3>
          <p className="muted">
            {block.kind.toUpperCase()} · {block.status}
          </p>
          {block.actions ? (
            <ActionBar actions={block.actions} onAction={fire} compact={compact} />
          ) : null}
        </article>
      );

    case "task":
      return (
        <article className="exp-task content-card">
          <h3>{block.title}</h3>
          <p className="muted">
            {block.status.replace("_", " ")}
            {block.dueAt ? ` · ${block.dueAt}` : ""}
          </p>
          {block.actions ? (
            <ActionBar actions={block.actions} onAction={fire} compact={compact} />
          ) : null}
        </article>
      );

    case "approval":
      return (
        <article className={`exp-approval approval-card status-${block.status}`}>
          <h3>{block.title}</h3>
          <p>{block.description}</p>
          <p className="muted">Estado: {block.status}</p>
          {block.status === "pending" ? (
            <ActionBar actions={block.actions} onAction={fire} compact={compact} />
          ) : null}
        </article>
      );

    default:
      return null;
  }
}
