import { useCallback, useEffect, useState, type FormEvent } from "react";
import { resolveHttpBase } from "../../api/http";
import { fetchLocalLlmStatus } from "../../api/local-llm";
import {
  configureSetupLlm,
  connectCloudAuth,
  disconnectCloudAuth,
  disconnectProvider,
  fetchCloudAuthStatus,
  fetchIntelligenceStatus,
  selectIntelligenceConnection,
  testProviderConnection,
  type CloudAuthStatusDto,
  type IntelligenceConnectionDto,
  type IntelligenceStatusDto,
} from "../../api/setup";
import { useApp } from "../../state/AppContext";
import {
  configStatusLabel,
  humanModelLabel,
  modeIcon,
  modeTitle,
  providerCardTitle,
} from "./intelligenceLabels";
import { ProviderIcon, providerShortBlurb } from "./ProviderIcon";
import {
  PRIMARY_BYOK_PROVIDERS,
  byokModelOptions,
  defaultByokModelId,
} from "./byokProviders";

type Panel =
  | "overview"
  | "choose"
  | "local"
  | "cloud"
  | "byok"
  | "byok_form"
  | "cloud_connecting";

const BYOK_PROVIDERS = PRIMARY_BYOK_PROVIDERS;

function defaultModel(provider: string): string {
  return defaultByokModelId(provider);
}

