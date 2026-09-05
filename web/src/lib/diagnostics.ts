import type { DiagnosticInfo, HealthSnapshot } from "../types";

export function friendlyChatError(): string {
  return "No pude generar la respuesta. Inténtalo nuevamente.";
}

export function formatDiagnosticDetails(diag: DiagnosticInfo): string {
  const lines = [
    "Detalles técnicos",
    `Código: ${diag.errorCode}`,
    `Etapa: ${diag.stage}`,
    `Componente: ${diag.component}`,
    diag.provider ? `Proveedor: ${diag.provider}` : "",
    typeof diag.httpStatus === "number" ? `HTTP: ${diag.httpStatus}` : "",
    `Diagnóstico: ${diag.diagnosticId}`,
    `Hora: ${diag.timestamp}`,
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildDiagnosticClipboardText(
  diag: DiagnosticInfo,
  health: HealthSnapshot | null,
): string {
  const lines = [
    "Personal Agent Diagnostic",
    `ID: ${diag.diagnosticId}`,
    `Time: ${diag.timestamp}`,
    `Component: ${diag.component}`,
    `Stage: ${diag.stage}`,
    `Code: ${diag.errorCode}`,
    diag.provider ? `Provider: ${diag.provider}` : "",
    typeof diag.httpStatus === "number" ? `HTTP: ${diag.httpStatus}` : "",
    health?.version ? `Version: ${health.version}` : "",
    health?.platform ? `Platform: ${health.platform}` : "",
    health?.architecture ? `Architecture: ${health.architecture}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

