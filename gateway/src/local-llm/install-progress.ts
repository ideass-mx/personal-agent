/**
 * Progreso de instalación del modelo local (PHASE 61.2.2).
 * Estado efímero en proceso Gateway — sin secretos ni URLs con credenciales.
 */
export type ModelInstallPhase =
  | "preparing"
  | "downloading"
  | "verifying"
  | "installing_runtime"
  | "validating_runtime"
  | "starting_model"
  | "complete"
  | "failed";

export type ModelInstallEvent = {
  at: string;
  tMs: number;
  event: string;
  detail?: string;
};

export type ModelInstallSnapshot = {
  phase: ModelInstallPhase;
  displayName: string;
  modelId: string;
  /** 0–100 solo cuando el total es conocido. */
  progress?: number;
  bytesReceived?: number;
  bytesTotal?: number;
  bytesPerSecond?: number;
  /** ETA en segundos; solo si velocidad estable. */
  etaSeconds?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt: string;
  updatedAt: string;
  elapsedMs: number;
  events: ModelInstallEvent[];
  stageDurationsMs: Partial<Record<ModelInstallPhase, number>>;
};

type InternalState = {
  t0: number;
  phaseStartedAt: number;
  phase: ModelInstallPhase;
  displayName: string;
  modelId: string;
  progress?: number;
  bytesReceived?: number;
  bytesTotal?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  startedAt: string;
  events: ModelInstallEvent[];
  stageDurationsMs: Partial<Record<ModelInstallPhase, number>>;
  lastByteSample?: { at: number; bytes: number };
  speedSamples: number[];
};

let current: InternalState | null = null;

export function beginModelInstall(input: {
  modelId: string;
  displayName: string;
}): ModelInstallSnapshot {
  const now = Date.now();
  current = {
    t0: now,
    phaseStartedAt: now,
    phase: "preparing",
    displayName: input.displayName,
    modelId: input.modelId,
    startedAt: new Date(now).toISOString(),
    events: [],
    stageDurationsMs: {},
    speedSamples: [],
  };
  pushEvent("model_install_started");
  return getModelInstallSnapshot()!;
}

export function setModelInstallPhase(
  phase: ModelInstallPhase,
  detail?: string,
): void {
  if (!current) return;
  const now = Date.now();
  if (current.phase !== phase) {
    const spent = now - current.phaseStartedAt;
    current.stageDurationsMs[current.phase] =
      (current.stageDurationsMs[current.phase] ?? 0) + spent;
    current.phase = phase;
    current.phaseStartedAt = now;
    if (phase === "downloading") pushEvent("model_download_started", detail);
    else if (phase === "verifying")
      pushEvent("model_verification_started", detail);
    else if (phase === "installing_runtime")
      pushEvent("runtime_install_started", detail);
    else if (phase === "validating_runtime")
      pushEvent("runtime_validation_started", detail);
    else if (phase === "starting_model")
      pushEvent("model_startup_started", detail);
    else if (phase === "complete") {
      pushEvent("model_install_completed", detail);
      finalizePhase(now);
    } else if (phase === "failed") {
      pushEvent("model_install_failed", detail);
      finalizePhase(now);
    } else if (phase === "preparing") {
      pushEvent("model_install_preparing", detail);
    }
  }
}

