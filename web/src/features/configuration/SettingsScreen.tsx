import { useEffect, useState, type ReactNode } from "react";
import { SegmentedControl, Toggle } from "../../components/controls";
import { MVP_CAPABILITIES } from "../../lib/capabilities";
import { useApp } from "../../state/AppContext";
import type { SettingsSectionId } from "../../types";
import { TrustedDevicesPanel } from "./TrustedDevicesPanel";
import { resolveHttpBase } from "../../api/http";
import { fetchLocalLlmStatus } from "../../api/local-llm";

type NavItem =
  | { kind: "item"; id: SettingsSectionId; label: string }
  | { kind: "sep" };

const NAV: NavItem[] = [
  { kind: "item", id: "profile", label: "Perfil" },
  { kind: "item", id: "my-agent", label: "Mi agente" },
  { kind: "item", id: "memory", label: "Memoria" },
  { kind: "item", id: "intelligence", label: "Inteligencia" },
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

/** Preferencias solo de UI (en memoria). No hay API de settings todavía. */
type UiPrefs = {
  agentName: string;
  personality: string;
  style: "concise" | "balanced" | "detailed";
  detailLevel: "low" | "medium" | "high";
  initiative: "reactive" | "balanced" | "proactive";
  decisions: "ask" | "suggest" | "act";
  confirmations: boolean;
  theme: "system" | "light" | "dark";
  density: "comfortable" | "compact";
  animations: boolean;
  notifTasks: boolean;
  notifApprovals: boolean;
  notifDesktop: boolean;
};

const DEFAULT_PREFS: UiPrefs = {
  agentName: "Agente",
  personality: "Calmo, preciso, con iniciativa mesurada.",
  style: "balanced",
  detailLevel: "medium",
  initiative: "balanced",
  decisions: "suggest",
  confirmations: true,
  theme: "system",
  density: "comfortable",
  animations: true,
  notifTasks: true,
  notifApprovals: true,
  notifDesktop: true,
};

export function SettingsScreen() {
  const {
    settingsSection,
    setSettingsSection,
    session,
    health,
    wsStatus,
    setNav,
    userDisplayName,
  } = useApp();
  const [prefs, setPrefs] = useState<UiPrefs>(DEFAULT_PREFS);
  const section = settingsSection;
  const [localStatus, setLocalStatus] = useState<{
    ready: boolean;
    displayName: string;
    state: string;
  } | null>(null);

  useEffect(() => {
    if (section !== "intelligence" || !session) return;
    const base = resolveHttpBase(session);
    void (async () => {
      try {
        const st = await fetchLocalLlmStatus(base, session.token);
        setLocalStatus({
          ready: st.ready,
          displayName: st.model.displayName,
          state: st.model.state,
        });
      } catch {
        setLocalStatus(null);
      }
    })();
  }, [section, session]);

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
                onClick={() => setSettingsSection(item.id)}
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
            <p className="muted lead">
              Tu nombre se usa en la interfaz. Los identificadores técnicos no se muestran aquí.
            </p>
            <div className="settings-row">
              <strong>Nombre</strong>
              <span>{userDisplayName || "—"}</span>
            </div>
          </Section>
        ) : null}

        {section === "my-agent" ? (
          <Section title="Mi agente">
            <p className="muted lead">
              Preferencias locales de prototipo — aún no se persisten en el Gateway.
            </p>
            <label className="field">
              <span className="field-label">Nombre del agente</span>
              <input
                value={prefs.agentName}
                onChange={(e) => setPrefs({ ...prefs, agentName: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">Personalidad</span>
              <textarea
                rows={3}
                value={prefs.personality}
                onChange={(e) => setPrefs({ ...prefs, personality: e.target.value })}
              />
            </label>
            <SegmentedControl
              label="Estilo de comunicación"
              value={prefs.style}
              onChange={(style) => setPrefs({ ...prefs, style })}
              options={[
                { value: "concise", label: "Conciso" },
                { value: "balanced", label: "Equilibrado" },
                { value: "detailed", label: "Detallado" },
              ]}
            />
            <SegmentedControl
              label="Nivel de detalle"
              value={prefs.detailLevel}
              onChange={(detailLevel) => setPrefs({ ...prefs, detailLevel })}
              options={[
                { value: "low", label: "Bajo" },
                { value: "medium", label: "Medio" },
                { value: "high", label: "Alto" },
              ]}
            />
            <SegmentedControl
              label="Iniciativa"
              value={prefs.initiative}
              onChange={(initiative) => setPrefs({ ...prefs, initiative })}
              options={[
                { value: "reactive", label: "Reactiva" },
                { value: "balanced", label: "Equilibrada" },
                { value: "proactive", label: "Proactiva" },
              ]}
            />
            <SegmentedControl
              label="Cómo toma decisiones"
              value={prefs.decisions}
              onChange={(decisions) => setPrefs({ ...prefs, decisions })}
              options={[
                { value: "ask", label: "Preguntar" },
                { value: "suggest", label: "Sugerir" },
                { value: "act", label: "Actuar" },
              ]}
            />
            <Toggle
              label="Pedir confirmación en acciones sensibles"
              checked={prefs.confirmations}
              onChange={(confirmations) => setPrefs({ ...prefs, confirmations })}
            />
          </Section>
        ) : null}

        {section === "memory" ? (
          <Section title="Memoria">
            <div className="placeholder-card">
              <strong>Sin API de memoria de usuario</strong>
              <p className="muted">
                El Gateway persiste turnos de conversación en SQLite; no hay todavía preferencias
                ni «recuerdos» administrables desde la UI.
              </p>
            </div>
          </Section>
        ) : null}

        {section === "intelligence" ? (
          <Section title="Inteligencia">
            <p className="muted lead">
              Modelo local por defecto. Los proveedores en la nube son opcionales.
            </p>
            <div className="settings-row">
              <strong>Modelo</strong>
              <span>{localStatus?.displayName || "Qwen3 4B"}</span>
            </div>
            <div className="settings-row">
              <strong>Estado</strong>
              <span>
                {localStatus?.ready
                  ? "Listo"
                  : localStatus?.state === "not_installed"
                    ? "No instalado"
                    : "Preparando…"}
              </span>
            </div>
            <p className="muted" style={{ marginTop: 12 }}>
              Motor de inferencia local administrado por Personal Agent (sin
              Ollama ni claves en la nube). Los proveedores externos son
              opcionales y no sustituyen el modelo local automáticamente.
            </p>
          </Section>
        ) : null}

        {section === "capabilities" ? (
          <Section title="Capacidades">
            <p className="muted lead">
              Personal es el núcleo. Las demás capacidades se activarán con integraciones; hoy el
              Node reporta tools vía <code>/health</code>.
            </p>
            <div className="cap-row-setting">
              <div>
                <strong>Personal</strong>
                <p className="muted">Núcleo — siempre disponible</p>
              </div>
              <span className="badge">Siempre disponible</span>
            </div>
            {MVP_CAPABILITIES.map((cap) => {
              const live = health?.agentTools?.includes(cap.toolName);
              return (
                <div key={cap.toolName} className="cap-row-setting">
                  <div>
                    <strong>{cap.label}</strong>
                    <p className="muted">
                      {cap.category} · {cap.toolName}
                    </p>
                  </div>
                  <span className={`badge ${live ? "" : "warn"}`}>
                    {live ? "Disponible en Node" : "No listada"}
                  </span>
                </div>
              );
            })}
          </Section>
        ) : null}

        {section === "connections" ? (
          <Section title="Conexiones">
            <div className="settings-row">
              <strong>WebSocket</strong>
              <span className="muted">{wsStatus}</span>
            </div>
            <div className="settings-row">
              <strong>Gateway</strong>
              <span className="muted">
                {health?.ok ? "OK" : "No disponible"}
                {health?.name ? ` · ${health.name}` : ""}
              </span>
            </div>
            <div className="settings-row">
              <strong>Node</strong>
              <span className="muted">
                {health?.agentReady ? "Listo" : "No listo"}
                {health?.nodeStatus ? ` · ${health.nodeStatus}` : ""}
              </span>
            </div>
            <div className="settings-row">
              <strong>Host</strong>
              <span className="muted mono">{session?.httpBase || "(same origin)"}</span>
            </div>

            <TrustedDevicesPanel
              httpBase={session?.httpBase || ""}
              token={session?.token || ""}
              currentDeviceId={session?.deviceId}
            />

            <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
              El emparejamiento de un teléfono nuevo se inicia desde el host
              (Desktop). Revocar un dispositivo cierra sus sesiones de inmediato.
            </p>
          </Section>
        ) : null}

        {section === "privacy" ? (
          <Section title="Privacidad y datos">
            <div className="placeholder-card">
              <strong>Exportar / eliminar datos</strong>
              <p className="muted">
                Requiere contratos de privacidad en el Gateway. No hay endpoints de borrado
                masivo todavía.
              </p>
            </div>
          </Section>
        ) : null}

        {section === "notifications" ? (
          <Section title="Notificaciones">
            <p className="muted lead">Preferencias locales (no persistidas).</p>
            <Toggle
              label="Tareas pendientes"
              checked={prefs.notifTasks}
              onChange={(notifTasks) => setPrefs({ ...prefs, notifTasks })}
            />
            <Toggle
              label="Aprobaciones"
              checked={prefs.notifApprovals}
              onChange={(notifApprovals) => setPrefs({ ...prefs, notifApprovals })}
            />
            <Toggle
              label="Notificaciones en escritorio"
              checked={prefs.notifDesktop}
              onChange={(notifDesktop) => setPrefs({ ...prefs, notifDesktop })}
            />
          </Section>
        ) : null}

        {section === "appearance" ? (
          <Section title="Apariencia">
            <SegmentedControl
              label="Tema"
              value={prefs.theme}
              onChange={(theme) => setPrefs({ ...prefs, theme })}
              options={[
                { value: "system", label: "Sistema" },
                { value: "light", label: "Claro" },
                { value: "dark", label: "Oscuro" },
              ]}
            />
            <SegmentedControl
              label="Densidad"
              value={prefs.density}
              onChange={(density) => setPrefs({ ...prefs, density })}
              options={[
                { value: "comfortable", label: "Cómoda" },
                { value: "compact", label: "Compacta" },
              ]}
            />
            <Toggle
              label="Animaciones"
              checked={prefs.animations}
              onChange={(animations) => setPrefs({ ...prefs, animations })}
            />
            <p className="muted" style={{ fontSize: 13 }}>
              El tema claro del prototipo es el activo. Oscuro/sistema se aplicarán cuando haya
              tokens dark.
            </p>
          </Section>
        ) : null}

        {section === "system" ? (
          <Section title="Sistema">
            <div className="settings-row">
              <strong>Versión Gateway</strong>
              <span className="muted">
                {health?.version || "—"}
                {health?.build ? ` · ${health.build}` : ""}
              </span>
            </div>
            <div className="settings-row">
              <strong>Plataforma</strong>
              <span className="muted">
                {[health?.platform, health?.architecture].filter(Boolean).join(" · ") || "—"}
              </span>
            </div>
            <div className="settings-row">
              <strong>Diagnóstico</strong>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setNav("diagnostics")}
              >
                Abrir panel completo
              </button>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              El panel de diagnóstico usa <code>/v1/diagnostics/recent</code> y el estado de
              health/WS en vivo.
            </p>
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
