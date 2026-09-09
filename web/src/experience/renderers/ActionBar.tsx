import type { ExperienceAction } from "../contract";

type Props = {
  actions: ExperienceAction[];
  onAction: (action: ExperienceAction) => void;
  compact?: boolean;
};

export function ActionBar({ actions, onAction, compact }: Props) {
  if (!actions.length) return null;
  return (
    <div className={`exp-actions ${compact ? "is-compact" : ""}`} role="group">
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`btn ${a.variant === "primary" ? "primary" : ""} ${
            a.variant === "danger" ? "danger" : ""
          }`}
          onClick={() => onAction(a)}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