export function updateModelDownloadProgress(input: {
  bytesReceived: number;
  bytesTotal?: number;
  ratio?: number;
}): void {
  if (!current) return;
  const now = Date.now();
  current.bytesReceived = input.bytesReceived;
  if (input.bytesTotal && input.bytesTotal > 0) {
    current.bytesTotal = input.bytesTotal;
  }
  if (typeof input.ratio === "number" && Number.isFinite(input.ratio)) {
    current.progress = Math.round(
      Math.min(1, Math.max(0, input.ratio)) * 100,
    );
  } else if (current.bytesTotal && current.bytesTotal > 0) {
    current.progress = Math.round(
      Math.min(1, input.bytesReceived / current.bytesTotal) * 100,
    );
  } else {
    current.progress = undefined;
  }

  const prev = current.lastByteSample;
  if (prev && now > prev.at + 400) {
    const deltaB = input.bytesReceived - prev.bytes;
    const deltaT = (now - prev.at) / 1000;
    if (deltaT > 0 && deltaB >= 0) {
      const bps = deltaB / deltaT;
      current.speedSamples.push(bps);
      if (current.speedSamples.length > 8) current.speedSamples.shift();
      const avg =
        current.speedSamples.reduce((a, b) => a + b, 0) /
        current.speedSamples.length;
      current.bytesPerSecond = Math.round(avg);
      if (
        current.bytesTotal &&
        current.bytesTotal > input.bytesReceived &&
        avg > 50_000
      ) {
        current.etaSeconds = Math.round(
          (current.bytesTotal - input.bytesReceived) / avg,
        );
      } else {
        current.etaSeconds = undefined;
      }
    }
    current.lastByteSample = { at: now, bytes: input.bytesReceived };
  } else if (!prev) {
    current.lastByteSample = { at: now, bytes: input.bytesReceived };
  }

  if (current.events.filter((e) => e.event === "model_download_progress").length < 40) {
    const last = current.events[current.events.length - 1];
    if (
      !last ||
      last.event !== "model_download_progress" ||
      now - current.t0 - last.tMs > 1500
    ) {
      pushEvent("model_download_progress", undefined);
    }
  }
}

export function failModelInstall(
  errorCode: string,
  errorMessage: string,
): void {
  if (!current) return;
  current.errorCode = errorCode;
  current.errorMessage = errorMessage;
  setModelInstallPhase("failed", errorCode);
}

export function completeModelInstall(): void {
  setModelInstallPhase("complete");
}

export function clearModelInstallProgress(): void {
  current = null;
}

export function getModelInstallSnapshot(): ModelInstallSnapshot | null {
  if (!current) return null;
  const now = Date.now();
  return {
    phase: current.phase,
    displayName: current.displayName,
    modelId: current.modelId,
    progress: current.progress,
    bytesReceived: current.bytesReceived,
    bytesTotal: current.bytesTotal,
    bytesPerSecond: current.bytesPerSecond,
    etaSeconds: current.etaSeconds,
    errorCode: current.errorCode ?? null,
    errorMessage: current.errorMessage ?? null,
    startedAt: current.startedAt,
    updatedAt: new Date(now).toISOString(),
    elapsedMs: now - current.t0,
    events: current.events.map((e) => ({ ...e })),
    stageDurationsMs: { ...current.stageDurationsMs },
  };
}

function finalizePhase(now: number): void {
  if (!current) return;
  const spent = now - current.phaseStartedAt;
  current.stageDurationsMs[current.phase] =
    (current.stageDurationsMs[current.phase] ?? 0) + spent;
}

function pushEvent(event: string, detail?: string): void {
  if (!current) return;
  current.events.push({
    at: new Date().toISOString(),
    tMs: Date.now() - current.t0,
    event,
    detail,
  });
}

/** Formato diagnóstico humano (CLI). */
export function formatInstallDurationSummary(
  snap: ModelInstallSnapshot,
): string {
  const lines = [
    "PHASE 61.2.3",
    "Model installation",
    `Preparation:          ${fmt(snap.stageDurationsMs.preparing)}`,
    `Download:             ${fmt(snap.stageDurationsMs.downloading)}`,
    `Verification:         ${fmt(snap.stageDurationsMs.verifying)}`,
    `Runtime preparation:  ${fmt(snap.stageDurationsMs.installing_runtime)}`,
    `Runtime validation:   ${fmt(snap.stageDurationsMs.validating_runtime)}`,
    `Model startup:        ${fmt(snap.stageDurationsMs.starting_model)}`,
    `--------------------------------`,
    `Total:                ${fmt(snap.elapsedMs)}`,
    `Final:                ${snap.phase}`,
  ];
  return lines.join("\n");
}

function fmt(ms: number | undefined): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}