export function IntelligenceCenter() {
  const { session } = useApp();
  const [snap, setSnap] = useState<IntelligenceStatusDto | null>(null);
  const [cloud, setCloud] = useState<CloudAuthStatusDto | null>(null);
  const [localReady, setLocalReady] = useState<boolean | null>(null);
  const [panel, setPanel] = useState<Panel>("overview");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<
    null | "cloud" | string
  >(null);
  const [byokProvider, setByokProvider] = useState<string>("openai");
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState("gpt-4.1-mini");
  const [baseUrl, setBaseUrl] = useState("");
  const [cloudPhase, setCloudPhase] = useState(0);

  const base = session ? resolveHttpBase(session) : "";
  const token = session?.token || "";

  const refresh = useCallback(async () => {
    if (!session || !base) return;
    try {
      const [st, cs, loc] = await Promise.all([
        fetchIntelligenceStatus(base, token),
        fetchCloudAuthStatus(base, token).catch(() => null),
        fetchLocalLlmStatus(base, token).catch(() => null),
      ]);
      setSnap(st);
      setCloud(cs);
      setLocalReady(loc?.ready ?? st.local.installed);
    } catch {
      setErr("No pudimos cargar el estado de inteligencia.");
    }
  }, [session, base, token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (panel !== "cloud_connecting") return;
    setCloudPhase(0);
    const t1 = window.setTimeout(() => setCloudPhase(1), 350);
    const t2 = window.setTimeout(() => setCloudPhase(2), 800);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [panel]);

  async function activateConnection(conn: IntelligenceConnectionDto) {
    setBusy(true);
    setErr(null);
    setOkMsg(null);
    try {
      if (conn.provider === "personal-agent-cloud") {
        setPanel("cloud_connecting");
        await selectIntelligenceConnection(base, token, conn.id);
        const status = await connectCloudAuth(base, token);
        setCloudPhase(3);
        setCloud(status);
        setOkMsg("Personal Agent Cloud está listo.");
        setPanel("overview");
      } else if (conn.provider === "local") {
        await selectIntelligenceConnection(base, token, conn.id);
        setPanel("overview");
      } else if (!conn.credentialConfigured) {
        setByokProvider(conn.provider);
        setModelId(conn.modelId || defaultModel(conn.provider));
        setBaseUrl(conn.baseUrl || "");
        setApiKey("");
        setPanel("byok_form");
      } else {
        await selectIntelligenceConnection(base, token, conn.id);
        setPanel("overview");
      }
      await refresh();
    } catch (ex) {
      setErr(
        ex instanceof Error
          ? ex.message
          : "No pudimos cambiar la inteligencia.",
      );
      setPanel("overview");
    } finally {
      setBusy(false);
    }
  }

  async function onChooseMode(mode: "local" | "personal-agent-cloud" | "external") {
    if (!snap) return;
    if (mode === "external") {
      setPanel("byok");
      return;
    }
    const conn = snap.connections.find((c) => c.mode === mode);
    if (!conn) {
      setErr("No encontramos esa opción.");
      return;
    }
    if (mode === "local" && !snap.local.installed) {
      setPanel("local");
      return;
    }
    await activateConnection(conn);
  }

  async function onSaveByok(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await configureSetupLlm(base, token, {
        provider: byokProvider,
        credential: apiKey.trim(),
        modelId: modelId.trim(),
        baseUrl: baseUrl.trim() || undefined,
      });
      setApiKey("");
      setOkMsg("Proveedor conectado.");
      setPanel("overview");
      await refresh();
    } catch (ex) {
      setErr(
        ex instanceof Error
          ? ex.message
          : "No pudimos guardar la configuración.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnectConfirmed() {
    if (!confirmDisconnect) return;
    setBusy(true);
    setErr(null);
    try {
      if (confirmDisconnect === "cloud") {
        await disconnectCloudAuth(base, token);
        setOkMsg("Cloud desconectado");
        setCloud({
          connected: false,
          deviceLabel: "Este equipo",
          sessionActive: false,
        });
      } else {
        await disconnectProvider(base, token, confirmDisconnect);
        setOkMsg("Proveedor desconectado");
      }
      setConfirmDisconnect(null);
      setPanel("overview");
      await refresh();
    } catch (ex) {
      setErr(
        ex instanceof Error ? ex.message : "No pudimos desconectar.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onTest(providerId: string) {
    setBusy(true);
    setErr(null);
    setOkMsg(null);
    try {
      const r = await testProviderConnection(base, token, providerId);
      setOkMsg(r.message);
    } catch (ex) {
      setErr(
        ex instanceof Error
          ? ex.message
          : "No pudimos validar la conexión.",
      );
    } finally {
      setBusy(false);
    }
  }

  const active = snap?.active ?? null;
  const external = (snap?.connections || []).filter(
    (c) => c.mode === "external",
  );

  if (!session) {
    return (
      <p className="muted">Inicia sesión para gestionar la inteligencia.</p>
    );
  }

  return (
    <div className="intel-center">
      {err ? (
        <p className="error" role="alert">
          {err}
        </p>
      ) : null}
      {okMsg ? (
        <p className="intel-ok" role="status">
          {okMsg}
        </p>
      ) : null}

      {confirmDisconnect ? (
        <div className="intel-confirm" role="dialog" aria-modal="true">
          <p>
            {confirmDisconnect === "cloud"
              ? "¿Desconectar Personal Agent Cloud?"
              : `¿Desconectar ${confirmDisconnect}?`}
          </p>
          <p className="muted">
            {confirmDisconnect === "cloud"
              ? "Podrás volver a conectarlo cuando quieras."
              : "Se eliminará la clave de este dispositivo. No se borran tus conversaciones."}
          </p>
          <div className="row-actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => setConfirmDisconnect(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void onDisconnectConfirmed()}
            >
              Desconectar
            </button>
          </div>
        </div>
      ) : null}

      {panel === "overview" ? (
        <>
          <div className="intel-active" aria-live="polite">
            <p className="intel-kicker">Inteligencia activa</p>
            {active ? (
              <>
                <h3>
                  {modeIcon(active.mode)} {modeTitle(active.mode, active.displayName)}
                </h3>
                <p className="muted">
                  {active.configStatus === "active" ? "Conectado" : "Seleccionado"}
                </p>
                <p className="muted">
                  Modelo: {humanModelLabel(active.provider, active.modelId)}
                </p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setErr(null);
                    setOkMsg(null);
                    setPanel("choose");
                  }}
                >
                  Cambiar
                </button>
              </>
            ) : (
              <>
                <h3>No hay una inteligencia conectada</h3>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => setPanel("choose")}
                >
                  Configurar inteligencia
                </button>
              </>
            )}
          </div>

          <div className="intel-modes">
            <button
              type="button"
              className="intel-mode-card"
              onClick={() => setPanel("local")}
            >
              <strong>🔒 Local</strong>
              <span className="muted">
                {snap?.local.installed
                  ? "Modelo instalado · Este equipo"
                  : "Aún no instalado"}
              </span>
            </button>
            <button
              type="button"
              className="intel-mode-card"
              onClick={() => setPanel("cloud")}
            >
              <strong>☁️ Personal Agent Cloud</strong>
              <span className="muted">
                {cloud?.connected ? "● Conectado" : "No conectado"}
              </span>
            </button>
            <button
              type="button"
              className="intel-mode-card"
              onClick={() => setPanel("byok")}
            >
              <strong>🔑 Mi proveedor</strong>
              <span className="muted">Tu propia cuenta de IA</span>
            </button>
          </div>

          <section className="intel-connections" aria-label="Tus conexiones">
            <h4>Tus conexiones</h4>
            <ul className="intel-conn-list">
              {(snap?.connections || [])
                .filter(
                  (c) =>
                    c.mode !== "external" ||
                    c.credentialConfigured ||
                    c.active,
                )
                .map((c) => (
                  <li key={c.id}>
                    <span>
                      {modeIcon(c.mode)} {c.displayName}
                    </span>
                    <span className="muted">{configStatusLabel(c.configStatus)}</span>
                  </li>
                ))}
            </ul>
          </section>
        </>
      ) : null}

      {panel === "choose" ? (
        <div className="intel-choose">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPanel("overview")}
          >
            ← Volver
          </button>
          <h3>¿Con qué inteligencia quieres trabajar?</h3>
          <button
            type="button"
            className="intel-mode-card"
            disabled={busy}
            onClick={() => void onChooseMode("local")}
          >
            <strong>🔒 Local</strong>
            <span className="muted">Ejecuta el modelo en tu equipo.</span>
          </button>
          <button
            type="button"
            className="intel-mode-card"
            disabled={busy}
            onClick={() => void onChooseMode("personal-agent-cloud")}
          >
            <strong>☁️ Personal Agent Cloud</strong>
            <span className="muted">
              Modelos proporcionados por Personal Agent.
            </span>
          </button>
          <button
            type="button"
            className="intel-mode-card"
            disabled={busy}
            onClick={() => void onChooseMode("external")}
          >
            <strong>🔑 Mi proveedor</strong>
            <span className="muted">Utiliza tu propia cuenta de IA.</span>
          </button>
        </div>
      ) : null}

      {panel === "local" ? (
        <div className="intel-detail">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPanel("overview")}
          >
            ← Volver
          </button>
          <h3>🔒 Local</h3>
          {snap?.local.installed || localReady ? (
            <>
              <p className="muted">Activo en este equipo</p>
              <ul className="status-list">
                <li>✓ Modelo instalado · {snap?.local.displayName || "Qwen3 4B"}</li>
                <li>✓ Motor local disponible</li>
                <li>✓ Listo para usar</li>
              </ul>
              {snap?.local.warning ? (
                <p className="intel-warn">{snap.local.warning}</p>
              ) : null}
              <div className="row-actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => {
                    const conn = snap?.connections.find((c) => c.provider === "local");
                    if (conn) void activateConnection(conn);
                  }}
                >
                  Usar Local
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void onTest("local")}
                >
                  Probar
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted">Aún no está instalado.</p>
              {snap?.local.warning ? (
                <p className="intel-warn">{snap.local.warning}</p>
              ) : null}
              <button
                type="button"
                className="btn primary"
                onClick={() => setPanel("choose")}
              >
                Elegir otra inteligencia
              </button>
              <p className="muted" style={{ marginTop: 12 }}>
                Para instalar el modelo local, vuelve a la configuración inicial
                del agente (mismo instalador del onboarding).
              </p>
            </>
          )}
        </div>
      ) : null}

      {panel === "cloud" ? (
        <div className="intel-detail">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPanel("overview")}
          >
            ← Volver
          </button>
          <h3>☁️ Personal Agent Cloud</h3>
          {cloud?.connected ? (
            <>
              <p>● Conectado</p>
              <p className="muted">
                Modelos proporcionados por Personal Agent.
              </p>
              <p className="muted">
                Dispositivo: {cloud.deviceLabel || "Este equipo"}
              </p>
              <p className="muted">
                Sesión: {cloud.sessionActive ? "Activa" : "Inactiva"}
              </p>
              <div className="row-actions">
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => {
                    const conn = snap?.connections.find(
                      (c) => c.provider === "personal-agent-cloud",
                    );
                    if (conn) void activateConnection(conn);
                  }}
                >
                  Usar Cloud
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => setConfirmDisconnect("cloud")}
                >
                  Desconectar
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="muted">No conectado</p>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => {
                  const conn = snap?.connections.find(
                    (c) => c.provider === "personal-agent-cloud",
                  );
                  if (conn) void activateConnection(conn);
                }}
              >
                Conectar
              </button>
            </>
          )}
        </div>
      ) : null}

      {panel === "cloud_connecting" ? (
        <div className="intel-detail" aria-live="polite">
          <h3>Personal Agent Cloud</h3>
          <p className="lead">Conectando…</p>
          <ul className="status-list">
            <li>{cloudPhase >= 1 ? "✓" : "…"} Dispositivo identificado</li>
            <li>{cloudPhase >= 2 ? "✓" : "…"} Conexión segura</li>
            <li>{cloudPhase >= 3 ? "✓" : "…"} Sesión creada</li>
          </ul>
        </div>
      ) : null}

      {panel === "byok" ? (
        <div className="intel-detail">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPanel("overview")}
          >
            ← Volver
          </button>
          <h3>Conecta tu proveedor de IA</h3>
          <ul className="provider-card-grid">
            {BYOK_PROVIDERS.map((id) => {
              const conn = external.find((c) => c.provider === id);
              const configured = Boolean(conn?.credentialConfigured);
              const name = providerCardTitle(id, conn?.displayName);
              return (
                <li key={id}>
                  <div
                    className={`provider-feature-card is-static${configured ? " is-configured" : ""}`}
                    data-provider={id}
                  >
                    <ProviderIcon provider={id} size={44} />
                    <strong>{name}</strong>
                    <span className="muted">
                      {configured
                        ? [
                            "Conectado",
                            humanModelLabel(
                              id,
                              conn?.modelId || defaultModel(id),
                            ),
                            conn?.credentialLabel,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : providerShortBlurb(id)}
                    </span>
                    <div className="provider-feature-actions">
                      {configured ? (
                        <>
                          <button
                            type="button"
                            className="btn primary"
                            disabled={busy}
                            onClick={() => {
                              if (conn) void activateConnection(conn);
                            }}
                          >
                            Usar
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={busy}
                            onClick={() => {
                              setByokProvider(id);
                              setModelId(conn?.modelId || defaultModel(id));
                              setBaseUrl(conn?.baseUrl || "");
                              setApiKey("");
                              setPanel("byok_form");
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={busy}
                            onClick={() => void onTest(id)}
                          >
                            Probar
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={busy}
                            onClick={() => setConfirmDisconnect(id)}
                          >
                            Desconectar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn primary"
                          onClick={() => {
                            setByokProvider(id);
                            setModelId(defaultModel(id));
                            setBaseUrl("");
                            setApiKey("");
                            setPanel("byok_form");
                          }}
                        >
                          Conectar
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {panel === "byok_form" ? (
        <div className="intel-detail">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPanel("byok")}
          >
            ← Volver
          </button>
          <h3>{providerCardTitle(byokProvider)}</h3>
          <p className="muted">
            La API key autentica tu cuenta. El modelo es el que usará el agente.
          </p>
          <form onSubmit={(e) => void onSaveByok(e)} className="intel-form">
            <label>
              API key
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
                minLength={16}
                aria-describedby="intel-key-hint"
                placeholder="Pega tu API key"
              />
            </label>
            <p id="intel-key-hint" className="muted">
              Se guarda de forma segura en este dispositivo; no la volveremos a
              mostrar.
            </p>
            <label>
              Modelo
              <select
                value={
                  byokModelOptions(byokProvider).some((o) => o.id === modelId)
                    ? modelId
                    : defaultByokModelId(byokProvider)
                }
                onChange={(e) => setModelId(e.target.value)}
                aria-label="Modelo del agente"
              >
                {byokModelOptions(byokProvider).map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="btn primary"
              disabled={busy || apiKey.trim().length < 16}
            >
              Conectar
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
