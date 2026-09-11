import { useEffect, useState, type FormEvent } from "react";
import {
  configureSetupLlm,
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
  ProviderIcon,
  providerShortBlurb,
} from "../configuration/ProviderIcon";
import {
  byokModelOptions,
  defaultByokModelId,
  isPrimaryByokProvider,
} from "../configuration/byokProviders";
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

export function OnboardingWizard({
  onCompleted,
  /** Cuando App ya pasó welcome/session, entrar directo a elegir inteligencia. */
  initialStep = "llm_intro",
}: {
  onCompleted?: () => void;
  initialStep?: OnboardingStep;
}) {
  const { session, setNav } = useApp();
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const [, setStatus] = useState<SetupStatusDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [providers, setProviders] = useState<SetupProviderDto[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("local");
  const [providerModel, setProviderModel] = useState<string>("gpt-4.1-mini");
  const [providerBaseUrl, setProviderBaseUrl] = useState<string>("");
  const [recommendation, setRecommendation] =
    useState<LocalRecommendationDto | null>(null);
  const [hwSummary, setHwSummary] = useState<{
    memoryGb: number;
    cpuCores: number;
  } | null>(null);
  const [cloudPhase, setCloudPhase] = useState(0);
  /** Subvista: modos Local/Cloud, o panel Cloud (PA Cloud + otras). */
  const [llmIntroPanel, setLlmIntroPanel] = useState<"modes" | "cloud">("modes");
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
        { id: "gemini", name: "Gemini", available: true },
        { id: "openrouter", name: "OpenRouter", available: true },
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
          // Elegir modo de inteligencia (Local / Cloud / BYOK).
          setLlmIntroPanel("modes");
          setStep(stepFromStatus(s));
          return;
        }
        if (sessionStorage.getItem("pa_host_bootstrap") === "1" || localStorage.getItem("pa_host_bootstrap") === "1") {
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
            setStep("done");
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
      // Elegir cómo ejecutar la inteligencia (no forzar Local).
      setLlmIntroPanel("modes");
      setStep("llm_intro");
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
      setStep("done");
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
    // Volver a elegir Local / Cloud.
    setLlmIntroPanel("modes");
    setStep("llm_intro");
    void loadProviders();
  }

  async function ensureLlmOrBlockInstall(): Promise<boolean> {
    const s = await refresh();
    if (s && isLlmConfigured(s)) return true;
    setErr(
      "Tu agente necesita una inteligencia conectada. Elige Local o Cloud.",
    );
    setLlmIntroPanel("modes");
    setStep("llm_intro");
    void loadProviders();
    return false;
  }

  async function onContinueToLlm() {
    setLlmIntroPanel("modes");
    setStep("llm_intro");
    await loadProviders();
  }

  function onChooseMode(mode: "local" | "cloud") {
    setErr(null);
    if (mode === "local") {
      onChooseProvider("local");
      return;
    }
    setLlmIntroPanel("cloud");
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
            { id: "gemini", name: "Gemini", available: true },
            { id: "openrouter", name: "OpenRouter", available: true },
          ];
    const p = list.find((x) => x.id === id);
    if (!p || !isProviderSelectable(p)) return;
    setSelectedProvider(id);
    if (id === "local") {
      void enterLocalModelGate();
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
    setProviderModel(defaultByokModelId(id));
    setProviderBaseUrl("");
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
      setStep("done");
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
          { id: "gemini", name: "Gemini", available: true },
          { id: "openrouter", name: "OpenRouter", available: true },
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
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={onSkipLocalModel}
          >
            ← Volver
          </button>
          <h1>
            {step === "hardware"
              ? "Analizando tu computadora…"
              : "Instalar modelo local"}
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
              disabled={busy || step === "hardware"}
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
              Elegir otra inteligencia
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
        isPrimaryByokProvider(p.id) &&
        (p.mode === "external" || !p.mode),
    );

    if (llmIntroPanel === "cloud") {
      const cloudSelectable = Boolean(
        cloudP && isProviderSelectable(cloudP),
      );
      return (
        <div className="setup-center">
          <div
            className="panel setup-panel-compact"
            style={{ width: "min(460px, 100%)" }}
          >
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => setLlmIntroPanel("modes")}
            >
              ← Volver
            </button>
            <h1 className="setup-h-compact">Cloud</h1>
            <p className="lead setup-lead-compact">
              Elige Personal Agent Cloud o tu propia cuenta.
            </p>

            <ul className="provider-card-grid" role="list">
              <li role="listitem">
                <button
                  type="button"
                  className="provider-feature-card provider-feature-card--featured"
                  disabled={busy || !cloudSelectable}
                  onClick={() => onChooseProvider("personal-agent-cloud")}
                  aria-label="Conectar Personal Agent Cloud"
                  data-provider="personal-agent-cloud"
                >
                  <span
                    className="provider-icon provider-icon--cloud"
                    aria-hidden="true"
                  >
                    ☁️
                  </span>
                  <strong>Personal Agent Cloud</strong>
                  <span className="muted">
                    {cloudSelectable
                      ? "Nuestra nube · Sin API key"
                      : cloudP
                        ? providerComingSoonLabel(cloudP)
                        : "Próximamente"}
                  </span>
                  <span className="provider-feature-cta">
                    {cloudSelectable ? "Conectar" : "Pronto"}
                  </span>
                </button>
              </li>
              {byokList.map((p) => {
                const selectable = isProviderSelectable(p);
                const title = providerCardTitle(p.id, p.name);
                return (
                  <li key={p.id} role="listitem">
                    <button
                      type="button"
                      className="provider-feature-card"
                      disabled={!selectable || busy}
                      onClick={() => onChooseProvider(p.id)}
                      aria-label={`Conectar ${title}`}
                      data-provider={p.id}
                    >
                      <ProviderIcon provider={p.id} size={44} />
                      <strong>{title}</strong>
                      <span className="muted">
                        {selectable
                          ? providerShortBlurb(p.id)
                          : providerComingSoonLabel(p)}
                      </span>
                      <span className="provider-feature-cta">
                        {selectable ? "Conectar" : "Pronto"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
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
            onClick={() => setStep("welcome")}
          >
            ← Volver
          </button>
          <h1>¿Cómo quieres que piense tu agente?</h1>
          <p className="lead">
            Puedes cambiarlo cuando quieras. No tienes que decidirlo todo ahora.
          </p>
          <div
            className="intel-choose"
            role="group"
            aria-label="Modos de inteligencia"
          >
            <button
              type="button"
              className="intel-mode-card"
              disabled={busy || !(localP && isProviderSelectable(localP))}
              onClick={() => onChooseMode("local")}
            >
              <strong>🔒 Local</strong>
              <span className="muted">
                Tu agente piensa en tu equipo. Privado, sin depender de la nube.
                {localP && !isProviderSelectable(localP)
                  ? ` · ${providerComingSoonLabel(localP)}`
                  : ""}
              </span>
            </button>
            <button
              type="button"
              className="intel-mode-card"
              disabled={busy}
              onClick={() => onChooseMode("cloud")}
            >
              <strong>☁️ Cloud</strong>
              <span className="muted">
                Tu agente piensa en la nube. Personal Agent Cloud u otra cuenta.
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
    const recommended =
      byokModelOptions(selectedProvider)[0]?.label.replace(
        /\s*\(recomendado\)\s*$/i,
        "",
      ) || "el modelo recomendado";
    return (
      <div className="setup-center">
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => {
              setLlmIntroPanel("cloud");
              setStep("llm_intro");
            }}
          >
            ← Volver
          </button>
          <h1>Tu clave de acceso</h1>
          <p className="lead">
            Pega tu clave de {label}. La guardamos solo en este equipo.
          </p>
          <form
            onSubmit={(e) => {
              setProviderModel(defaultByokModelId(selectedProvider));
              void onSaveKey(e);
            }}
          >
            <label className="field">
              Clave de {label}
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                required
                minLength={16}
                placeholder="Pega tu API key"
              />
            </label>
            <p className="muted" style={{ fontSize: 13 }}>
              Usaremos {recommended}. Puedes cambiar el modelo después en
              Configuración → Inteligencia.
            </p>
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

  if (step === "done") {
    return (
      <div className="setup-center">
        <div className="panel" style={{ width: "min(440px, 100%)" }}>
          <h1>Tu agente está listo</h1>
          <p className="lead">
            Todo está preparado en este equipo. Si más adelante quieres vincular
            el teléfono u otro dispositivo, hazlo en Configuración → Conexiones.
          </p>
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
