import { MVP_CAPABILITIES, type CapabilityCategory } from "../../lib/capabilities";
import { useApp } from "../../state/AppContext";

const ORDER: CapabilityCategory[] = ["Archivos", "PC", "Excel"];

export function CapabilitiesScreen() {
  const { health } = useApp();
  const live = new Set(health?.agentTools ?? []);

  return (
    <div className="panel">
      <h1>Capabilities</h1>
      <p className="lead">
        Capabilidades del MVP (catálogo estático). La autorización la decide el
        Agent Host; no hay toggles aquí.
      </p>
      {ORDER.map((cat) => (
        <section key={cat} style={{ marginBottom: 20 }}>
          <h2>{cat}</h2>
          <div className="cap-grid">
            {MVP_CAPABILITIES.filter((c) => c.category === cat).map((c) => {
              const available =
                live.size === 0 ? null : live.has(c.toolName);
              return (
                <div key={c.toolName} className="cap-card">
                  <h3>{c.label}</h3>
                  <p className="muted" style={{ margin: "0 0 8px" }}>
                    {c.description}
                  </p>
                  {c.requiresConfirmation ? (
                    <span className="chip">Requiere autorización</span>
                  ) : (
                    <span className="chip" style={{ background: "#ecfdf5", color: "#047857" }}>
                      Sin confirmación
                    </span>
                  )}
                  {c.platformHint ? (
                    <span className="chip">{c.platformHint}</span>
                  ) : null}
                  {available === true ? (
                    <span className="chip" style={{ background: "#ecfdf5", color: "#047857" }}>
                      En snapshot de tools
                    </span>
                  ) : available === false ? (
                    <span className="chip">No en snapshot de tools</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
