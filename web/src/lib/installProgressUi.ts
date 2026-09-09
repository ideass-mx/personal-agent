/**
 * Copy y formato de progreso de instalación local (PHASE 61.2.3).
 * Sin términos técnicos (llama-server, SHA-256, GGUF) en la UI.
 */

export type InstallUiPhase =
  | "preparing"
  | "downloading"
  | "verifying"
  | "installing_runtime"
  | "validating_runtime"
  | "starting_model"
  | "complete"
  | "failed";

export type InstallUiState = {
  phase: InstallUiPhase;
  displayName: string;
  /** 0–100 solo si el total es conocido. */
  progress?: number;
  bytesReceived?: number;
  bytesTotal?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
  elapsedMs?: number;
  errorMessage?: string | null;
  errorCode?: string | null;
  errorTitle?: string | null;
  errorTechnical?: string | null;
  modelOk?: boolean;
};

export function installPhaseTitle(phase: InstallUiPhase): string {
  switch (phase) {
    case "preparing":
      return "Preparando tu agente";
    case "downloading":
      return "Descargando tu modelo";
    case "verifying":
      return "Verificando el modelo";
    case "installing_runtime":
      return "Preparando el motor local";
    case "validating_runtime":
      return "Validando el motor local";
    case "starting_model":
      return "Iniciando el modelo";
    case "complete":
      return "Tu agente está listo";
    case "failed":
      return "No pudimos completar la instalación";
  }
}

export function installPhaseLead(
  phase: InstallUiPhase,
  displayName: string,
): string {
  switch (phase) {
    case "preparing":
      return "Comprobando los componentes necesarios…";
    case "downloading":
      return displayName;
    case "verifying":
      return "Estamos comprobando que la descarga sea íntegra…";
    case "installing_runtime":
      return "Configurando el motor que ejecutará tu modelo…";
    case "validating_runtime":
      return "Comprobando que el motor pueda ejecutarse en este equipo…";
    case "starting_model":
      return "Cargando el modelo y comprobando que responda…";
    case "complete":
      return `${displayName} está instalado.`;
    case "failed":
      return "Puedes intentarlo de nuevo.";
  }
}

export function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 0.1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "";
  const mb = bytesPerSecond / (1024 * 1024);
  if (mb >= 0.1) return `${mb.toFixed(1)} MB/s`;
  return `${(bytesPerSecond / 1024).toFixed(0)} KB/s`;
}

export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m <= 0) return `${s} s`;
  return `${m} min ${s.toString().padStart(2, "0")} s`;
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m <= 0) return `Aprox. ${s} s restantes`;
  return `Aprox. ${m} min ${s.toString().padStart(2, "0")} s restantes`;
}

/** Detalle bajo la barra: GB / % o solo bytes si no hay total. */
export function installProgressDetail(state: InstallUiState): string {
  const recv = state.bytesReceived;
  const total = state.bytesTotal;
  if (typeof recv === "number" && typeof total === "number" && total > 0) {
    const pct =
      typeof state.progress === "number"
        ? state.progress
        : Math.round((recv / total) * 100);
    return `${formatBytesShort(recv)} de ${formatBytesShort(total)} · ${pct}%`;
  }
  if (typeof recv === "number" && recv > 0) {
    return `${formatBytesShort(recv)} descargados`;
  }
  // Sin Content-Length: no inventar porcentaje.
  return "";
}

export function shouldShowDeterminateBar(state: InstallUiState): boolean {
  return (
    state.phase === "downloading" &&
    typeof state.progress === "number" &&
    (typeof state.bytesTotal === "number" ? state.bytesTotal > 0 : true)
  );
}

export function mapInstallApiPhase(phase: string | undefined): InstallUiPhase {
  switch (phase) {
    case "preparing":
    case "downloading":
    case "verifying":
    case "installing_runtime":
    case "validating_runtime":
    case "starting_model":
    case "complete":
    case "failed":
      return phase;
    case "validating":
      return "verifying";
    default:
      return "preparing";
  }
}

export function installFailureTitle(
  state: Pick<InstallUiState, "errorTitle" | "errorCode" | "phase">,
): string {
  if (state.errorTitle) return state.errorTitle;
  if (state.errorCode?.startsWith("RUNTIME_")) {
    return "No pudimos preparar el motor local";
  }
  return installPhaseTitle("failed");
}
