import { useEffect, useState, type FormEvent } from "react";
import {
  configureSetupLlm,
  createPairingSession,
  fetchSetupProviders,
  fetchSetupStatus,
  transitionSetup,
  verifySetup,
  type SetupProviderDto,
} from "../../api/setup";
import {
  fetchLocalLlmStatus,
  fetchLocalRecommendation,
  installLocalModel,
  type LocalRecommendationDto,
} from "../../api/local-llm";
import { resolveHttpBase } from "../../api/http";
import { useApp } from "../../state/AppContext";
import type { SetupStatusDto } from "../../types";
import {
  isProviderSelectable,
  providerComingSoonLabel,
  stepFromStatus,
  type OnboardingStep,
} from "./setup-flow";

type DesktopBridge = {
  getTailscaleStatus?: () => Promise<{
    ready?: boolean;
    phase?: string;
    installed?: boolean;
  }>;
  openTailscaleDownload?: () => Promise<unknown>;
  startTailscaleLogin?: () => Promise<unknown>;
  verifySecureNetwork?: () => Promise<{ ok?: boolean; message?: string }>;
};

function desktopBridge(): DesktopBridge | null {
  const w = window as unknown as { desktopApi?: DesktopBridge };
  return w.desktopApi ?? null;
}

export function OnboardingWizard({
  onCompleted,
}: {
  onCompleted?: () => void;
}) {
  const { session, setNav } = useApp();
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [, setStatus] = useState<SetupStatusDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [providers, setProviders] = useState<SetupProviderDto[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("local");
  const [pairingQr, setPairingQr] = useState<string | null>(null);
  const [remoteMsg, setRemoteMsg] = useState<string | null>(null);
  const [recommendation, setRecommendation] =
    useState<LocalRecommendationDto | null>(null);
  const [hwSummary, setHwSummary] = useState<{
    memoryGb: number;
    cpuCores: number;
  } | null>(null);
  const [installProgress, setInstallProgress] = useState<number | null>(null);
  const [installPhase, setInstallPhase] = useState<
    "preparing" | "downloading" | "validating"
  >("preparing");

  const base = session ? resolveHttpBase(session) : "";
  const token = session?.token || "";

  useEffect(() => {
    if (step !== "local_installing" || !base) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const s = await fetchLocalLlmStatus(base, token);
        if (cancelled) return;
        if (s.model.state === "validating") {
          setInstallPhase("validating");
          setInstallProgress(100);
        } else if (s.model.state === "downloading") {
          setInstallPhase("downloading");
          if (typeof s.model.progress === "number") {
            setInstallProgress(s.model.progress);
          }
        }
      } catch {
        /* polling best-effort */
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 400);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [step, base, token]);

  async function refresh() {
    if (!session) return null;
    const s = await fetchSetupStatus(base, token);
    setStatus(s);
    return s;
  }

  async function loadProviders() {
    if (!session) return;
    try {
      const list = await fetchSetupProviders(base, token);
      setProviders(list);
      const first = list.find(isProviderSelectable);
      if (first) setSelectedProvider(first.id);
    } catch {
      setProviders([
        { id: "anthropic", name: "Anthropic", available: true },
        { id: "openai", name: "OpenAI", available: false },
        { id: "google", name: "Google", available: false },
      ]);
    }
  }

  useEffect(() => {
    if (!session) return;
    void (async () => {
      try {
        const s = await refresh();
        if (!s) return;
        await loadProviders();
        // Solo "done" si hay credencial LLM real — no confiar solo en state READY.
        if (s.llmConfigured && (s.onboardingCompleted || s.state === "READY" || s.state === "VERIFIED")) {
          setStep("done");
          return;
        }
        if (!s.llmConfigured) {
          setStep(stepFromStatus(s));
          return;
        }
        if (sessionStorage.getItem("pa_host_bootstrap") === "1") {
          setStep(stepFromStatus(s));
        }
      } catch {
        setErr("No pudimos consultar el estado de tu agente.");
        setStep("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  async function onBegin() {
    setBusy(true);
    setErr(null);
    setStep("preparing");
    try {
      let s = await refresh();
      if (!s) throw new Error("sin estado");
      if (s.state === "AGENT_READY") {
        s = await transitionSetup(base, token, "ONBOARDING");
        s = await transitionSetup(base, token, "LLM_REQUIRED");
      } else if (s.state === "ONBOARDING") {
        s = await transitionSetup(base, token, "LLM_REQUIRED");
      }
      setStatus(s);
      await loadProviders();
      // Camino por defecto: modelo local (sin API key).
      setStep("hardware");
      try {
        const rec = await fetchLocalRecommendation(base, token);
        setRecommendation(rec.recommendation);
        setHwSummary(rec.hardware);
        setStep("local_recommend");
      } catch {
        setStep("local_recommend");
      }
    } catch {
      setErr("Algo falló al preparar. Inténtalo de nuevo.");
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  async function onInstallLocalModel() {
    setBusy(true);
    setErr(null);
    setInstallProgress(null);
    setInstallPhase("preparing");
    setStep("local_installing");
    try {
      await installLocalModel(base, token, {
        modelId: recommendation?.modelId || "qwen3-4b",
      });
      await transitionSetup(base, token, "LLM_REQUIRED", { llmProvider: "local" });
      await transitionSetup(base, token, "LLM_CONNECTED", { llmProvider: "local" });
      try {
        await verifySetup(base, token);
      } catch {
        /* runtime puede no estar; el modelo ya está instalado */
      }
      const ready = await transitionSetup(base, token, "READY", {
        llmProvider: "local",
      });
      setStatus(ready);
      setStep("optional_android");
    } catch (ex) {
      setErr(
        ex instanceof Error
          ? ex.message
          : "No pudimos descargar el modelo. Puedes reintentarlo después.",
      );
      setStep("local_recommend");
    } finally {
      setBusy(false);
      setInstallProgress(null);
      setInstallPhase("preparing");
    }
  }

  function onSkipLocalModel() {
    setStep("llm_intro");
  }

  async function onContinueToLlm() {
    setStep("llm_intro");
    await loadProviders();
  }

  function onChooseProvider(id: string) {
    const p = providers.find((x) => x.id === id);
    if (!p || !isProviderSelectable(p)) return;
    setSelectedProvider(id);
    if (id === "local") {
      setStep("local_recommend");
      void (async () => {
        try {
          const rec = await fetchLocalRecommendation(base, token);
          setRecommendation(rec.recommendation);
          setHwSummary(rec.hardware);
        } catch {
          /* ignore */
        }
      })();
      return;
    }
    setStep("llm_key");
  }

  async function onSaveKey(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const credential = apiKey.trim();
      const s = await configureSetupLlm(base, token, {
        provider: selectedProvider,
        credential,
      });
      setStatus(s);
      setApiKey("");
      setStep("verifying");
      await onVerify();
    } catch (ex) {
      setErr(
        ex instanceof Error
          ? ex.message
          : "No pudimos guardar la configuración.",
      );
      setStep("llm_key");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify() {
    setBusy(true);
    setErr(null);
    setStep("verifying");
    try {
      const s = await verifySetup(base, token);
      setStatus(s);
      const ready = await transitionSetup(base, token, "READY");
      setStatus(ready);
      setStep("optional_android");
    } catch (ex) {
      setErr(
        ex instanceof Error
          ? ex.message
          : "No pudimos conectar con tu proveedor de IA. Revisa la clave e inténtalo de nuevo.",
      );
      setStep("verifying");
    } finally {
      setBusy(false);
    }
  }

  async function onAndroidConnect() {
    setBusy(true);
    setErr(null);
    setPairingQr(null);
    try {
      const created = await createPairingSession(base, token);
      setPairingQr(created.qrDataUrl || null);
      if (!created.qrDataUrl) {
        setErr(
          "Emparejamiento iniciado. Continúa desde la app del teléfono con el mismo agente.",
        );
      }
    } catch (ex) {
      setErr(
        ex instanceof Error
          ? ex.message
          : "No pudimos preparar el emparejamiento.",
      );
    } finally {
      setBusy(false);
    }
  }

  function onSkipAndroid() {
    setPairingQr(null);
    setStep("optional_remote");
  }

  async function onRemoteConfigure() {
    setBusy(true);
    setRemoteMsg(null);
    setErr(null);
    const api = desktopBridge();
    if (!api?.getTailscaleStatus) {
      setRemoteMsg(
        "El acceso remoto se configura desde la aplicación de escritorio cuando esté disponible.",
      );
      setBusy(false);
      return;
    }
    try {
      const status = await api.getTailscaleStatus();
      if (status?.ready) {
        setRemoteMsg("Acceso remoto ya está listo en este equipo.");
        setBusy(false);
        return;
      }
      if (!status?.installed && api.openTailscaleDownload) {
        await api.openTailscaleDownload();
        setRemoteMsg(
          "Te abrimos la descarga. Cuando esté instalado, vuelve e inténtalo de nuevo.",
        );
        setBusy(false);
        return;
      }
      if (api.startTailscaleLogin) {
        await api.startTailscaleLogin();
      }
      if (api.verifySecureNetwork) {
        const v = await api.verifySecureNetwork();
        if (v?.ok) {
          setRemoteMsg("Acceso remoto configurado.");
        } else {
          setRemoteMsg(
            v?.message ||
              "Sigue las instrucciones en pantalla para completar el acceso remoto.",
          );
        }
      } else {
        setRemoteMsg("Sigue las instrucciones para completar el acceso remoto.");
      }
    } catch {
      setErr("No pudimos configurar el acceso remoto ahora. Puedes hacerlo luego.");
    } finally {
      setBusy(false);
    }
  }

  function onSkipRemote() {
    setStep("done");
  }

  function onTalk() {
    onCompleted?.();
    setNav("conversation");
  }

  const providerList =
    providers.length > 0
      ? providers
      : [
          { id: "anthropic", name: "Anthropic", available: true },
          { id: "openai", name: "OpenAI", available: false },
          { id: "google", name: "Google", available: false },
        ];

  if (step === "welcome") {
    return (
      <div className="setup-center">
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <h1>Bienvenido a tu agente personal</h1>
          <p className="lead">
            Voy a ayudarte a preparar tu equipo y dejar tu agente listo para
            trabajar. No necesitas configurar nada técnico ahora.
          </p>
          {err ? <p className="error">{err}</p> : null}
          <div className="actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy || !session}
              onClick={() => void onBegin()}
            >
              Comenzar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "preparing") {
    return (
      <div className="setup-center">
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <h1>Preparando tu agente</h1>
          <ul className="status-list">
            <li>
              <span>Preparando el entorno</span>
              <strong>✓</strong>
            </li>
            <li>
              <span>Instalando componentes</span>
              <strong>✓</strong>
            </li>
            <li>
              <span>Configurando el agente</span>
              <strong>✓</strong>
            </li>
            <li>
              <span>Comprobando el funcionamiento</span>
              <strong>…</strong>
            </li>
          </ul>
          <p className="muted">Tu agente estará listo en unos momentos.</p>
        </div>
      </div>
    );
  }

  if (step === "agent_ready") {
    return (
      <div className="setup-center">
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <h1>¡Tu agente está listo!</h1>
          <p className="lead">
            La instalación terminó. Ahora vamos a conectar la inteligencia que
            utilizará tu agente.
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => void onContinueToLlm()}
            >
              Continuar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "hardware" || step === "local_recommend") {
    const rec = recommendation;
    return (
      <div className="setup-center">
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <h1>
            {step === "hardware"
              ? "Analizando tu computadora…"
              : "Tu computadora está lista"}
          </h1>
          {hwSummary ? (
            <p className="lead">
              {hwSummary.memoryGb} GB de memoria · {hwSummary.cpuCores} núcleos
              de CPU
            </p>
          ) : (
            <p className="lead">Detectando recursos disponibles…</p>
          )}
          {rec ? (
            <>
              <p>
                <strong>Modelo recomendado</strong>
                <br />
                {rec.displayName}
                {rec.tierLabel ? ` · ${rec.tierLabel}` : ""}
              </p>
              <p className="muted">{rec.reason}</p>
            </>
          ) : (
            <p className="muted">Preparando recomendación…</p>
          )}
          {err ? <p className="error">{err}</p> : null}
          <div className="actions" style={{ flexDirection: "column", gap: 8 }}>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void onInstallLocalModel()}
            >
              Instalar modelo
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={onSkipLocalModel}
            >
              Configuración avanzada
            </button>
            <button
              type="button"
              className="linkish"
              disabled={busy}
              onClick={() => setStep("optional_android")}
            >
              Continuar sin modelo
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "local_installing") {
    const hasPct = typeof installProgress === "number";
    const phaseLabel =
      installPhase === "validating"
        ? "Comprobando el archivo…"
        : installPhase === "downloading"
          ? "Descargando…"
          : "Preparando la instalación…";
    return (
      <div className="setup-center">
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <h1>Descargando modelo</h1>
          <p className="lead">
            Esto puede tardar unos minutos la primera vez. No cierres la
            ventana.
          </p>
          <p className="muted">
            {recommendation?.displayName || "Qwen3 4B"}
          </p>
          <div className="setup-progress" aria-live="polite">
            <div className="setup-progress-label">
              <span>{phaseLabel}</span>
              <span className="muted">
                {hasPct ? `${installProgress}%` : "…"}
              </span>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={hasPct ? installProgress : undefined}
              aria-label="Progreso de descarga del modelo"
            >
              <div
                className={
                  hasPct ? "progress-fill" : "progress-fill indeterminate"
                }
                style={hasPct ? { width: `${installProgress}%` } : undefined}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === "llm_intro") {
    return (
      <div className="setup-center">
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <h1>¿Qué IA quieres usar con tu agente?</h1>
          <p className="lead">Elige un servicio disponible.</p>
          <div className="actions" style={{ flexDirection: "column", gap: 8 }}>
            {providerList.map((p) => {
              const selectable = isProviderSelectable(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={selectable ? "btn primary" : "btn"}
                  disabled={!selectable}
                  onClick={() => onChooseProvider(p.id)}
                >
                  {p.name}
                  {!selectable
                    ? ` — ${providerComingSoonLabel(p)}`
                    : " — Disponible"}
                </button>
              );
            })}
          </div>
          <p className="muted" style={{ marginTop: 16 }}>
            ¿No tienes una cuenta?{" "}
            <button
              type="button"
              className="linkish"
              onClick={() =>
                setErr(
                  "Para que tu agente pueda pensar y responder necesitamos conectarlo con un servicio de inteligencia artificial. Anthropic es la opción recomendada por ahora.",
                )
              }
            >
              Ayúdame a elegir
            </button>
          </p>
          {err ? <p className="muted">{err}</p> : null}
        </div>
      </div>
    );
  }

  if (step === "llm_key") {
    const label =
      providerList.find((p) => p.id === selectedProvider)?.name || "IA";
    return (
      <div className="setup-center">
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <h1>Tu clave de acceso</h1>
          <p className="lead">
            Pégala aquí. La guardamos de forma segura en tu equipo; no la
            volveremos a mostrar.
          </p>
          <form onSubmit={(e) => void onSaveKey(e)}>
            <label className="field">
              Clave de {label}
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                required
                minLength={16}
              />
            </label>
            {err ? <p className="error">{err}</p> : null}
            <div className="actions">
              <button
                type="submit"
                className="btn primary"
                disabled={busy || apiKey.trim().length < 16}
              >
                Continuar
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (step === "verifying") {
    return (
      <div className="setup-center">
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <h1>Comprobando</h1>
          <ul className="status-list">
            <li>
              <span>Sistema listo</span>
              <strong>✓</strong>
            </li>
            <li>
              <span>Agente listo</span>
              <strong>✓</strong>
            </li>
            <li>
              <span>Inteligencia conectada</span>
              <strong>{busy ? "…" : err ? "✗" : "✓"}</strong>
            </li>
          </ul>
          {err ? (
            <>
              <p className="error">{err}</p>
              <div className="actions">
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void onVerify()}
                >
                  Intentarlo de nuevo
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setStep("llm_key")}
                >
                  Cambiar clave
                </button>
              </div>
            </>
          ) : (
            <p className="muted">Esto solo toma un momento…</p>
          )}
        </div>
      </div>
    );
  }

  if (step === "optional_android") {
    return (
      <div className="setup-center">
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <h1>¿Quieres llevar tu agente contigo?</h1>
          <p className="lead">
            Puedes conectar tu teléfono ahora o hacerlo más adelante. No es
            necesario para usar el chat.
          </p>
          {pairingQr ? (
            <div style={{ textAlign: "center", margin: "16px 0" }}>
              <img
                src={pairingQr}
                alt="Código para conectar el teléfono"
                width={220}
                height={220}
              />
              <p className="muted">
                Escanea el código con la app del agente en tu teléfono.
              </p>
            </div>
          ) : null}
          {err ? <p className="error">{err}</p> : null}
          <div className="actions" style={{ flexDirection: "column", gap: 8 }}>
            {!pairingQr ? (
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => void onAndroidConnect()}
              >
                Conectar mi teléfono
              </button>
            ) : (
              <button
                type="button"
                className="btn primary"
                onClick={onSkipAndroid}
              >
                Continuar
              </button>
            )}
            <button type="button" className="btn" onClick={onSkipAndroid}>
              Ahora no
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "optional_remote") {
    return (
      <div className="setup-center">
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <h1>¿Quieres acceder a tu agente desde otros dispositivos?</h1>
          <p className="lead">
            Puedes habilitar acceso remoto de forma segura. Es opcional: tu
            agente ya funciona en este equipo.
          </p>
          {remoteMsg ? <p className="muted">{remoteMsg}</p> : null}
          {err ? <p className="error">{err}</p> : null}
          <div className="actions" style={{ flexDirection: "column", gap: 8 }}>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void onRemoteConfigure()}
            >
              Configurar acceso remoto
            </button>
            <button type="button" className="btn" onClick={onSkipRemote}>
              Ahora no
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="setup-center">
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <h1>Tu agente ya está listo para trabajar contigo</h1>
          <p className="lead">
            Puedes empezar a hablar con él ahora. Teléfono y acceso remoto
            siguen disponibles más adelante si los necesitas.
          </p>
          <div className="actions">
            <button type="button" className="btn primary" onClick={onTalk}>
              Hablar con mi agente
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-center">
      <div className="panel" style={{ width: "min(440px, 100%)" }}>
        <h1>No pudimos continuar</h1>
        <p className="error">{err || "Error desconocido"}</p>
        <div className="actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setStep("welcome");
              setErr(null);
            }}
          >
            Intentarlo de nuevo
          </button>
        </div>
      </div>
    </div>
  );
}
