import type { ReactNode } from "react";
import { SegmentedControl, Toggle } from "../components/controls";
import { useApp } from "../state/AppState";
import type { SettingsSectionId } from "../types";

type NavItem =
  | { kind: "item"; id: SettingsSectionId; label: string }
  | { kind: "sep" };

const NAV: NavItem[] = [
  { kind: "item", id: "profile", label: "Perfil" },
  { kind: "item", id: "my-agent", label: "Mi agente" },
  { kind: "item", id: "memory", label: "Memoria" },
  { kind: "sep" },
  { kind: "item", id: "capabilities", label: "Capacidades" },
  { kind: "item", id: "connections", label: "Conexiones" },
  { kind: "sep" },
  { kind: "item", id: "privacy", label: "Privacidad y datos" },
  { kind: "item", id: "notifications", label: "Notificaciones" },
  { kind: "item", id: "appearance", label: "Apariencia" },
  { kind: "sep" },
  { kind: "item", id: "system", label: "Sistema" },
];

export function SettingsScreen() {
  const { nav, setNav, settings, setSettings, memories, deleteMemory, deleteAllMemories, projects } =
    useApp();

  if (nav.screen !== "settings") return null;
  const section = nav.section;

  const patch = <K extends keyof typeof settings>(
    key: K,
    value: (typeof settings)[K] | ((prev: (typeof settings)[K]) => (typeof settings)[K]),
  ) => {
    setSettings((prev) => ({
      ...prev,
      [key]: typeof value === "function" ? (value as (p: (typeof settings)[K]) => (typeof settings)[K])(prev[key]) : value,
    }));
  };

  return (
    <div className="settings-layout" data-agent="personal">
      <aside className="settings-nav">
        <h1>Configuración</h1>
        <nav>
          {NAV.map((item, i) =>
            item.kind === "sep" ? (
              <div key={`sep-${i}`} className="settings-sep" />
            ) : (
              <button
                key={item.id}
                type="button"
                className={section === item.id ? "active" : ""}
                onClick={() => setNav({ screen: "settings", section: item.id })}
              >
                {item.label}
              </button>
            ),
          )}
        </nav>
      </aside>

      <div className="settings-body fade-in">
        {section === "profile" ? (
          <Section title="Perfil">
            <label className="field">
              <span className="field-label">Nombre</span>
              <input
                value={settings.profile.name}
                onChange={(e) =>
                  patch("profile", { ...settings.profile, name: e.target.value })
                }
              />
            </label>
            <div className="avatar-row">
              <span className="avatar lg">TI</span>
              <button type="button" className="btn btn-ghost">
                Cambiar foto
              </button>
            </div>
            <label className="field">
              <span className="field-label">Información sobre mí</span>
              <textarea
                rows={4}
                value={settings.profile.about}
                onChange={(e) =>
                  patch("profile", { ...settings.profile, about: e.target.value })
                }
              />
            </label>
            <label className="field">
              <span className="field-label">Preferencias personales</span>
              <textarea
                rows={3}
                value={settings.profile.preferences}
                onChange={(e) =>
                  patch("profile", {
                    ...settings.profile,
                    preferences: e.target.value,
                  })
                }
              />
            </label>
          </Section>
        ) : null}

        {section === "my-agent" ? (
          <Section title="Mi agente">
            <label className="field">
              <span className="field-label">Nombre del agente</span>
              <input
                value={settings.agent.name}
                onChange={(e) =>
                  patch("agent", { ...settings.agent, name: e.target.value })
                }
              />
            </label>
            <label className="field">
              <span className="field-label">Personalidad</span>
              <textarea
                rows={3}
                value={settings.agent.personality}
                onChange={(e) =>
                  patch("agent", { ...settings.agent, personality: e.target.value })
                }
              />
            </label>
            <SegmentedControl
              label="Estilo de comunicación"
              value={settings.agent.style}
              onChange={(style) => patch("agent", { ...settings.agent, style })}
              options={[
                { value: "concise", label: "Conciso" },
                { value: "balanced", label: "Equilibrado" },
                { value: "detailed", label: "Detallado" },
              ]}
            />
            <SegmentedControl
              label="Nivel de detalle"
              value={settings.agent.detailLevel}
              onChange={(detailLevel) =>
                patch("agent", { ...settings.agent, detailLevel })
              }
              options={[
                { value: "low", label: "Bajo" },
                { value: "medium", label: "Medio" },
                { value: "high", label: "Alto" },
              ]}
            />
            <SegmentedControl
              label="Iniciativa"
              value={settings.agent.initiative}
              onChange={(initiative) =>
                patch("agent", { ...settings.agent, initiative })
              }
              options={[
                { value: "reactive", label: "Reactiva" },
                { value: "balanced", label: "Equilibrada" },
                { value: "proactive", label: "Proactiva" },
              ]}
            />
            <SegmentedControl
              label="Cómo toma decisiones"
              value={settings.agent.decisions}
              onChange={(decisions) =>
                patch("agent", { ...settings.agent, decisions })
              }
              options={[
                { value: "ask", label: "Preguntar" },
                { value: "suggest", label: "Sugerir" },
                { value: "act", label: "Actuar" },
              ]}
            />
            <Toggle
              label="Pedir confirmación en acciones sensibles"
              checked={settings.agent.confirmations}
              onChange={(confirmations) =>
                patch("agent", { ...settings.agent, confirmations })
              }
            />
          </Section>
        ) : null}

        {section === "memory" ? (
          <Section title="Memoria">
            <Toggle
              label="Memoria personal"
              checked={settings.memory.personal}
              onChange={(personal) => patch("memory", { ...settings.memory, personal })}
            />
            <Toggle
              label="Memoria de proyectos"
              checked={settings.memory.projects}
              onChange={(projectsMem) =>
                patch("memory", { ...settings.memory, projects: projectsMem })
              }
            />
            <div className="memory-list">
              <div className="row between">
                <h3>Recuerdos</h3>
                <button
                  type="button"
                  className="btn btn-danger ghost"
                  onClick={deleteAllMemories}
                  disabled={!memories.length}
                >
                  Eliminar todos
                </button>
              </div>
              {memories.length === 0 ? (
                <p className="muted">No hay recuerdos guardados.</p>
              ) : (
                <ul>
                  {memories.map((m) => (
                    <li key={m.id}>
                      <div>
                        <p>{m.text}</p>
                        <span className="muted">
                          {m.scope === "personal"
                            ? "Personal"
                            : `Proyecto · ${
                                projects.find((p) => p.id === m.projectId)?.name ?? "—"
                              }`}{" "}
                          · {m.createdAt}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => deleteMemory(m.id)}
                      >
                        Eliminar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>
        ) : null}

        {section === "capabilities" ? (
          <Section title="Capacidades">
            <p className="muted lead">
              Sin una capacidad conectada el agente responde igual, con resultados más genéricos.
              El trabajo sigue apareciendo en los proyectos.
            </p>
            <div className="cap-settings">
              <div className="cap-row-setting">
                <div>
                  <strong>Personal</strong>
                  <p className="muted">Núcleo — siempre disponible</p>
                </div>
                <span className="badge">Siempre disponible</span>
              </div>
              {(["research", "office", "trading", "computer"] as const).map((id) => (
                <div key={id} className="cap-row-setting" data-agent={id}>
                  <div>
                    <strong className="cap-name">{labelCap(id)}</strong>
                    <p className="muted">Integración activable</p>
                  </div>
                  <div className="row-actions">
                    <Toggle
                      checked={settings.capabilities[id].enabled}
                      onChange={(enabled) =>
                        patch("capabilities", {
                          ...settings.capabilities,
                          [id]: { enabled },
                        })
                      }
                    />
                    <button type="button" className="btn btn-ghost">
                      Configurar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {section === "connections" ? (
          <Section title="Conexiones">
            {[
              ["Inteligencia / modelos", "Claude · conectado"],
              ["Servicios web", "3 conectados"],
              ["Aplicaciones", "Office · parcial"],
              ["Dispositivos", "1 PC"],
              ["Teléfono", "Emparejado"],
              ["Acceso remoto", "Tailscale · activo"],
            ].map(([label, status]) => (
              <div key={label} className="settings-row">
                <strong>{label}</strong>
                <span className="muted">{status}</span>
              </div>
            ))}
          </Section>
        ) : null}

        {section === "privacy" ? (
          <Section title="Privacidad y datos">
            {[
              "Conversaciones",
              "Memoria",
              "Archivos",
              "Datos almacenados",
            ].map((label) => (
              <div key={label} className="settings-row">
                <strong>{label}</strong>
                <button type="button" className="btn btn-ghost">
                  Administrar
                </button>
              </div>
            ))}
            <div className="settings-row">
              <strong>Exportar datos</strong>
              <button type="button" className="btn btn-ghost">
                Exportar
              </button>
            </div>
            <div className="danger-zone">
              <strong>Eliminar datos</strong>
              <p className="muted">Acción destructiva — requiere confirmación explícita.</p>
              <button type="button" className="btn btn-danger">
                Eliminar datos
              </button>
            </div>
          </Section>
        ) : null}

        {section === "notifications" ? (
          <Section title="Notificaciones">
            {(
              [
                ["pendingTasks", "Tareas pendientes"],
                ["approvals", "Aprobaciones"],
                ["automations", "Automatizaciones"],
                ["agentActivity", "Actividad del agente"],
                ["desktop", "Notificaciones en escritorio"],
                ["mobile", "Notificaciones en móvil"],
              ] as const
            ).map(([key, label]) => (
              <Toggle
                key={key}
                label={label}
                checked={settings.notifications[key]}
                onChange={(v) =>
                  patch("notifications", { ...settings.notifications, [key]: v })
                }
              />
            ))}
          </Section>
        ) : null}

        {section === "appearance" ? (
          <Section title="Apariencia">
            <SegmentedControl
              label="Tema"
              value={settings.appearance.theme}
              onChange={(theme) =>
                patch("appearance", { ...settings.appearance, theme })
              }
              options={[
                { value: "system", label: "Sistema" },
                { value: "light", label: "Claro" },
                { value: "dark", label: "Oscuro" },
              ]}
            />
            <SegmentedControl
              label="Densidad de interfaz"
              value={settings.appearance.density}
              onChange={(density) =>
                patch("appearance", { ...settings.appearance, density })
              }
              options={[
                { value: "comfortable", label: "Cómoda" },
                { value: "compact", label: "Compacta" },
              ]}
            />
            <Toggle
              label="Animaciones"
              checked={settings.appearance.animations}
              onChange={(animations) =>
                patch("appearance", { ...settings.appearance, animations })
              }
            />
            <SegmentedControl
              label="Apariencia del agente"
              value={settings.appearance.agentLook}
              onChange={(agentLook) =>
                patch("appearance", { ...settings.appearance, agentLook })
              }
              options={[
                { value: "minimal", label: "Minimal" },
                { value: "warm", label: "Cálida" },
                { value: "sharp", label: "Nítida" },
              ]}
            />
          </Section>
        ) : null}

        {section === "system" ? (
          <Section title="Sistema">
            <Toggle
              label="Inicio con Windows"
              checked={settings.system.startWithOs}
              onChange={(startWithOs) =>
                patch("system", { ...settings.system, startWithOs })
              }
            />
            <Toggle
              label="Ejecutar en segundo plano"
              checked={settings.system.runInBackground}
              onChange={(runInBackground) =>
                patch("system", { ...settings.system, runInBackground })
              }
            />
            {[
              ["Dispositivos", "Esta PC · Windows"],
              ["Estado del agente", "Listo"],
              ["Diagnóstico", "Sin incidencias"],
              ["Versión", "0.1.0 · prototipo UI"],
              ["Actualizaciones", "Al día"],
            ].map(([label, value]) => (
              <div key={label} className="settings-row">
                <strong>{label}</strong>
                <span className="muted">{value}</span>
              </div>
            ))}
          </Section>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h2>{title}</h2>
      <div className="settings-stack">{children}</div>
    </section>
  );
}

function labelCap(id: string) {
  const map: Record<string, string> = {
    research: "Research",
    office: "Office",
    trading: "Trading",
    computer: "Computer",
  };
  return map[id] ?? id;
}
