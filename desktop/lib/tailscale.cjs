"use strict";

/**
 * Tailscale probe via official CLI only.
 * Does NOT store Tailscale credentials or tokens.
 *
 * Product phases (strict):
 *   MISSING | AUTH_REQUIRED | CONNECTED | READY
 *
 * READY requires Running + valid Self + ≥1 Tailscale IP.
 * NETWORK_READY gate must use ready === true only.
 *
 * PERSONAL_AGENT_SKIP_TAILSCALE=1 is honored ONLY in development builds.
 */
const { spawnSync } = require("node:child_process");

const TailscalePhase = {
  MISSING: "MISSING",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  CONNECTED: "CONNECTED",
  READY: "READY",
};

function defaultExec(command, args, opts = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    timeout: opts.timeout ?? 8000,
    windowsHide: true,
  });
}

function parseStatusJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Development = not a production/packaged product build.
 * Inject `isDevelopment` in tests; production must never skip.
 */
function isDevelopmentBuild(opts = {}) {
  if (typeof opts.isDevelopment === "boolean") return opts.isDevelopment;
  if (process.env.PERSONAL_AGENT_PRODUCTION === "1") return false;
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.ELECTRON_IS_PACKAGED === "1") return false;
  return true;
}

function canSkipTailscale(opts = {}) {
  return (
    isDevelopmentBuild(opts) &&
    (process.env.PERSONAL_AGENT_SKIP_TAILSCALE === "1" ||
      process.env.PERSONAL_AGENT_SKIP_TAILSCALE === "true")
  );
}

function isValidTailscaleAddress(addr) {
  if (typeof addr !== "string" || !addr.trim()) return false;
  const a = addr.trim();
  // IPv4 CGNAT Tailscale range often 100.x; accept any IPv4/IPv6 from Self.TailscaleIPs
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(a)) return true;
  if (a.includes(":")) return true; // IPv6
  return false;
}

function resultBase(partial) {
  return {
    installed: false,
    authenticated: false,
    connected: false,
    ready: false,
    skipped: false,
    backendState: null,
    selfDnsName: null,
    tailnet: null,
    ipv4: null,
    error: null,
    ...partial,
  };
}

/**
 * @param {{ exec?: typeof defaultExec, isDevelopment?: boolean }} [opts]
 */
function probeTailscale(opts = {}) {
  if (canSkipTailscale(opts)) {
    return resultBase({
      phase: TailscalePhase.READY,
      installed: true,
      authenticated: true,
      connected: true,
      ready: true,
      skipped: true,
      backendState: "Running",
      error: null,
    });
  }

  // Production / non-dev: ignore skip env entirely (even if set).
  const exec = opts.exec || defaultExec;
  const which = exec(process.platform === "win32" ? "where" : "which", [
    "tailscale",
  ]);
  if (which.status !== 0) {
    return resultBase({
      phase: TailscalePhase.MISSING,
      error: "TAILSCALE_NOT_INSTALLED",
    });
  }

  const status = exec("tailscale", ["status", "--json"]);
  if (status.status !== 0) {
    const errText = `${status.stderr || ""} ${status.stdout || ""}`.toLowerCase();
    const needsLogin = /logged out|needs login|not logged|login|auth/i.test(
      errText,
    );
    return resultBase({
      phase: TailscalePhase.AUTH_REQUIRED,
      installed: true,
      error: needsLogin ? "TAILSCALE_AUTH_REQUIRED" : "TAILSCALE_STATUS_FAILED",
    });
  }

  const json = parseStatusJson(status.stdout || "");
  if (!json) {
    return resultBase({
      phase: TailscalePhase.AUTH_REQUIRED,
      installed: true,
      error: "TAILSCALE_STATUS_PARSE",
    });
  }

  const backendState = String(json.BackendState || "");
  const self = json.Self && typeof json.Self === "object" ? json.Self : null;
  const dns = self
    ? self.DNSName || self.HostName || null
    : null;
  const addrs = self && Array.isArray(self.TailscaleIPs) ? self.TailscaleIPs : [];
  const validAddrs = addrs.filter(isValidTailscaleAddress);
  const ipv4 =
    validAddrs.find((a) => /^\d{1,3}(\.\d{1,3}){3}$/.test(a)) ||
    validAddrs[0] ||
    null;
  const tailnet =
    (json.CurrentTailnet && json.CurrentTailnet.Name) ||
    json.MagicDNSSuffix ||
    null;

  const needsLogin =
    backendState === "NeedsLogin" || backendState === "NoState";
  if (needsLogin || !self) {
    return resultBase({
      phase: TailscalePhase.AUTH_REQUIRED,
      installed: true,
      authenticated: false,
      backendState,
      selfDnsName: dns,
      tailnet,
      ipv4,
      error: "TAILSCALE_AUTH_REQUIRED",
    });
  }

  const authenticated = true;
  const running = backendState === "Running";
  const backendActive = running || backendState === "Starting";

  // READY: Running + Self + ≥1 Tailscale address
  if (running && validAddrs.length > 0) {
    return resultBase({
      phase: TailscalePhase.READY,
      installed: true,
      authenticated: true,
      connected: true,
      ready: true,
      backendState,
      selfDnsName: dns,
      tailnet,
      ipv4,
      error: null,
    });
  }

  // CONNECTED: backend active + authenticated + Self, but not yet READY
  if (backendActive) {
    return resultBase({
      phase: TailscalePhase.CONNECTED,
      installed: true,
      authenticated,
      connected: true,
      ready: false,
      backendState,
      selfDnsName: dns,
      tailnet,
      ipv4,
      error: running ? "TAILSCALE_NO_ADDRESS" : "TAILSCALE_NOT_CONNECTED",
    });
  }

  // Authenticated but backend not active (e.g. Stopped) — not READY, not CONNECTED
  return resultBase({
    phase: TailscalePhase.AUTH_REQUIRED,
    installed: true,
    authenticated: true,
    connected: false,
    ready: false,
    backendState,
    selfDnsName: dns,
    tailnet,
    ipv4,
    error: "TAILSCALE_NOT_CONNECTED",
  });
}

function startTailscaleLogin(opts = {}) {
  const exec = opts.exec || defaultExec;
  const r = exec("tailscale", ["login"], { timeout: 15000 });
  return {
    ok: r.status === 0,
    error: r.status === 0 ? null : "TAILSCALE_LOGIN_FAILED",
  };
}

function openTailscaleDownload(shellOpenExternal) {
  const url =
    process.platform === "win32"
      ? "https://tailscale.com/download/windows"
      : "https://tailscale.com/download";
  if (typeof shellOpenExternal === "function") {
    shellOpenExternal(url);
  }
  return { ok: true, url };
}

module.exports = {
  TailscalePhase,
  probeTailscale,
  startTailscaleLogin,
  openTailscaleDownload,
  isDevelopmentBuild,
  canSkipTailscale,
  isValidTailscaleAddress,
};
