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
  isLlmConfigured,
  isProviderSelectable,
  providerComingSoonLabel,
  stepFromStatus,
  type OnboardingStep,
} from "./setup-flow";
import { providerCardTitle } from "../configuration/intelligenceLabels";
import {
  formatElapsed,
  formatEta,
  formatSpeed,
  installPhaseLead,
  installPhaseTitle,
  installProgressDetail,
  installFailureTitle,
  mapInstallApiPhase,
  shouldShowDeterminateBar,
  type InstallUiState,
} from "../../lib/installProgressUi";

function defaultByokModel(provider: string): string {
  switch (provider) {
    case "openai":
      return "gpt-4.1-mini";
    case "anthropic":
      return "claude-sonnet-4-6";
    case "xai":
      return "grok-4.6";
    case "openrouter":
      return "openai/gpt-4.1-mini";
    case "groq":
      return "llama-3.3-70b-versatile";
    case "openai-compatible":
      return "gpt-4.1-mini";
    default:
      return "gpt-4.1-mini";
  }
}

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
  const [providerModel, setProviderModel] = useState<string>("gpt-4.1-mini");
  const [providerBaseUrl, setProviderBaseUrl] = useState<string>("");
  const [pairingQr, setPairingQr] = useState<string | null>(null);
  const [remoteMsg, setRemoteMsg] = useState<string | null>(null);
  const [recommendation, setRecommendation] =
    useState<LocalRecommendationDto | null>(null);
  const [hwSummary, setHwSummary] = useState<{
    memoryGb: number;
    cpuCores: number;
  } | null>(null);
  const [cloudPhase, setCloudPhase] = useState(0);
  /** Subvista de configuración avanzada: modos vs lista BYOK. */
  const [llmIntroPanel, setLlmIntroPanel] = useState<"modes" | "byok">("modes");
  const [installUi, setInstallUi] = useState<InstallUiState>({
    phase: "preparing",
    displayName: "Qwen3 4B",
  });
  const [showInstallDetails, setShowInstallDetails] = useState(false);

  useEffect(() => {
    if (step !== "cloud_connecting") return;
    setCloudPhase(0);
    const t1 = window.setTimeout(() => setCloudPhase(1), 400);
    const t2 = window.setTimeout(() => setCloudPhase(2), 900);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [step]);

  const base = session ? resolveHttpBase(session) : "";
  const token = session?.token || "";

  useEffect(() => {
    if (step !== "local_installing" || !base) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const s = await fetchLocalLlmStatus(base, token);
        if (cancelled) return;
        const inst = s.install;
        if (inst) {
          setInstallUi({
            phase: mapInstallApiPhase(inst.phase),
            displayName:
              inst.displayName ||
              s.model.displayName ||
              recommendation?.displayName ||
              "Qwen3 4B",
            progress: inst.progress,
            bytesReceived: inst.bytesReceived,
            bytesTotal: inst.bytesTotal,
            bytesPerSecond: inst.bytesPerSecond,
            etaSeconds: inst.etaSeconds,
            elapsedMs: inst.elapsedMs,
            errorMessage: inst.errorMessage,
          });
          return;
        }
        // Fallback legacy: model.state + progress
        if (s.model.state === "validating") {
          setInstallUi((prev) => ({
            ...prev,
            phase: "verifying",
            progress: 100,
            displayName: s.model.displayName || prev.displayName,
          }));
        } else if (s.model.state === "downloading") {
          setInstallUi((prev) => ({
            ...prev,
            phase: "downloading",
            progress: s.model.progress,
            displayName: s.model.displayName || prev.displayName,
          }));
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
  }, [step, base, token, recommendation?.displayName]);

  async function refresh() {
    if (!session) return null;
    const s = await fetchSetupStatus(base, token);
    setStatus(s);
    return s;
  }

  async function loadProviders() {
    if (!session) return;
    try {
      const data = await fetchSetupProviders(base, token);
      setProviders(data.providers);
      if (data.selected) {
        setSelectedProvider(data.selected.provider);
        if (data.selected.modelId) setProviderModel(data.selected.modelId);
        if (data.selected.baseUrl) setProviderBaseUrl(data.selected.baseUrl);
      }
      const first = data.providers.find(isProviderSelectable);
      if (first) setSelectedProvider(first.id);
    } catch {
      setProviders([
        { id: "local", name: "Local", mode: "local", available: true },
        {
          id: "personal-agent-cloud",
          name: "Personal Agent Cloud",
          mode: "personal-agent-cloud",
          available: true,
        },
        { id: "anthropic", name: "Anthropic", available: true },
        { id: "openai", name: "OpenAI", available: true },
        { id: "xai", name: "xAI / Grok", available: true },
        { id: "openrouter", name: "OpenRouter", available: true },
        { id: "groq", name: "Groq", available: true },
        { id: "openai-compatible", name: "Compatible con OpenAI", available: true },
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
        if (
          isLlmConfigured(s) &&
          (s.onboardingCompleted || s.state === "READY" || s.state === "VERIFIED")
        ) {
          setStep("done");
          return;
        }
        if (!isLlmConfigured(s)) {
          // Restaurar gate local: hardware → recomendación (o saltar descarga si ya hay modelo).
          setStep(stepFromStatus(s));
          await enterLocalModelGate();
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

  /** Detecta modelo ya instalado o muestra recomendación Qwen3 4B. */
  async function enterLocalModelGate() {
    setErr(null);
    try {
      const local = await fetchLocalLlmStatus(base, token);
      if (local.ready || local.model.state === "ready") {
        // Modelo + runtime ya disponibles: no volver a descargar.
        try {
          await transitionSetup(base, token, "LLM_REQUIRED", {
            llmProvider: "local",
          });
          await transitionSetup(base, token, "LLM_CONNECTED", {
            llmProvider: "local",
          });
          try {
            await verifySetup(base, token);
          } catch {
            /* verify best-effort */
          }
          const ready = await transitionSetup(base, token, "READY", {
            llmProvider: "local",
          });
          setStatus(ready);
          if (isLlmConfigured(ready)) {
            setStep("optional_android");
            return;
          }
        } catch {
          /* caer a recomendación */
        }
      }
    } catch {
      /* sin status local → recomendación */
    }
    setStep("hardware");
    try {
      const rec = await fetchLocalRecommendation(base, token);
      setRecommendation(rec.recommendation);
      setHwSummary(rec.hardware);
      setStep("local_recommend");
    } catch {
      setStep("local_recommend");
    }
  }

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
      await enterLocalModelGate();
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
    setShowInstallDetails(false);
    setInstallUi({
      phase: "preparing",
      displayName: recommendation?.displayName || "Qwen3 4B",
    });
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
        /* verify es best-effort; install ya validó runtime+health */
      }
      const ready = await transitionSetup(base, token, "READY", {
        llmProvider: "local",
      });
      setStatus(ready);
      if (!isLlmConfigured(ready)) {
        setErr(
          "El modelo se instaló pero el agente aún no está listo. Reintenta o revisa el estado del motor local.",
        );
        setStep("local_recommend");
        return;
      }
      setInstallUi((prev) => ({ ...prev, phase: "complete" }));
      setStep("optional_android");
    } catch (ex) {
      const rich = ex as Error & {
        code?: string;
        title?: string;
        technical?: string;
        modelOk?: boolean;
      };
      const code = rich.code || "";
      const isRuntime =
        code.startsWith("RUNTIME_") ||
        Boolean(rich.title?.includes("motor")) ||
        Boolean(rich.modelOk);
      const msg = rich.message || "No pudimos completar la instalación.";
      setErr(
        isRuntime
          ? "El modelo se descargó correctamente, pero el motor local no pudo iniciarse."
          : msg,
      );
      setInstallUi((prev) => ({
        ...prev,
        phase: "failed",
        errorMessage: isRuntime
          ? "El modelo se descargó correctamente, pero el motor local no pudo iniciarse."
          : msg,
        errorCode: code || null,
        errorTitle: rich.title || (isRuntime ? "No pudimos preparar el motor local" : null),
        errorTechnical: rich.technical || null,
        modelOk: isRuntime || rich.modelOk === true,
      }));
      setStep("local_recommend");
    } finally {
      setBusy(false);
    }
  }

  function onSkipLocalModel() {
    // Configuración avanzada: Local / Cloud / Mi proveedor — no chat sin LLM.
    setLlmIntroPanel("modes");
    setStep("llm_intro");
    void loadProviders();
  }

  async function ensureLlmOrBlockInstall(): Promise<boolean> {
    const s = await refresh();
    if (s && isLlmConfigured(s)) return true;
    setErr(
      "Tu agente necesita terminar la instalación. Instala Qwen3 4B para comenzar a conversar.",
    );
    setStep("local_recommend");
    void enterLocalModelGate();
    return false;
  }

  async function onContinueToLlm() {
    setLlmIntroPanel("modes");
    setStep("llm_intro");
    await loadProviders();
  }

  function onChooseMode(mode: "local" | "personal-agent-cloud" | "external") {
    setErr(null);
    if (mode === "local") {
      onChooseProvider("local");
      return;
    }
    if (mode === "personal-agent-cloud") {
      onChooseProvider("personal-agent-cloud");
      return;
    }
    setLlmIntroPanel("byok");
  }

  function onChooseProvider(id: string) {
    const list =
      providers.length > 0
        ? providers
        : [
            { id: "local", name: "Local", mode: "local" as const, available: true },
            {
              id: "personal-agent-cloud",
              name: "Personal Agent Cloud",
              mode: "personal-agent-cloud" as const,
              available: true,
            },
            { id: "anthropic", name: "Anthropic", available: true },
            { id: "openai", name: "OpenAI", available: true },
            { id: "xai", name: "xAI / Grok", available: true },
            { id: "openrouter", name: "OpenRouter", available: true },
            { id: "groq", name: "Groq", available: true },
            {
              id: "openai-compatible",
              name: "Compatible con OpenAI",
              available: true,
            },
          ];
    const p = list.find((x) => x.id === id);
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
    if (id === "personal-agent-cloud") {
      setStep("cloud_connecting");
      setCloudPhase(0);
      setBusy(true);
      setErr(null);
      void (async () => {
        try {
          setCloudPhase(1);
          const s = await configureSetupLlm(base, token, {
            provider: "personal-agent-cloud",
          });
          setStatus(s);
          setCloudPhase(3);
          setStep("verifying");
          await onVerify();
        } catch (ex) {
          setErr(
            ex instanceof Error
              ? ex.message
              : "No pudimos conectar este dispositivo con Personal Agent Cloud. Vuelve a intentarlo.",
          );
          setLlmIntroPanel("modes");
          setStep("llm_intro");
        } finally {
          setBusy(false);
        }
      })();
      return;
    }
    setProviderModel(defaultByokModel(id));
    if (id !== "openai-compatible") setProviderBaseUrl("");
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
        modelId: providerModel.trim(),
        baseUrl: providerBaseUrl.trim() || undefined,
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
    void (async () => {
      if (!(await ensureLlmOrBlockInstall())) return;
      setStep("optional_remote");
    })();
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
    void (async () => {
      if (!(await ensureLlmOrBlockInstall())) return;
      setStep("done");
    })();
  }

  function onTalk() {
    void (async () => {
      if (!(await ensureLlmOrBlockInstall())) return;
      onCompleted?.();
      setNav("conversation");
    })();
  }

  const providerList =
    providers.length > 0
      ? providers
      : [
          { id: "local", name: "Local", mode: "local", available: true },
          {
            id: "personal-agent-cloud",
            name: "Personal Agent Cloud",
            mode: "personal-agent-cloud",
            available: true,
          },
          { id: "anthropic", name: "Anthropic", available: true },
          { id: "openai", name: "OpenAI", available: true },
          { id: "xai", name: "xAI / Grok", available: true },
          { id: "openrouter", name: "OpenRouter", available: true },
          { id: "groq", name: "Groq", available: true },
          { id: "openai-compatible", name: "Compatible con OpenAI", available: true },
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
              : "Tu agente está listo para instalarse"}
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
                <strong>
                  Recomendamos {rec.displayName}
                  {rec.tierLabel ? ` · ${rec.tierLabel}` : ""}
                </strong>
              </p>
              <p className="muted">
                {rec.reason ||
                  "Es un modelo local que permite utilizar Personal Agent sin configurar una API externa."}
              </p>
            </>
          ) : (
            <p className="muted">
              Recomendamos Qwen3 4B para tu computadora. Es un modelo local que
              permite utilizar Personal Agent sin configurar una API externa.
            </p>
          )}
          {err ? (
            <div style={{ marginTop: 12 }}>
              <p className="error" style={{ fontWeight: 600 }}>
                {installFailureTitle(installUi)}
              </p>
              <p className="error">{err}</p>
              {installUi.modelOk ? (
                <ul className="muted" style={{ marginTop: 8, paddingLeft: 18 }}>
                  <li>Modelo · {installUi.displayName} descargado</li>
                  <li>Modelo · Integridad verificada</li>
                  <li>Motor local · No pudo iniciarse</li>
                </ul>
              ) : null}
              {installUi.errorTechnical ? (
                <p style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => setShowInstallDetails((v) => !v)}
                  >
                    {showInstallDetails ? "Ocultar detalles" : "Ver detalles"}
                  </button>
                </p>
              ) : null}
              {showInstallDetails && installUi.errorTechnical ? (
                <pre
                  className="muted"
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {installUi.errorTechnical}
                  {installUi.errorCode ? `\nCódigo: ${installUi.errorCode}` : ""}
                </pre>
              ) : null}
            </div>
          ) : null}
          <div className="actions" style={{ flexDirection: "column", gap: 8 }}>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => void onInstallLocalModel()}
            >
              {err ? "Reintentar" : "Instalar modelo"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={onSkipLocalModel}
            >
              Configuración avanzada
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "local_installing") {
    const phase = installUi.phase;
    const title = installPhaseTitle(phase);
    const lead = installPhaseLead(phase, installUi.displayName);
    const detail = installProgressDetail(installUi);
    const determinate = shouldShowDeterminateBar(installUi);
    const speed =
      phase === "downloading" && installUi.bytesPerSecond
        ? formatSpeed(installUi.bytesPerSecond)
        : "";
    const eta =
      phase === "downloading" && installUi.etaSeconds
        ? formatEta(installUi.etaSeconds)
        : "";
    const elapsed =
      typeof installUi.elapsedMs === "number" && installUi.elapsedMs > 1500
        ? formatElapsed(installUi.elapsedMs)
        : "";
    return (
      <div className="setup-center">
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <h1>{title}</h1>
          <p className="lead">{lead}</p>
          {phase === "downloading" ? (
            <p className="muted">{installUi.displayName}</p>
          ) : null}
          <div className="setup-progress" aria-live="polite">
            <div className="setup-progress-label">
              <span>{detail || (determinate ? "" : "…")}</span>
              <span className="muted">
                {determinate && typeof installUi.progress === "number"
                  ? `${installUi.progress}%`
                  : elapsed
                    ? elapsed
                    : ""}
              </span>
            </div>
            <div
              className="progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={
                determinate && typeof installUi.progress === "number"
                  ? installUi.progress
                  : undefined
              }
              aria-label="Progreso de instalación"
            >
              <div
                className={
                  determinate ? "progress-fill" : "progress-fill indeterminate"
                }
                style={
                  determinate && typeof installUi.progress === "number"
                    ? { width: `${installUi.progress}%` }
                    : undefined
                }
              />
            </div>
            {speed || eta ? (
              <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                {[speed, eta].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            {elapsed && determinate ? (
              <p className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                Tiempo transcurrido: {elapsed}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (step === "llm_intro") {
    const localP = providerList.find((p) => p.id === "local");
    const cloudP = providerList.find((p) => p.id === "personal-agent-cloud");
    const byokList = providerList.filter(
      (p) =>
        p.id !== "local" &&
        p.id !== "personal-agent-cloud" &&
        (p.mode === "external" || !p.mode),
    );

    if (llmIntroPanel === "byok") {
      return (
        <div className="setup-center">
          <div className="panel" style={{ width: "min(440px, 100%)" }}>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => setLlmIntroPanel("modes")}
            >
              ← Volver
            </button>
            <h1>Conecta tu proveedor de IA</h1>
            <p className="lead">
              Usa tu propia cuenta. La clave se guarda solo en este equipo.
            </p>
            <div className="intel-provider-grid" role="list">
              {byokList.map((p) => {
                const selectable = isProviderSelectable(p);
                const title = providerCardTitle(p.id, p.name);
                return (
                  <div key={p.id} className="intel-provider-card" role="listitem">
                    <strong>{title}</strong>
                    <p className="muted">
                      {p.id === "xai"
                        ? "Modelos de Grok mediante tu propia cuenta."
                        : p.id === "openai-compatible"
                          ? "Conecta un servicio compatible con la API de OpenAI."
                          : "Usa tu propia cuenta."}
                    </p>
                    <p className="muted">
                      {selectable
                        ? "Disponible"
                        : providerComingSoonLabel(p)}
                    </p>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn primary"
                        disabled={!selectable || busy}
                        onClick={() => onChooseProvider(p.id)}
                      >
                        Conectar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {err ? <p className="error">{err}</p> : null}
          </div>
        </div>
      );
    }

    return (
      <div className="setup-center">
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => setStep("local_recommend")}
          >
            ← Volver
          </button>
          <h1>¿Cómo quieres ejecutar la inteligencia?</h1>
          <p className="lead">
            Elige Local, Personal Agent Cloud o tu propio proveedor.
          </p>
          <div className="intel-choose" role="group" aria-label="Modos de inteligencia">
            <button
              type="button"
              className="intel-mode-card"
              disabled={busy || !(localP && isProviderSelectable(localP))}
              onClick={() => onChooseMode("local")}
            >
              <strong>🔒 Local</strong>
              <span className="muted">
                Ejecuta el modelo en este equipo.
                {localP && !isProviderSelectable(localP)
                  ? ` · ${providerComingSoonLabel(localP)}`
                  : ""}
              </span>
            </button>
            <button
              type="button"
              className="intel-mode-card"
              disabled={busy || !(cloudP && isProviderSelectable(cloudP))}
              onClick={() => onChooseMode("personal-agent-cloud")}
            >
              <strong>☁️ Personal Agent Cloud</strong>
              <span className="muted">
                Modelos de Personal Agent · Sin API key.
                {cloudP && !isProviderSelectable(cloudP)
                  ? ` · ${providerComingSoonLabel(cloudP)}`
                  : ""}
              </span>
            </button>
            <button
              type="button"
              className="intel-mode-card"
              disabled={busy}
              onClick={() => onChooseMode("external")}
            >
              <strong>🔑 Mi proveedor</strong>
              <span className="muted">
                OpenAI, Anthropic, xAI / Grok y otros con tu propia cuenta.
              </span>
            </button>
          </div>
          {err ? <p className="error">{err}</p> : null}
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
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => {
              setLlmIntroPanel("byok");
              setStep("llm_intro");
            }}
          >
            ← Volver
          </button>
          <h1>Tu clave de acceso</h1>
          <p className="lead">
            Pégala aquí. La guardamos de forma segura en tu equipo; no la
            volveremos a mostrar.
          </p>
          <form onSubmit={(e) => void onSaveKey(e)}>
            <label className="field">
              Modelo
              <input
                type="text"
                value={providerModel}
                onChange={(e) => setProviderModel(e.target.value)}
                autoComplete="off"
                required
              />
            </label>
            {selectedProvider === "openai-compatible" ? (
              <label className="field">
                Base URL
                <input
                  type="url"
                  value={providerBaseUrl}
                  onChange={(e) => setProviderBaseUrl(e.target.value)}
                  autoComplete="off"
                  required
                />
              </label>
            ) : null}
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

  if (step === "cloud_connecting") {
    return (
      <div className="setup-center">
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <h1>Personal Agent Cloud</h1>
          <p className="lead">Conectando tu dispositivo…</p>
          <ul className="status-list">
            <li>{cloudPhase >= 1 ? "✓" : "…"} Dispositivo identificado</li>
            <li>{cloudPhase >= 2 ? "✓" : "…"} Conexión segura</li>
            <li>{cloudPhase >= 3 ? "✓" : "…"} Sesión creada</li>
          </ul>
          {err ? <p className="error">{err}</p> : null}
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
          <h1>Tu agente está listo</h1>
          <p className="lead">Todo está preparado.</p>
          <div className="actions">
            <button type="button" className="btn primary" onClick={onTalk}>
              Comenzar
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
