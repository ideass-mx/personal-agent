import { useApp } from "../state/AppState";
import type { Block, CapabilityId } from "../types";
import { CAPABILITY_LABELS } from "../types";
import { ChartView } from "./charts";

type Props = {
  blocks: Block[];
  onSuggestionAction?: (id: string) => void;
};

export function DesktopBlock({ blocks, onSuggestionAction }: Props) {
  const { approveAction, setCreateProjectOpen } = useApp();

  return (
    <div className="blocks fade-in">
      {blocks.map((block, index) => (
        <BlockView
          key={block.id ?? `${block.type}-${index}`}
          block={block}
          onApprove={(id) => approveAction(id)}
          onSuggestion={(id) => {
            if (onSuggestionAction) onSuggestionAction(id);
            else setCreateProjectOpen(true);
          }}
        />
      ))}
    </div>
  );
}

function BlockView({
  block,
  onApprove,
  onSuggestion,
}: {
  block: Block;
  onApprove: (id: string) => void;
  onSuggestion: (id: string) => void;
}) {
  switch (block.type) {
    case "text":
      return (
        <p
          className={`block-text ${block.tone === "agent" ? "agent-voice hero-voice" : ""} ${
            block.tone === "muted" ? "muted" : ""
          }`}
        >
          {block.text}
        </p>
      );
    case "state":
      return (
        <div className={`state-pill status-${block.status}`}>
          <span className="state-dot" />
          <div>
            <strong>{block.label}</strong>
            {block.detail ? <span className="muted">{block.detail}</span> : null}
          </div>
        </div>
      );
    case "stat":
      return (
        <div className="stat-card">
          <span className="stat-label">{block.label}</span>
          <span className="stat-value">{block.value}</span>
          {block.delta ? (
            <span className={`stat-delta trend-${block.trend ?? "flat"}`}>{block.delta}</span>
          ) : null}
        </div>
      );
    case "statGroup":
      return (
        <div className="stat-group">
          {block.stats.map((s, i) => (
            <BlockView
              key={s.id ?? i}
              block={s}
              onApprove={onApprove}
              onSuggestion={onSuggestion}
            />
          ))}
        </div>
      );
    case "list":
      return (
        <div className="block-panel">
          {block.title ? <h3 className="block-title">{block.title}</h3> : null}
          <ul className={block.ordered ? "ordered" : "plain-list"}>
            {block.items.map((item, i) => (
              <li key={item.id ?? i}>
                <span>{item.text}</span>
                {item.meta ? <span className="muted">{item.meta}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      );
    case "cards":
      return (
        <div className="block-panel">
          {block.title ? <h3 className="block-title">{block.title}</h3> : null}
          <div className="card-grid">
            {block.cards.map((card) => (
              <article
                key={card.id}
                className="content-card"
                data-agent={card.capability}
              >
                {card.badge ? <span className="badge">{card.badge}</span> : null}
                <h4>{card.title}</h4>
                {card.subtitle ? <p className="muted">{card.subtitle}</p> : null}
                {card.body ? <p>{card.body}</p> : null}
                {card.capability ? (
                  <span className="cap-chip" data-agent={card.capability}>
                    {CAPABILITY_LABELS[card.capability]}
                  </span>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      );
    case "table":
      return (
        <div className="block-panel">
          {block.title ? <h3 className="block-title">{block.title}</h3> : null}
          <div className="table-wrap">
            <table>
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
        </div>
      );
    case "chart":
      return (
        <div className="block-panel">
          {block.title ? <h3 className="block-title">{block.title}</h3> : null}
          <ChartView block={block} />
        </div>
      );
    case "progress":
      return (
        <div className="block-panel">
          <div className="progress-head">
            <strong>{block.label}</strong>
            <span className="muted">{block.detail ?? `${block.value}%`}</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${block.value}%` }} />
          </div>
        </div>
      );
    case "timeline":
      return (
        <div className="block-panel">
          {block.title ? <h3 className="block-title">{block.title}</h3> : null}
          <ol className="timeline">
            {block.items.map((item) => (
              <li key={item.id} className={`tl-${item.status}`}>
                <span className="tl-marker" />
                <div>
                  <strong>{item.title}</strong>
                  {item.detail ? <span className="muted">{item.detail}</span> : null}
                  {item.at ? <span className="muted time">{item.at}</span> : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      );
    case "comparison":
      return (
        <div className="block-panel">
          {block.title ? <h3 className="block-title">{block.title}</h3> : null}
          <div className="comparison">
            <div>
              <h4>{block.left.title}</h4>
              <ul>
                {block.left.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>{block.right.title}</h4>
              <ul>
                {block.right.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      );
    case "approval":
      return (
        <div className="approval-card" data-agent={block.capability}>
          <div className="approval-head">
            <strong>{block.title}</strong>
            {block.risk ? <span className={`risk risk-${block.risk}`}>Riesgo {labelRisk(block.risk)}</span> : null}
          </div>
          <p>{block.summary}</p>
          {block.capability ? <CapHint capability={block.capability} /> : null}
          <div className="row-actions">
            <button type="button" className="btn btn-primary" onClick={() => onApprove(block.id)}>
              Aprobar
            </button>
            <button type="button" className="btn btn-ghost">
              Rechazar
            </button>
          </div>
        </div>
      );
    case "confirmation":
      return (
        <div className={`confirm-card ${block.destructive ? "destructive" : ""}`}>
          <strong>{block.title}</strong>
          <p>{block.message}</p>
          <div className="row-actions">
            <button
              type="button"
              className={`btn ${block.destructive ? "btn-danger" : "btn-primary"}`}
            >
              {block.confirmLabel ?? "Confirmar"}
            </button>
            <button type="button" className="btn btn-ghost">
              {block.cancelLabel ?? "Cancelar"}
            </button>
          </div>
        </div>
      );
    case "files":
      return (
        <div className="block-panel">
          {block.title ? <h3 className="block-title">{block.title}</h3> : null}
          <ul className="file-list">
            {block.files.map((f) => (
              <li key={f.id}>
                <span className="file-name">{f.name}</span>
                <span className="muted">{f.kind}{f.size ? ` · ${f.size}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "artifact":
      return (
        <article className="artifact-card" data-agent={block.capability}>
          <span className="badge">{block.kind}</span>
          <h4>{block.title}</h4>
          {block.preview ? <p className="muted">{block.preview}</p> : null}
        </article>
      );
    case "suggestion":
      return (
        <div className="suggestion-card">
          <strong>{block.title}</strong>
          <p>{block.body}</p>
          <button type="button" className="btn btn-primary" onClick={() => onSuggestion(block.id)}>
            {block.actionLabel}
          </button>
        </div>
      );
    case "card":
      return (
        <article className="content-card" data-agent={block.capability}>
          <h4>{block.title}</h4>
          {block.body ? <p>{block.body}</p> : null}
          {block.footer ? <p className="muted">{block.footer}</p> : null}
        </article>
      );
    default:
      return null;
  }
}

function CapHint({ capability }: { capability: CapabilityId }) {
  return (
    <span className="cap-chip" data-agent={capability}>
      {CAPABILITY_LABELS[capability]}
    </span>
  );
}

function labelRisk(risk: "low" | "medium" | "high") {
  return risk === "low" ? "bajo" : risk === "medium" ? "medio" : "alto";
}
