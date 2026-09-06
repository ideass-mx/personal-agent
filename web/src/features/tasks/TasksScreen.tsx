export function TasksScreen() {
  return (
    <div className="screen" data-agent="personal">
      <header className="screen-header">
        <h1>Tareas</h1>
        <p className="muted">
          Acciones, decisiones y aprobaciones que requieren al usuario. Vista agregada — no
          poseen nada.
        </p>
      </header>
      <div className="placeholder-card fade-in">
        <strong>Sin API de tareas todavía</strong>
        <p className="muted">
          Las aprobaciones en vivo siguen llegando por WebSocket (
          <code>confirm_request</code>) y se muestran en el espacio del agente / HITL.
        </p>
      </div>
    </div>
  );
}
