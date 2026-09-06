import { useMemo, useState } from "react";
import { useApp } from "../state/AppState";
import { CAPABILITY_LABELS } from "../types";
import { IconSearch } from "../components/icons";

export function LibraryScreen() {
  const { files, projects } = useApp();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.kind.toLowerCase().includes(q) ||
        (f.origin && CAPABILITY_LABELS[f.origin].toLowerCase().includes(q)),
    );
  }, [files, query]);

  return (
    <div className="screen" data-agent="personal">
      <header className="screen-header">
        <h1>Biblioteca</h1>
        <p className="muted">
          Explorador agregado de archivos y artefactos. Columna Proyecto — el agente solo aparece como origen.
        </p>
      </header>

      <div className="search-bar">
        <IconSearch size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar en biblioteca…"
          aria-label="Buscar"
        />
      </div>

      <div className="table-wrap fade-in">
        <table className="library-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Proyecto</th>
              <th>Origen</th>
              <th>Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => {
              const project = f.projectId
                ? projects.find((p) => p.id === f.projectId)
                : null;
              return (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td className="muted">{f.kind}</td>
                  <td>{project ? project.name : "Suelto"}</td>
                  <td>
                    {f.origin ? (
                      <span className="cap-chip" data-agent={f.origin}>
                        {CAPABILITY_LABELS[f.origin]}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="muted">{f.updatedAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
