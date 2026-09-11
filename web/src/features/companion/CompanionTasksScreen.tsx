import { useMemo, useState } from "react";
import { useCompanion } from "./CompanionContext";
import type { CompanionTask, TaskState } from "./types";

type Seg = "all" | "agent" | "you";

const GROUPS: Array<{
  key: string;
  title: string;
  states: TaskState[];
}> = [
  { key: "doing", title: "Working on now", states: ["doing"] },
  { key: "queued", title: "Up next", states: ["queued"] },
  { key: "needs", title: "Needs you", states: ["needs-you"] },
  { key: "todo", title: "Your to-dos", states: ["todo"] },
  { key: "watching", title: "Watching", states: ["watching"] },
  { key: "done", title: "Done today", states: ["done"] },
];

export function CompanionTasksScreen() {
  const { tasks, approveTask, toggleTodo, workspaces } = useCompanion();
  const [seg, setSeg] = useState<Seg>("all");

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (seg === "all") return true;
      if (seg === "agent") {
        return t.owner === "agent" || t.state === "needs-you";
      }
      return t.owner === "you" || t.state === "needs-you";
    });
  }, [tasks, seg]);

  function projectName(id?: string) {
    if (!id) return null;
    return workspaces.find((w) => w.id === id)?.name;
  }

  return (
    <div className="cp-tasks screen" data-agent="personal">
      <header className="screen-header">
        <h1>Tasks</h1>
        <p className="muted">
          Qué está haciendo el agente, qué te necesita, y tus pendientes.
        </p>
      </header>

      <div className="cp-seg" role="tablist">
        {(
          [
            ["all", "All"],
            ["agent", "Agent"],
            ["you", "You"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={seg === id ? "active" : ""}
            aria-selected={seg === id}
            onClick={() => setSeg(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {GROUPS.map((g) => {
        const rows = filtered.filter((t) => g.states.includes(t.state));
        if (rows.length === 0) return null;
        return (
          <section key={g.key} className="cp-task-group">
            <h2>{g.title}</h2>
            <ul>
              {rows.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  project={projectName(t.projectId)}
                  onApprove={() => approveTask(t.id)}
                  onToggle={() => toggleTodo(t.id)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TaskRow({
  task,
  project,
  onApprove,
  onToggle,
}: {
  task: CompanionTask;
  project: string | null | undefined;
  onApprove: () => void;
  onToggle: () => void;
}) {
  return (
    <li className="cp-task-row">
      <div className="cp-task-who" title={task.owner === "agent" ? "Agente" : "Tú"}>
        {task.owner === "agent" ? "A" : "Tú"}
      </div>
      <div className="cp-task-body">
        <strong>{task.title}</strong>
        <span className="muted">
          {task.note || task.when || project || task.state}
          {typeof task.pct === "number" ? ` · ${task.pct}%` : ""}
        </span>
      </div>
      {task.state === "needs-you" ? (
        <button type="button" className="btn primary sm" onClick={onApprove}>
          Resolver
        </button>
      ) : null}
      {task.state === "todo" || task.state === "done" ? (
        <input
          type="checkbox"
          checked={task.state === "done"}
          onChange={onToggle}
          aria-label={task.title}
        />
      ) : null}
      {task.state === "doing" && typeof task.pct === "number" ? (
        <div className="cp-progress sm" aria-hidden>
          <span style={{ width: `${task.pct}%` }} />
        </div>
      ) : null}
    </li>
  );
}
