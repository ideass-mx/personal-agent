import { useCallback, useEffect, useState, type FormEvent } from "react";
import { resolveHttpBase } from "../../api/http";
import {
  fetchLocalLlmStatus,
  fetchLocalModels,
  installLocalModel,
  type LocalModelsDto,
} from "../../api/local-llm";
import {
  configureSetupLlm,
  connectCloudAuth,
  disconnectCloudAuth,
  disconnectProvider,
  fetchCloudAuthStatus,
  fetchIntelligenceStatus,
  fetchProviderModels,
  selectIntelligenceConnection,
  testProviderConnection,
  updateIntelligenceConnectionModel,
  type CloudAuthStatusDto,
  type IntelligenceConnectionDto,
  type IntelligenceStatusDto,
  type ProviderModelDto,
} from "../../api/setup";
import { useApp } from "../../state/AppContext";
import {
  humanModelLabel,
  modeIcon,
  modeTitle,
  providerCardTitle,
} from "./intelligenceLabels";
import { IntelligenceModelSection } from "./IntelligenceModelSection";
import { ProviderIcon, providerShortBlurb } from "./ProviderIcon";
import {
  PRIMARY_BYOK_PROVIDERS,
  byokModelOptions,
  defaultByokModelId,
} from "./byokProviders";

type Panel =
  | "overview"
  | "choose"
  | "add"
  | "local"
  | "cloud"
  | "byok"
  | "byok_form"
  | "cloud_connecting";

const BYOK_PROVIDERS = PRIMARY_BYOK_PROVIDERS;

function localModelHint(tierLabel: string, installed: boolean): string {
  const base =
    tierLabel === "Equilibrado"
      ? "Recomendado"
      : tierLabel === "Rápido"
        ? "Más rápido"
        : tierLabel === "Ligero"
          ? "Más ligero"
          : tierLabel || "";
  if (installed) return base;
  return base ? `${base} · se descargará` : "Se descargará";
}

function formatContextWindow(tokens?: number): string {
  if (!tokens || tokens <= 0) return "—";
  if (tokens >= 1000) {
    const k = tokens / 1000;
    const label = Number.isInteger(k) ? `${k}` : k.toFixed(1);
    return `${label}k tokens`;
  }
  return `${tokens} tokens`;
}

function defaultModel(provider: string): string {
  return defaultByokModelId(provider);
}

