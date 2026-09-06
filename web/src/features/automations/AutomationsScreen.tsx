export function AutomationsScreen() {
  return (
    <div className="screen" data-agent="personal">
      <header className="screen-header">
        <h1>Automatizaciones</h1>
        <p className="muted">
          Lo que el agente hace solo por horario o disparador. No se completan: se gestionan.
        </p>
      </header>
      <div className="placeholder-card fade-in">
        <strong>Sin API de automatizaciones todavía</strong>
        <p className="muted">
          Cuando el Gateway exponga monitores y recurrentes, esta vista los listará con
          historial y pause/resume.
        </p>
      </div>
    </div>
  );
}
