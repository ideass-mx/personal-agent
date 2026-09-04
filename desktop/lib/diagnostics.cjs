"use strict";

/**
 * Sanitiza texto de diagnóstico / logs para copiar al portapapeles.
 */
const SECRET_PATTERNS = [
  /HUB_TOKEN\s*[:=]\s*\S+/gi,
  /ANTHROPIC_API_KEY\s*[:=]\s*\S+/gi,
  /Authorization\s*:\s*Bearer\s+\S+/gi,
  /"(hub_token|token|password|authorization|api[_-]?key|secret)"\s*:\s*"[^"]*"/gi,
  /sk-ant-[A-Za-z0-9_-]+/g,
];

function sanitizeDiagnostics(text) {
  let out = String(text ?? "");
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, "[redacted]");
  }
  return out;
}

function buildDiagnosticsReport(snapshot) {
  const lines = [
    "Personal Agent — diagnóstico",
    `Version: ${snapshot.version || "unknown"}`,
    `Build: ${snapshot.build || "unknown"}`,
    `Commit: ${snapshot.commit || "unknown"}`,
    `Platform: ${snapshot.platform || "unknown"} ${snapshot.architecture || ""}`.trim(),
    `BuiltAt: ${snapshot.builtAt || "unknown"}`,
    `State: ${snapshot.state || "?"}`,
    `Gateway: ${snapshot.gateway || "?"}`,
    `Node (boot): ${snapshot.node || "?"}`,
    `MCP (boot): ${snapshot.mcp || "?"}`,
    `Tools: ${snapshot.tools || "?"}`,
    `Workspace configured: ${snapshot.workspaceConfigured ? "yes" : "no"}`,
    `Port: ${snapshot.port ?? "?"}`,
    `Console: ${snapshot.console || "?"}`,
    `Workspace persisted: ${snapshot.workspacePersisted ? "yes" : "no"}`,
    `Android: ${snapshot.android || "unknown"}`,
    `Excel note: requires Windows + Microsoft Excel`,
    "",
    "Notes:",
    "- agentReady/tools are boot snapshot, not live mid-run liveness.",
    "- Secrets are never included in this report.",
    "- LOCAL and LAN only; INTERNET remote access is FUTURE.",
  ];
  return sanitizeDiagnostics(lines.join("\n"));
}

module.exports = {
  sanitizeDiagnostics,
  buildDiagnosticsReport,
};