type LibraryRow = {
  key: string;
  kind: "local" | "cloud" | "external";
  title: string;
  statusLine: string;
  provider: string;
  conn?: IntelligenceConnectionDto;
  isDefault: boolean;
};

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
  const [byokReturn, setByokReturn] = useState<"add" | "overview">("add");
  const [byokConfigured, setByokConfigured] = useState(false);
  const [localModels, setLocalModels] = useState<LocalModelsDto | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<ProviderModelDto[]>(
    [],
  );
  const [recommendedModelId, setRecommendedModelId] = useState<string | null>(
    null,
  );
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelUnavailable, setModelUnavailable] = useState(false);


  const base = session ? resolveHttpBase(session) : "";
  const token = session?.token || "";

  const refresh = useCallback(async () => {
    if (!session || !base) return;
    try {
      const [st, cs, loc, models] = await Promise.all([
        fetchIntelligenceStatus(base, token),
        fetchCloudAuthStatus(base, token).catch(() => null),
        fetchLocalLlmStatus(base, token).catch(() => null),
        fetchLocalModels(base, token).catch(() => null),
      ]);
      setSnap(st);
      setCloud(cs);
      setLocalReady(loc?.ready ?? st.local.installed);
      setLocalModels(models);
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
        setByokConfigured(false);
        setByokReturn("overview");
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
      setPanel("add");
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
      const key = apiKey.trim();
      if (!byokConfigured && key.length < 16) {
        setErr("Pega una API key válida.");
        setBusy(false);
        return;
      }
      const wasNew = !byokConfigured;
      const result = await configureSetupLlm(base, token, {
        provider: byokProvider,
        ...(key.length >= 16 ? { credential: key } : {}),
        ...(byokConfigured && modelId.trim()
          ? { modelId: modelId.trim(), modelSelection: "specific" }
          : { modelSelection: "recommended" }),
        baseUrl: baseUrl.trim() || undefined,
      });
      setApiKey("");
      const disc = result.discovery;
      if (disc?.models?.length) {
        setDiscoveredModels(disc.models);
        setRecommendedModelId(disc.recommendedModelId || null);
        const next =
          disc.recommendedModelId ||
          disc.models.find((m) => m.recommended)?.id ||
          disc.models[0]?.id ||
          "";
        if (next) setModelId(next);
        setModelUnavailable(false);
      }
      setOkMsg(
        wasNew
          ? "Proveedor conectado. Personal Agent eligió un modelo disponible."
          : "Modelo actualizado.",
      );
      setByokConfigured(true);
      await refresh();
      if (wasNew) {
        try {
          await loadProviderModels(byokProvider, true);
        } catch {
          /* discovery opcional tras conectar */
        }
      }
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

  async function loadProviderModels(providerId: string, refresh = false) {
    setModelsLoading(true);
    try {
      const models = await fetchProviderModels(base, token, providerId, {
        refresh,
      });
      setDiscoveredModels(models.models || []);
      setRecommendedModelId(models.recommendedModelId);
      if (models.modelId) setModelId(models.modelId);
      setModelUnavailable(models.modelStatus === "unavailable");
    } catch (ex) {
      setDiscoveredModels([]);
      setErr(
        ex instanceof Error
          ? ex.message
          : "No pudimos obtener los modelos disponibles.",
      );
    } finally {
      setModelsLoading(false);
    }
  }

  async function onPickLocalModel(nextModelId: string) {
    const conn = snap?.connections.find((c) => c.provider === "local");
    if (!conn || busy) return;
    if (conn.modelId === nextModelId && (snap?.local.installed || localReady)) {
      return;
    }
    const installed = (localModels?.installed || []).some(
      (i) =>
        i.modelId === nextModelId &&
        (i.state === "ready" ||
          i.state === "active" ||
          i.state === "installed"),
    );
    setBusy(true);
    setErr(null);
    try {
      if (!installed) {
        setOkMsg("Descargando modelo local…");
        await installLocalModel(base, token, { modelId: nextModelId });
      }
      await updateIntelligenceConnectionModel(
        base,
        token,
        conn.id,
        nextModelId,
      );
      await selectIntelligenceConnection(base, token, conn.id);
      setOkMsg(
        installed
          ? "Modelo local actualizado."
          : "Modelo local instalado y listo.",
      );
      await refresh();
    } catch (ex) {
      setErr(
        ex instanceof Error
          ? ex.message
          : "No pudimos cambiar el modelo local.",
      );
      setOkMsg(null);
    } finally {
      setBusy(false);
    }
  }

  async function onInstallLocalSelected() {
    const conn = snap?.connections.find((c) => c.provider === "local");
    const model =
      conn?.modelId ||
      localModels?.active?.modelId ||
      "qwen3-4b";
    await onPickLocalModel(model);
  }

  async function onPickCloudModel(nextModelId: string) {
    const conn = snap?.connections.find(
      (c) => c.provider === "personal-agent-cloud",
    );
    if (!conn || busy) return;
    if (conn.modelId === nextModelId) return;
    setBusy(true);
    setErr(null);
    try {
      await updateIntelligenceConnectionModel(
        base,
        token,
        conn.id,
        nextModelId,
      );
      setOkMsg("Modelo de Cloud actualizado.");
      await refresh();
    } catch (ex) {
      setErr(
        ex instanceof Error
          ? ex.message
          : "No pudimos cambiar el modelo de Cloud.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function onPickByokModel(nextModelId: string) {
    if (!byokConfigured || busy) {
      setModelId(nextModelId);
      return;
    }
    const conn = snap?.connections.find((c) => c.provider === byokProvider);
    if (!conn) {
      setModelId(nextModelId);
      return;
    }
    if (conn.modelId === nextModelId) return;
    setBusy(true);
    setErr(null);
    try {
      await updateIntelligenceConnectionModel(
        base,
        token,
        conn.id,
        nextModelId,
      );
      setModelId(nextModelId);
      setOkMsg("Modelo actualizado.");
      await refresh();
    } catch (ex) {
      setErr(
        ex instanceof Error
          ? ex.message
          : "No pudimos cambiar el modelo.",
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
      if (r.discovery?.models?.length) {
        setDiscoveredModels(r.discovery.models);
        setRecommendedModelId(r.discovery.recommendedModelId || null);
        setModelUnavailable(r.discovery.modelStatus === "unavailable");
      }
      await refresh();
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

  function openLibraryRow(row: LibraryRow) {
    setErr(null);
    setOkMsg(null);
    setAdvancedOpen(false);
    if (row.kind === "local") {
      setPanel("local");
      return;
    }
    if (row.kind === "cloud") {
      setPanel("cloud");
      return;
    }
    setByokProvider(row.provider);
    setModelId(row.conn?.modelId || defaultModel(row.provider));
    setBaseUrl(row.conn?.baseUrl || "");
    setApiKey("");
    setByokConfigured(Boolean(row.conn?.credentialConfigured));
    setByokReturn("overview");
    setPanel("byok_form");
  }

  const active = snap?.active ?? null;
  const selected =
    snap?.connections.find((c) => c.active) || active || null;
  const selectedUsable = (() => {
    if (!selected || !snap) return false;
    if (selected.provider === "local") {
      return Boolean(snap.local.installed || localReady);
    }
    if (selected.provider === "personal-agent-cloud") {
      return Boolean(cloud?.connected);
    }
    return Boolean(selected.credentialConfigured);
  })();
  const external = (snap?.connections || []).filter(
    (c) => c.mode === "external",
  );

  const libraryRows: LibraryRow[] = (() => {
    const rows: LibraryRow[] = [];
    const cloudConn = snap?.connections.find(
      (c) => c.mode === "personal-agent-cloud",
    );
    // Cloud es opcional (como BYOK): solo en la biblioteca si ya está conectado.
    if (cloud?.connected) {
      rows.push({
        key: "cloud",
        kind: "cloud",
        title: "Personal Agent Cloud",
        statusLine: `● Disponible · ${humanModelLabel(
          "personal-agent-cloud",
          cloudConn?.modelId || "claude-sonnet-4-6",
        )}`,
        provider: "personal-agent-cloud",
        conn: cloudConn,
        isDefault: active?.provider === "personal-agent-cloud",
      });
    }
    const localConn = snap?.connections.find((c) => c.mode === "local");
    if (snap?.local.installed || localReady) {
      rows.push({
        key: "local",
        kind: "local",
        title: "Local",
        statusLine: `● Disponible · ${humanModelLabel("local", localConn?.modelId || "qwen3-4b")}`,
        provider: "local",
        conn: localConn,
        isDefault: active?.provider === "local",
      });
    }
    for (const id of BYOK_PROVIDERS) {
      const conn = external.find((c) => c.provider === id);
      if (!conn?.credentialConfigured && !conn?.active) continue;
      rows.push({
        key: id,
        kind: "external",
        title: providerCardTitle(id, conn.displayName),
        statusLine: `● Conectado${
          conn.modelStatus === "unavailable"
            ? " · Modelo no disponible"
            : conn.modelSelection === "recommended" && conn.modelId
              ? ` · ${humanModelLabel(id, conn.modelId)} · Recomendado`
              : conn.modelId
                ? ` · ${humanModelLabel(id, conn.modelId)}`
                : ""
        }`,
        provider: id,
        conn,
        isDefault: active?.provider === id,
      });
    }
    return rows;
  })();

  const addableByok = BYOK_PROVIDERS.filter(
    (id) =>
      !external.some(
        (c) => c.provider === id && (c.credentialConfigured || c.active),
      ),
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
          <p className="lead intel-lead">
            Así piensa tu agente. Tú decides la fuente y, si quieres, el modelo.
          </p>

          <div className="intel-default" aria-live="polite">
            <p className="intel-kicker">Predeterminada</p>
            {selected ? (
              <div className="intel-default-card">
                <div className="intel-default-main">
                  {selected.mode === "external" ? (
                    <ProviderIcon provider={selected.provider} size={40} />
                  ) : (
                    <span className="intel-default-emoji" aria-hidden="true">
                      {modeIcon(selected.mode)}
                    </span>
                  )}
                  <div>
                    <strong>
                      {modeTitle(selected.mode, selected.displayName)}
                    </strong>
                    <p className="muted">
                      {selectedUsable
                        ? humanModelLabel(selected.provider, selected.modelId)
                        : selected.provider === "local"
                          ? "No instalado"
                          : selected.provider === "personal-agent-cloud"
                            ? "No conectado"
                            : "Sin API key"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className={selectedUsable ? "btn" : "btn primary"}
                  disabled={busy}
                  onClick={() => {
                    setErr(null);
                    setOkMsg(null);
                    if (!selectedUsable) {
                      if (selected.provider === "local") {
                        setPanel("local");
                        return;
                      }
                      if (selected.provider === "personal-agent-cloud") {
                        setPanel("cloud");
                        return;
                      }
                      openLibraryRow({
                        key: selected.provider,
                        kind: "external",
                        title: modeTitle(selected.mode, selected.displayName),
                        statusLine: "",
                        provider: selected.provider,
                        conn: selected,
                        isDefault: true,
                      });
                      return;
                    }
                    setPanel("choose");
                  }}
                >
                  {selectedUsable ? "Cambiar" : "Configurar"}
                </button>
              </div>
            ) : (
              <div className="intel-default-card is-empty">
                <div>
                  <strong>No hay inteligencia predeterminada</strong>
                  <p className="muted">
                    Agrega o conecta una y actívala para las conversaciones
                    nuevas.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => setPanel("add")}
                >
                  Agregar
                </button>
              </div>
            )}
            {selected && selectedUsable ? (
              <p className="muted intel-default-hint">
                Tu agente usará esta inteligencia en las conversaciones nuevas.
              </p>
            ) : selected ? (
              <p className="muted intel-default-hint">
                Termina de configurarla para usarla en conversaciones nuevas.
              </p>
            ) : null}
          </div>

          <section className="intel-library" aria-label="Mis inteligencias">
            <h4>Mis inteligencias</h4>
            {libraryRows.length === 0 ? (
              <p className="muted">Aún no hay inteligencias configuradas.</p>
            ) : (
              <ul className="intel-library-list">
                {libraryRows.map((row) => (
                  <li key={row.key}>
                    <button
                      type="button"
                      className="intel-library-row"
                      onClick={() => openLibraryRow(row)}
                    >
                      <span className="intel-library-icon" aria-hidden="true">
                        {row.kind === "external" ? (
                          <ProviderIcon provider={row.provider} size={32} />
                        ) : row.kind === "cloud" ? (
                          "☁️"
                        ) : (
                          "🔒"
                        )}
                      </span>
                      <span className="intel-library-text">
                        <strong>
                          {row.title}
                          {row.isDefault ? (
                            <span className="intel-badge">Predeterminada</span>
                          ) : null}
                        </strong>
                        <span className="muted">{row.statusLine}</span>
                      </span>
                      <span className="intel-library-chevron" aria-hidden="true">
                        ›
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="intel-add-btn"
              onClick={() => {
                setErr(null);
                setOkMsg(null);
                setPanel("add");
              }}
            >
              <span aria-hidden="true">+</span> Agregar inteligencia
            </button>
          </section>
        </>
      ) : null}

      {panel === "choose" ? (
        <div className="intel-detail">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPanel("overview")}
          >
            ← Volver
          </button>
          <h3>Elegir predeterminada</h3>
          <p className="muted">
            Solo aparecen inteligencias ya disponibles o conectadas.
          </p>
          <ul className="intel-library-list">
            {libraryRows
              .filter((r) => {
                if (r.kind === "local") return Boolean(snap?.local.installed);
                if (r.kind === "cloud") return Boolean(cloud?.connected);
                return Boolean(r.conn?.credentialConfigured);
              })
              .map((row) => (
                <li key={row.key}>
                  <button
                    type="button"
                    className="intel-library-row"
                    disabled={busy}
                    onClick={() => {
                      if (row.conn) void activateConnection(row.conn);
                      else if (row.kind === "local")
                        void onChooseMode("local");
                      else if (row.kind === "cloud")
                        void onChooseMode("personal-agent-cloud");
                    }}
                  >
                    <span className="intel-library-text">
                      <strong>{row.title}</strong>
                      <span className="muted">{row.statusLine}</span>
                    </span>
                    {row.isDefault ? (
                      <span className="intel-badge">Actual</span>
                    ) : (
                      <span className="provider-feature-cta">Usar</span>
                    )}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      {panel === "add" ? (
        <div className="intel-detail">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPanel("overview")}
          >
            ← Volver
          </button>
          <h3>Agregar inteligencia</h3>
          <p className="muted">
            Local, Personal Agent Cloud o tu propia cuenta.
          </p>

          <button
            type="button"
            className="intel-mode-card"
            onClick={() => setPanel("local")}
          >
            <strong>🔒 Local</strong>
            <span className="muted">
              {snap?.local.installed
                ? "Ya instalado · gestionar"
                : "Instalar modelo en este equipo"}
            </span>
          </button>
          <button
            type="button"
            className="intel-mode-card"
            onClick={() => setPanel("cloud")}
          >
            <strong>☁️ Personal Agent Cloud</strong>
            <span className="muted">
              {cloud?.connected ? "Ya conectado · gestionar" : "Sin API key"}
            </span>
          </button>

          {addableByok.length > 0 ? (
            <>
              <p className="setup-section-label">Tu cuenta</p>
              <ul className="provider-card-grid">
                {addableByok.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      className="provider-feature-card"
                      data-provider={id}
                      onClick={() => {
                        setByokProvider(id);
                        setModelId(defaultModel(id));
                        setBaseUrl("");
                        setApiKey("");
                        setByokConfigured(false);
                        setByokReturn("add");
                        setPanel("byok_form");
                      }}
                    >
                      <ProviderIcon provider={id} size={40} />
                      <strong>{providerCardTitle(id)}</strong>
                      <span className="muted">{providerShortBlurb(id)}</span>
                      <span className="provider-feature-cta">Conectar</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted">
              Ya tienes conectados OpenAI, Anthropic, xAI, Gemini y OpenRouter.
            </p>
          )}
        </div>
      ) : null}

      {panel === "local" ? (
        <div className="intel-detail">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPanel("overview")}
          >
            ← Inteligencia
          </button>
          <h3>🔒 Local</h3>
          <p className="intel-status-line">
            {snap?.local.installed || localReady
              ? `● Disponible${
                  active?.provider === "local" ? " · Predeterminada" : ""
                }`
              : "○ No instalado"}
          </p>
          <IntelligenceModelSection
            value={
              snap?.connections.find((c) => c.provider === "local")?.modelId ||
              localModels?.active?.modelId ||
              "qwen3-4b"
            }
            disabled={busy}
            onChange={(id) => void onPickLocalModel(id)}
            options={(
              localModels?.catalog?.length
                ? localModels.catalog
                : [
                    {
                      id: "qwen3-4b",
                      displayName: "Qwen3 4B",
                      tierLabel: "Equilibrado",
                    },
                    {
                      id: "qwen3-1.7b",
                      displayName: "Qwen3 1.7B",
                      tierLabel: "Rápido",
                    },
                    {
                      id: "qwen3-0.6b",
                      displayName: "Qwen3 0.6B",
                      tierLabel: "Ligero",
                    },
                  ]
            ).map((m) => {
              const installed = (localModels?.installed || []).some(
                (i) =>
                  i.modelId === m.id &&
                  (i.state === "ready" ||
                    i.state === "active" ||
                    i.state === "installed"),
              );
              return {
                id: m.id,
                label: m.displayName,
                hint: localModelHint(m.tierLabel, installed),
              };
            })}
          />
          {snap?.local.warning ? (
            <p className="intel-warn">{snap.local.warning}</p>
          ) : null}
          <div className="row-actions">
            {snap?.local.installed || localReady ? (
              <>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void onTest("local")}
                >
                  Probar conexión
                </button>
                {active?.provider !== "local" ? (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => {
                      const conn = snap?.connections.find(
                        (c) => c.provider === "local",
                      );
                      if (conn) void activateConnection(conn);
                    }}
                  >
                    Usar Local
                  </button>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => void onInstallLocalSelected()}
              >
                Instalar modelo
              </button>
            )}
          </div>
          <button
            type="button"
            className="intel-advanced-toggle"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            {advancedOpen ? "▾" : "▸"} Avanzado
          </button>
          {advancedOpen ? (
            <div className="intel-advanced">
              <p>
                <span className="muted">ID del modelo</span>
                <br />
                <code>
                  {snap?.connections.find((c) => c.provider === "local")
                    ?.modelId || "qwen3-4b"}
                </code>
              </p>
              <p>
                <span className="muted">Endpoint</span>
                <br />
                en el dispositivo
              </p>
              <p>
                <span className="muted">Tamaño de contexto</span>
                <br />
                {formatContextWindow(
                  (localModels?.catalog || []).find(
                    (m) =>
                      m.id ===
                      (snap?.connections.find((c) => c.provider === "local")
                        ?.modelId ||
                        localModels?.active?.modelId ||
                        "qwen3-4b"),
                  )?.capabilities?.contextWindow,
                )}
              </p>
              <p className="muted" style={{ fontSize: 13 }}>
                Ajustes técnicos. La mayoría de las personas no necesita
                cambiarlos.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {panel === "cloud" ? (
        <div className="intel-detail">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPanel("overview")}
          >
            ← Inteligencia
          </button>
          <h3>☁️ Personal Agent Cloud</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Claude en la nube, sin API key. Misma familia de modelos que
            Anthropic.
          </p>
          {cloud?.connected ? (
            <>
              <p className="intel-status-line">
                ● Disponible
                {active?.provider === "personal-agent-cloud"
                  ? " · Predeterminada"
                  : ""}
              </p>
              <IntelligenceModelSection
                value={
                  snap?.connections.find(
                    (c) => c.provider === "personal-agent-cloud",
                  )?.modelId === "pa-cloud-default"
                    ? "claude-sonnet-4-6"
                    : snap?.connections.find(
                        (c) => c.provider === "personal-agent-cloud",
                      )?.modelId || "claude-sonnet-4-6"
                }
                disabled={busy}
                onChange={(id) => void onPickCloudModel(id)}
                options={byokModelOptions("personal-agent-cloud").map((o) => ({
                  id: o.id,
                  label: o.label,
                  hint: o.hint,
                }))}
              />
              <div className="row-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void onTest("personal-agent-cloud")}
                >
                  Probar conexión
                </button>
                {active?.provider !== "personal-agent-cloud" ? (
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
                ) : null}
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => setConfirmDisconnect("cloud")}
                >
                  Desconectar
                </button>
              </div>
              <button
                type="button"
                className="intel-advanced-toggle"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen((v) => !v)}
              >
                {advancedOpen ? "▾" : "▸"} Avanzado
              </button>
              {advancedOpen ? (
                <div className="intel-advanced">
                  <p>
                    <span className="muted">ID del modelo</span>
                    <br />
                    <code>
                      {snap?.connections.find(
                        (c) => c.provider === "personal-agent-cloud",
                      )?.modelId || "claude-sonnet-4-6"}
                    </code>
                  </p>
                  <p>
                    <span className="muted">Dispositivo</span>
                    <br />
                    {cloud.deviceLabel || "Este equipo"}
                  </p>
                  <p>
                    <span className="muted">Sesión</span>
                    <br />
                    {cloud.sessionActive ? "Activa" : "Inactiva"}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="intel-status-line">○ No conectado</p>
              <IntelligenceModelSection
                value={
                  snap?.connections.find(
                    (c) => c.provider === "personal-agent-cloud",
                  )?.modelId === "pa-cloud-default"
                    ? "claude-sonnet-4-6"
                    : snap?.connections.find(
                        (c) => c.provider === "personal-agent-cloud",
                      )?.modelId || "claude-sonnet-4-6"
                }
                disabled={busy}
                onChange={(id) => void onPickCloudModel(id)}
                options={byokModelOptions("personal-agent-cloud").map((o) => ({
                  id: o.id,
                  label: o.label,
                  hint: o.hint,
                }))}
              />
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
                              setDiscoveredModels([]);
                              setByokConfigured(true);
                              setPanel("byok_form");
                              void loadProviderModels(id);
                            }}
                          >
                            Administrar
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
                            setModelId("");
                            setBaseUrl("");
                            setApiKey("");
                            setDiscoveredModels([]);
                            setRecommendedModelId(null);
                            setModelUnavailable(false);
                            setByokConfigured(false);
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
            onClick={() => setPanel(byokReturn)}
          >
            ← Inteligencia
          </button>
          <h3>{providerCardTitle(byokProvider)}</h3>
          {byokConfigured ? (
            <p className="intel-status-line">
              ● Conectado
              {active?.provider === byokProvider ? " · Predeterminada" : ""}
              {modelUnavailable
                ? " · Modelo ya no disponible — elige otro"
                : ""}
            </p>
          ) : (
            <p className="muted">
              La API key autentica tu cuenta. Después Personal Agent descubrirá
              los modelos disponibles.
            </p>
          )}
          <form onSubmit={(e) => void onSaveByok(e)} className="intel-form">
            {!byokConfigured ? (
              <>
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
                  Se guarda de forma segura en este dispositivo; no la
                  volveremos a mostrar.
                </p>
              </>
            ) : null}
            {byokConfigured ? (
              <>
                {modelsLoading ? (
                  <p className="muted">Actualizando modelos…</p>
                ) : null}
                {modelUnavailable ? (
                  <p className="muted">
                    El modelo seleccionado ya no está disponible. El proveedor
                    sigue conectado.
                    {recommendedModelId
                      ? ` Recomendado ahora: ${recommendedModelId}.`
                      : " Elige otro de la lista."}
                  </p>
                ) : null}
                {modelUnavailable && recommendedModelId ? (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busy}
                    onClick={() => void onPickByokModel(recommendedModelId)}
                  >
                    Usar recomendado
                  </button>
                ) : null}
                {discoveredModels.length > 0 ? (
                  <IntelligenceModelSection
                    value={modelId || recommendedModelId || discoveredModels[0]!.id}
                    disabled={busy || modelsLoading}
                    onChange={(id) => void onPickByokModel(id)}
                    options={discoveredModels.map((m) => ({
                      id: m.id,
                      label: m.name || humanModelLabel(byokProvider, m.id),
                      hint:
                        m.id === recommendedModelId
                          ? "Recomendado"
                          : m.recommended
                            ? "Recomendado"
                            : undefined,
                    }))}
                  />
                ) : (
                  <p className="muted">
                    {modelUnavailable
                      ? "Actualiza la lista y elige otro modelo."
                      : "Aún no hay catálogo de modelos. Prueba la conexión o actualiza."}
                  </p>
                )}
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || modelsLoading}
                    onClick={() => void loadProviderModels(byokProvider, true)}
                  >
                    Actualizar modelos
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void onTest(byokProvider)}
                  >
                    Probar conexión
                  </button>
                  {active?.provider !== byokProvider ? (
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busy}
                      onClick={() => {
                        const conn = snap?.connections.find(
                          (c) => c.provider === byokProvider,
                        );
                        if (conn) void activateConnection(conn);
                      }}
                    >
                      Usar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => setConfirmDisconnect(byokProvider)}
                  >
                    Desconectar
                  </button>
                </div>
              </>
            ) : (
              <button
                type="submit"
                className="btn primary"
                disabled={busy || apiKey.trim().length < 16}
              >
                Conectar
              </button>
            )}
          </form>
          {byokConfigured ? (
            <>
              <button
                type="button"
                className="intel-advanced-toggle"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen((v) => !v)}
              >
                {advancedOpen ? "▾" : "▸"} Avanzado
              </button>
              {advancedOpen ? (
                <div className="intel-advanced">
                  <p>
                    <span className="muted">ID del modelo</span>
                    <br />
                    <code>{modelId}</code>
                  </p>
                  <p>
                    <span className="muted">Proveedor</span>
                    <br />
                    {providerCardTitle(byokProvider)}
                  </p>
                  <p className="muted" style={{ fontSize: 13 }}>
                    Ajustes técnicos. La mayoría de las personas no necesita
                    cambiarlos.
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
