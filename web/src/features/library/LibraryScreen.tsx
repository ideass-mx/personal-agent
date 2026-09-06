export function LibraryScreen() {
  return (
    <div className="screen" data-agent="personal">
      <header className="screen-header">
        <h1>Biblioteca</h1>
        <p className="muted">
          Explorador agregado de archivos y artefactos. Columna Proyecto — el agente solo como
          origen.
        </p>
      </header>
      <div className="placeholder-card fade-in">
        <strong>Sin índice de biblioteca todavía</strong>
        <p className="muted">
          El Gateway permite descargar artefactos por id (
          <code>/artifacts/:id</code>), pero no hay listado. Los tools de filesystem viven en el
          Node, no como explorador HTTP.
        </p>
      </div>
    </div>
  );
}
