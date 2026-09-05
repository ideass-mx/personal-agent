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
    diag.model ? `Modelo: ${diag.model}` : "",
    typeof diag.httpStatus === "number" ? `HTTP: ${diag.httpStatus}` : "",
    diag.providerErrorType ? `Tipo provider: ${diag.providerErrorType}` : "",
    diag.providerRequestId ? `Request ID: ${diag.providerRequestId}` : "",
    diag.safeMessage ? `Mensaje: ${diag.safeMessage}` : "",
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
    diag.model ? `Model: ${diag.model}` : "",
    typeof diag.httpStatus === "number" ? `HTTP: ${diag.httpStatus}` : "",
    diag.providerErrorType ? `Provider Error Type: ${diag.providerErrorType}` : "",
    diag.providerRequestId ? `Provider Request ID: ${diag.providerRequestId}` : "",
    diag.safeMessage ? `Safe Provider Message: ${diag.safeMessage}` : "",
    health?.version ? `Version: ${health.version}` : "",
    health?.platform ? `Platform: ${health.platform}` : "",
    health?.architecture ? `Architecture: ${health.architecture}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

