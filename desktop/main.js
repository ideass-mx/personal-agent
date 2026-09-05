"use strict";

/**
 * Desktop shell — onboarding state machine + Tailscale gate + Hub supervisor.
 * Inno Setup only copies binaries; this process owns post-install onboarding.
 */
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  shell,
  nativeImage,
  dialog,
  clipboard,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const config = require("./lib/config.cjs");
const { mapAgentState, labelForState } = require("./lib/states.cjs");
const {
  buildDiagnosticsReport,
  sanitizeDiagnostics,
} = require("./lib/diagnostics.cjs");
const { readBuildInfo, resolveProductVersion } = require("./lib/build-info.cjs");
const { createAgentSupervisor } = require("./lib/agent-process.cjs");
const {
  OnboardingState,
  loadOnboarding,
  setOnboardingState,
  setOnboardingError,
  migrateLegacyIfNeeded,
  canStartAgentRuntime,
} = require("./lib/onboarding.cjs");
const { runPreflight, resolvePostPreflightState } = require("./lib/preflight.cjs");
const {
  probeTailscale,
  startTailscaleLogin,
  openTailscaleDownload,
  canSkipTailscale,
} = require("./lib/tailscale.cjs");
const {
  ensureAgentId,
  getAgentId,
  hasPersistedInstallCredential,
  hasPersistedPairingAuth,
} = require("./lib/agent-identity.cjs");
const {
  ensurePairingCredentials,
  preserveExistingPairing,
  getPairingStatus,
  getInstallAuthBearer,
} = require("./lib/pairing.cjs");
const { logOnboarding } = require("./lib/onboarding-log.cjs");
const {
  waitForHealth,
  requestBrowserLaunchUrl,
  classifyBrowserOpenError,
} = require("./lib/host-boot.cjs");

/** true when product UX is Web (default). Legacy Electron onboarding only if env flag. */
const SHUTDOWN_HOST_ARG = "--shutdown-host";
const shutdownRequested = process.argv.includes(SHUTDOWN_HOST_ARG);
let hostModeActive = false;
let lastConsolePort = 8787;
let browserOpenedForCurrentStartup = false;

function resolveProductRoot() {
  if (process.env.PERSONAL_AGENT_PRODUCT_ROOT) {
    return process.env.PERSONAL_AGENT_PRODUCT_ROOT;
  }
  const beside = path.resolve(__dirname, "..");
  if (
    fs.existsSync(path.join(beside, "gateway", "gateway.cjs")) ||
    fs.existsSync(path.join(beside, "gateway", "hub.cjs")) ||
    fs.existsSync(path.join(beside, "hub", "hub.cjs"))
  ) {
    return beside;
  }
  const distWin = path.resolve(
    __dirname,
    "..",
    "dist",
    "windows",
    "PersonalAgent",
  );
  if (
    fs.existsSync(path.join(distWin, "gateway", "gateway.cjs")) ||
    fs.existsSync(path.join(distWin, "gateway", "hub.cjs"))
  ) {
    return distWin;
  }
  const dist = path.resolve(__dirname, "..", "dist");
  if (
    fs.existsSync(path.join(dist, "gateway", "gateway.cjs")) ||
    fs.existsSync(path.join(dist, "hub", "hub.cjs"))
  ) {
    return dist;
  }
  return beside;
}

function resolveConsoleStaticDir(root) {
  const candidates = [
    path.join(root, "console"),
    path.join(root, "web", "dist"),
    path.join(root, "dist", "web"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  }
  return null;
}

function lanAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const entries of Object.values(nets)) {
    for (const e of entries || []) {
      if (e.family === "IPv4" && !e.internal) out.push(e.address);
    }
  }
  return out;
}

function gatewayEnv() {
  const cfg = config.loadConfig();
  const token = config.getHubToken();
  const apiKey = config.getAnthropicApiKey();
  const data = config.ensureDirs();
  const hostId = getAgentId();
  const env = {
    HUB_TOKEN: token,
    HUB_PORT: String(cfg.hubPort || 8787),
  };
  if (productRoot) {
    env.PERSONAL_AGENT_PRODUCT_ROOT = productRoot;
  }
  if (hostId) {
    env.PERSONAL_AGENT_ID = hostId;
    env.PERSONAL_AGENT_HOST_ID = hostId;
  }
  if (cfg.workspaceRoot) {
    env.AGENT_FILESYSTEM_ROOT = cfg.workspaceRoot;
  }
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
  env.PERSONAL_AGENT_DB = path.join(data.dbDir, "personal-agent.db");
  env.PERSONAL_AGENT_OBJECTS_DIR = data.objectsDir;
  env.PERSONAL_AGENT_CREDENTIALS_DIR = data.credentialsDir;
  const consoleDir = resolveConsoleStaticDir(productRoot);
  if (consoleDir) {
    env.AGENT_CONSOLE_STATIC = consoleDir;
  }
  return env;
}

function consoleUrl() {
  const cfg = config.loadConfig();
  const port = cfg.hubPort || 8787;
  return `http://127.0.0.1:${port}/`;
}

let mainWindow = null;
let tray = null;
let supervisor = null;
let productRoot = null;
let quitting = false;
let lastHealth = {
  ok: false,
  agentReady: false,
  agentTools: 0,
  devices: [],
  nodeStatus: "UNKNOWN",
};
/** Trusted devices known via Gateway HTTP (not install HUB_TOKEN). */
let lastTrustedDeviceCount = 0;
let lastNetworkReady = false;
let lastPreflight = null;
/** @type {null | { substatus: string, sessionId?: string, uri?: string, qrDataUrl?: string, expiresAt?: string, deviceName?: string, deviceId?: string }} */
let lastPairingUi = null;
let shutdownInFlight = null;

function destroyTray() {
  if (!tray) return;
  try {
    tray.destroy();
  } catch {
    /* ignore */
  }
  tray = null;
}

async function shutdownHost(reason = "app_quit") {
  if (shutdownInFlight) return shutdownInFlight;
  shutdownInFlight = (async () => {
    quitting = true;
    logOnboarding("HOST", "shutdown_requested", { reason });
    destroyTray();
    try {
      if (supervisor) {
        await supervisor.stop();
      }
    } catch {
      /* ignore */
    }
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.removeAllListeners("close");
        mainWindow.close();
      }
    } catch {
      /* ignore */
    }
    app.quit();
    setTimeout(() => {
      try {
        app.exit(0);
      } catch {
        /* ignore */
      }
    }, 1500).unref?.();
  })();
  return shutdownInFlight;
}

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    if (argv.includes(SHUTDOWN_HOST_ARG)) {
      void shutdownHost("uninstall");
      return;
    }
    void showProductWindow();
  });
}

function hubHttpBase() {
  const cfg = config.loadConfig();
  return `http://127.0.0.1:${cfg.hubPort || 8787}`;
}

async function hubPairingFetch(pathname, options = {}) {
  const token = getInstallAuthBearer();
  const res = await fetch(`${hubHttpBase()}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/**
 * PHASE 58 — HEAD /artifacts/:id (install Bearer). No expone paths de storage.
 */
async function hubArtifactHead(artifactId) {
  const id = encodeURIComponent(String(artifactId || "").trim());
  const token = getInstallAuthBearer();
  const res = await fetch(`${hubHttpBase()}/artifacts/${id}`, {
    method: "HEAD",
    headers: { Authorization: `Bearer ${token}` },
  });
  return {
    ok: res.ok,
    status: res.status,
    contentType: res.headers.get("content-type"),
    contentLength: res.headers.get("content-length"),
    contentDisposition: res.headers.get("content-disposition"),
  };
}

/**
 * PHASE 58 — GET streaming a archivo local (install Bearer).
 */
async function hubArtifactDownload(artifactId, destPath) {
  const id = encodeURIComponent(String(artifactId || "").trim());
  const token = getInstallAuthBearer();
  const res = await fetch(`${hubHttpBase()}/artifacts/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    return {
      ok: false,
      status: res.status,
      error: errJson?.error?.code || "download_failed",
      message: errJson?.error?.message || `HTTP ${res.status}`,
    };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return {
    ok: true,
    status: res.status,
    bytes: buf.length,
    destPath,
    contentType: res.headers.get("content-type"),
  };
}

function preferredPairingEndpoint() {
  const cfg = config.loadConfig();
  const port = cfg.hubPort || 8787;
  const ts = probeTailscale({ isDevelopment: !app.isPackaged });
  if (ts.ready && ts.ipv4) return `ws://${ts.ipv4}:${port}/ws`;
  if (ts.ready && ts.selfDnsName) {
    const host = String(ts.selfDnsName).replace(/\.$/, "");
    return `ws://${host}:${port}/ws`;
  }
  const ips = lanAddresses();
  if (ips[0]) return `ws://${ips[0]}:${port}/ws`;
  return `ws://127.0.0.1:${port}/ws`;
}

function publishState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("state", getUiSnapshot());
  refreshTrayMenu();
}

function getUiSnapshot() {
  const cfg = config.loadConfig();
  const onboarding = loadOnboarding();
  const snap = supervisor?.snapshot() || {
    running: false,
    bootReady: false,
    lastError: null,
  };
  const networkReady = lastNetworkReady;
  const state = mapAgentState({
    workspaceConfigured: Boolean(cfg.workspaceRoot && cfg.firstRunComplete),
    processRunning: snap.running,
    bootReady: snap.bootReady,
    healthOk: snap.bootReady && lastHealth.ok && lastHealth.agentReady !== false,
    lastError: snap.lastError,
    androidConnected: null,
    networkReady,
    nodeStatus: lastHealth.nodeStatus,
    agentReady: lastHealth.agentReady,
  });
  return {
    state,
    stateLabel: labelForState(state),
    workspaceRoot: cfg.workspaceRoot,
    port: cfg.hubPort || 8787,
    lanIps: lanAddresses(),
    // Do not eager-create HUB_TOKEN on UI snapshot (false RECOVERY/NEW trap).
    tokenMasked: config.maskToken(config.loadSecrets().hubToken || ""),
    running: snap.running,
    bootReady: snap.bootReady,
    lastError: snap.lastError,
    anthropicApiKeySet: cfg.anthropicApiKeySet,
    firstRunComplete: cfg.firstRunComplete,
    productRoot,
    consoleUrl: consoleUrl(),
    agentTools: lastHealth.agentTools,
    devices: lastHealth.devices || [],
    nodeStatus: lastHealth.nodeStatus || "UNKNOWN",
    onboarding,
    networkReady,
    agentHostId: getAgentId(),
    agentId: getAgentId(),
    /** @deprecated equiv. install credential — NOT trusted device */
    pairingAuthPresent: hasPersistedInstallCredential(),
    installCredentialPresent: hasPersistedInstallCredential(),
    trustedDevicePresent: lastTrustedDeviceCount > 0,
    pairingSubstatus: lastPairingUi?.substatus || null,
    scenario: onboarding.scenario || lastPreflight?.scenario?.scenario || null,
    preflight: lastPreflight,
    needsOnboarding:
      onboarding.state !== OnboardingState.READY ||
      !cfg.firstRunComplete ||
      !networkReady,
  };
}

async function refreshHealth() {
  const cfg = config.loadConfig();
  if (!supervisor?.isRunning()) {
    lastHealth = {
      ok: false,
      agentReady: false,
      agentTools: 0,
      devices: [],
      nodeStatus: "UNKNOWN",
    };
    return lastHealth;
  }
  lastHealth = await supervisor.probeHealth(cfg.hubPort || 8787);
  // Best-effort trusted-device count (install credential ≠ trusted device).
  try {
    const td = await hubPairingFetch("/v1/pairing/trusted-devices");
    if (td.ok && Array.isArray(td.json?.devices)) {
      lastTrustedDeviceCount = td.json.devices.filter(
        (d) => d && d.status === "ACTIVE",
      ).length;
    }
  } catch {
    /* ignore */
  }
  return lastHealth;
}

async function refreshNetwork() {
  const ts = probeTailscale({
    isDevelopment: !app.isPackaged,
  });
  lastNetworkReady = Boolean(ts.ready) && ts.phase === "READY";
  return ts;
}

async function startAgentIfAllowed() {
  const onboarding = loadOnboarding();
  const ts = await refreshNetwork();
  if (!ts.ready || ts.phase !== "READY") {
    logOnboarding("AGENT_PROVISIONING", "blocked_network_not_ready", {
      state: onboarding.state,
      phase: ts.phase,
    });
    return {
      ok: false,
      error: "NETWORK_NOT_READY",
      message:
        "La red segura (Tailscale) debe estar READY antes de arrancar el Agent Runtime.",
    };
  }
  if (!canStartAgentRuntime(onboarding, { networkReady: true })) {
    return {
      ok: false,
      error: "ONBOARDING_STATE",
      message: `Estado de onboarding no permite arranque: ${onboarding.state}`,
    };
  }
  return supervisor.start();
}

function createWindow(opts = {}) {
  const hostUi = Boolean(opts.hostUi) || hostModeActive;
  mainWindow = new BrowserWindow({
    width: hostUi ? 1100 : 560,
    height: hostUi ? 800 : 820,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "Agente personal",
  });
  if (!hostUi) {
    mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  }
  mainWindow.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function consoleHttpUrl(port = lastConsolePort) {
  return `http://127.0.0.1:${port}/`;
}

function escapeForTemplateLiteral(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

async function showHostSplashMessage(state) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const details = [
    state.details,
    state.errorCode ? `Código: ${state.errorCode}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  await mainWindow.loadFile(path.join(__dirname, "renderer", "host-splash.html"));
  await mainWindow.webContents
    .executeJavaScript(
      `window.setHostSplashState && window.setHostSplashState({
        title: \`${escapeForTemplateLiteral(state.title || "Personal Agent")}\`,
        message: \`${escapeForTemplateLiteral(state.message || "Iniciando tu agente…")}\`,
        details: \`${escapeForTemplateLiteral(details)}\`,
        showActions: ${state.showActions !== false},
      });`,
    )
    .catch(() => {});
}

/**
 * Recreate / show the product window. In host mode never load legacy onboarding UI.
 */
async function showProductWindow() {
  if (hostModeActive) {
    const snap = supervisor?.snapshot?.() || {};
    if (snap.running && snap.bootReady) {
      await openPersonalAgentInBrowser();
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      return;
    }
    createWindow({ hostUi: true });
    mainWindow.loadFile(path.join(__dirname, "renderer", "host-splash.html"));
    return;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  createWindow();
  mainWindow.show();
}

async function openPersonalAgentInBrowser() {
  const token = config.getHubToken();
  const launchUrl = await requestBrowserLaunchUrl(lastConsolePort, token);
  await shell.openExternal(launchUrl);
  return { ok: true, url: launchUrl };
}

/**
 * Fase 3/7.6: host mode — Gateway sin Tailscale gate; Web UI es el onboarding.
 */
async function bootHostMode() {
  hostModeActive = true;
  browserOpenedForCurrentStartup = false;
  config.ensureHubToken();
  const cfg = config.loadConfig();
  const port = cfg.hubPort || 8787;
  lastConsolePort = port;

  createWindow({ hostUi: true });
  mainWindow.loadFile(path.join(__dirname, "renderer", "host-splash.html"));

  logOnboarding("HOST", "gateway_start", { port });
  const started = await supervisor.start();
  if (!started.ok && !started.already) {
    logOnboarding("HOST", "gateway_start_failed", {
      error: started.error || "start_failed",
    });
    await showHostSplashMessage({
      title: "Personal Agent",
      message: "No pudimos iniciar tu agente. Usa Reintentar o revisa el diagnóstico.",
      details: "El host no pudo iniciar el agente correctamente.",
    });
    return { ok: false, error: started.error || "start_failed" };
  }

  try {
    await waitForHealth(port, 90000);
  } catch {
    logOnboarding("HOST", "health_timeout", { port });
    await showHostSplashMessage({
      title: "Personal Agent",
      message: "No pudimos iniciar tu agente. Usa Reintentar o revisa el diagnóstico.",
      details: "El agente no respondió al health check a tiempo.",
    });
    return { ok: false, error: "health_timeout" };
  }

  lastNetworkReady = true; // localhost product path; remote Tailscale is optional later
  try {
    if (!browserOpenedForCurrentStartup) {
      await openPersonalAgentInBrowser();
      browserOpenedForCurrentStartup = true;
    }
  } catch (err) {
    const browserError = classifyBrowserOpenError(err);
    logOnboarding("HOST", browserError.event, {
      ...(browserError.errorCode ? { errorCode: browserError.errorCode } : {}),
      ...(browserError.error ? { error: browserError.error } : {}),
    });
    await showHostSplashMessage(browserError);
    return {
      ok: false,
      error: browserError.classification,
      errorCode: browserError.errorCode,
    };
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
  logOnboarding("HOST", "browser_open", { url: "localhost" });
  publishState();
  return { ok: true };
}

function buildTrayTemplate() {
  const snap = getUiSnapshot();
  return [
    {
      label: `Estado: ${snap.stateLabel}`,
      enabled: false,
    },
    {
      label: hostModeActive
        ? `Host: ${snap.stateLabel}`
        : `Onboarding: ${snap.onboarding?.state || "—"}`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Iniciar agente",
      click: async () => {
        await startAgentIfAllowed();
        await refreshHealth();
        publishState();
      },
    },
    {
      label: "Detener agente",
      click: async () => {
        await supervisor.stop();
        await refreshHealth();
        publishState();
      },
    },
    {
      label: "Reiniciar agente",
      click: async () => {
        await supervisor.stop();
        await startAgentIfAllowed();
        await refreshHealth();
        publishState();
      },
    },
    {
      label: "Abrir Personal Agent",
      click: () => {
        void showProductWindow();
      },
    },
    {
      label: hostModeActive ? "Mostrar agente" : "Mostrar panel",
      click: () => {
        void showProductWindow();
      },
    },
    {
      label: "Diagnóstico (copiar)",
      click: async () => {
        await copyDiagnosticsToClipboard();
      },
    },
    {
      label: "Abrir logs",
      click: () => shell.openPath(config.paths().logsDir),
    },
    { type: "separator" },
    {
      label: "Salir",
      click: async () => {
        await shutdownHost("tray_exit");
      },
    },
  ];
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayTemplate()));
  tray.setToolTip(`Agente personal — ${getUiSnapshot().stateLabel}`);
}

function createTray() {
  const img = nativeImage.createEmpty();
  tray = new Tray(img);
  refreshTrayMenu();
  tray.on("click", () => {
    void showProductWindow();
  });
}

async function copyDiagnosticsToClipboard() {
  const cfg = config.loadConfig();
  const snap = supervisor.snapshot();
  const onboarding = loadOnboarding();
  const buildInfo = readBuildInfo(productRoot);
  const health = snap.running
    ? await supervisor.probeHealth(cfg.hubPort || 8787)
    : { ok: false, agentReady: false, agentTools: 0, devices: [] };
  const report = buildDiagnosticsReport({
    version:
      buildInfo?.version ||
      resolveProductVersion(productRoot, "0.1.0") ||
      health.version ||
      "unknown",
    build: buildInfo?.build || health.build || "unknown",
    commit: buildInfo?.commit || health.commit || "unknown",
    platform: buildInfo?.platform || "windows",
    architecture: buildInfo?.architecture || "x64",
    builtAt: buildInfo?.builtAt || health.builtAt || "unknown",
    state: getUiSnapshot().stateLabel,
    gateway: snap.running ? "running" : "stopped",
    node:
      health.agentReady || snap.bootReady ? "boot OK" : "unknown / not ready",
    mcp:
      health.agentReady || snap.bootReady ? "boot OK" : "unknown / not ready",
    tools: String(health.agentTools || "?"),
    workspaceConfigured: Boolean(cfg.workspaceRoot),
    workspacePersisted: Boolean(cfg.workspaceRoot && cfg.firstRunComplete),
    port: cfg.hubPort || 8787,
    console: consoleUrl(),
    android: Array.isArray(health.devices)
      ? `${health.devices.length} device(s) in /health snapshot`
      : "check Android app (not tracked live on PC)",
  });
  const extra = [
    "",
    `onboardingState=${onboarding.state}`,
    `scenario=${onboarding.scenario || "—"}`,
    `networkReady=${lastNetworkReady}`,
    `agentHostIdSet=${Boolean(getAgentId())}`,
    `pairingAuthSet=${hasPersistedPairingAuth()}`,
    `tailscaleSkipActive=${canSkipTailscale({ isDevelopment: !app.isPackaged })}`,
  ].join("\n");
  clipboard.writeText(sanitizeDiagnostics(report + extra));
  return { ok: true, report };
}

function userErrorMessage(code) {
  switch (code) {
    case "TAILSCALE_NOT_INSTALLED":
      return "Hay que instalar Tailscale para la red segura.";
    case "TAILSCALE_AUTH_REQUIRED":
      return "Inicia sesión en Tailscale y vuelve a comprobar.";
    case "TAILSCALE_NOT_CONNECTED":
      return "Tailscale está instalado pero no conectado.";
    case "NETWORK_NOT_READY":
      return "La red segura aún no está lista.";
    case "NO_DOWNGRADE":
      return "Hay una versión más nueva instalada. Este instalador no hará downgrade.";
    case "AGENT_START_FAILED":
      return "No se pudo iniciar el Agent Runtime.";
    case "PAIRING_TIMEOUT":
      return "Aún no hay un dispositivo Android emparejado.";
    default:
      return "Algo falló. Revisa Diagnóstico o reintenta.";
  }
}

function wireIpc() {
  ipcMain.handle("get-state", async () => {
    await refreshNetwork();
    await refreshHealth();
    return getUiSnapshot();
  });

  ipcMain.handle("run-preflight", async () => {
    const before = loadOnboarding();
    // Classify against persisted stage before this check — do not force PREFLIGHT
    // first (that caused PREFLIGHT→PREFLIGHT + false RECOVERY).
    const classifyState =
      before.state === OnboardingState.PREFLIGHT ? null : before.state;
    const processHealthy = supervisor?.isRunning()
      ? Boolean(supervisor.snapshot().bootReady || lastHealth.ok)
      : null;
    lastPreflight = await runPreflight({
      productRoot,
      onboardingState: classifyState,
      processHealthy,
    });
    const scenario = lastPreflight.scenario;
    lastNetworkReady = lastPreflight.networkReady;
    const next = resolvePostPreflightState(lastPreflight);
    if (next.state === OnboardingState.ERROR) {
      setOnboardingState(OnboardingState.ERROR, {
        scenario: scenario.scenario,
        reason: next.reason,
        lastErrorCode: next.errorCode || "NO_DOWNGRADE",
        lastError: userErrorMessage(next.errorCode || "NO_DOWNGRADE"),
      });
    } else {
      setOnboardingState(next.state, {
        scenario: scenario.scenario,
        reason: next.reason,
        lastError: null,
        lastErrorCode: null,
      });
    }
    logOnboarding("PREFLIGHT", "advance", {
      from: before.state,
      to: next.state,
      reason: next.reason,
      scenario: scenario.scenario,
    });
    publishState();
    return {
      ...lastPreflight,
      nextState: next.state,
      advanceReason: next.reason,
    };
  });

  ipcMain.handle("get-tailscale-status", async () => {
    const ts = await refreshNetwork();
    publishState();
    return ts;
  });

  ipcMain.handle("open-tailscale-download", () => {
    setOnboardingState(OnboardingState.NETWORK_INSTALLING);
    return openTailscaleDownload((url) => shell.openExternal(url));
  });

  ipcMain.handle("start-tailscale-login", () => {
    setOnboardingState(OnboardingState.NETWORK_AUTHENTICATION);
    const r = startTailscaleLogin();
    if (!r.ok) {
      setOnboardingError("TAILSCALE_AUTH_REQUIRED", userErrorMessage("TAILSCALE_AUTH_REQUIRED"));
    }
    publishState();
    return r;
  });

  ipcMain.handle("verify-secure-network", async () => {
    setOnboardingState(OnboardingState.NETWORK_VERIFYING);
    const ts = await refreshNetwork();
    if (!ts.ready || ts.phase !== "READY") {
      const code = ts.error || "NETWORK_NOT_READY";
      setOnboardingError(code, userErrorMessage(code));
      publishState();
      return { ok: false, tailscale: ts, message: userErrorMessage(code) };
    }
    setOnboardingState(OnboardingState.NETWORK_READY, {
      networkReadyAt: new Date().toISOString(),
      lastError: null,
      lastErrorCode: null,
    });
    publishState();
    return { ok: true, tailscale: ts };
  });

  ipcMain.handle("choose-workspace", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "Carpeta de trabajo del agente",
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("complete-first-run", async (_e, payload) => {
    const workspaceRoot = String(payload?.workspaceRoot || "").trim();
    const apiKey = String(payload?.anthropicApiKey || "").trim();
    if (!workspaceRoot) return { ok: false, error: "workspace_required" };
    if (!fs.existsSync(workspaceRoot)) {
      return { ok: false, error: "workspace_missing" };
    }
    try {
      fs.accessSync(workspaceRoot, fs.constants.R_OK | fs.constants.W_OK);
    } catch {
      return { ok: false, error: "workspace_inaccessible" };
    }
    if (!apiKey && !config.getAnthropicApiKey()) {
      return { ok: false, error: "api_key_required" };
    }

    const onboarding = loadOnboarding();
    const ts = await refreshNetwork();
    if (!ts.ready || ts.phase !== "READY") {
      return { ok: false, error: "NETWORK_NOT_READY" };
    }
    if (!canStartAgentRuntime(onboarding, { networkReady: true })) {
      return { ok: false, error: "NETWORK_NOT_READY" };
    }

    setOnboardingState(OnboardingState.AGENT_PROVISIONING, {
      lastError: null,
      lastErrorCode: null,
    });

    // Preserve identity + pairing on UPDATE/REPAIR/RECOVERY
    const identity = ensureAgentId();
    preserveExistingPairing();
    ensurePairingCredentials();
    if (apiKey) config.setAnthropicApiKey(apiKey);
    const cfg = config.loadConfig();
    cfg.workspaceRoot = workspaceRoot;
    cfg.firstRunComplete = true;
    cfg.hubPort = Number(payload?.hubPort) || cfg.hubPort || 8787;
    config.saveConfig(cfg);

    logOnboarding("IDENTITY", identity.created ? "created" : "reused", {
      created: identity.created,
    });
    logOnboarding("AGENT_PROVISIONING", "config_saved", {
      identityCreated: identity.created,
      pairing: getPairingStatus().present,
    });

    return {
      ok: true,
      tokenMasked: config.maskToken(config.getHubToken()),
      agentHostId: identity.id,
      identityCreated: identity.created,
    };
  });

  ipcMain.handle("start-agent", async () => {
    setOnboardingState(OnboardingState.AGENT_INITIALIZING);
    const r = await startAgentIfAllowed();
    if (!r.ok && !r.already) {
      setOnboardingError(
        r.error || "AGENT_START_FAILED",
        r.message || userErrorMessage("AGENT_START_FAILED"),
      );
      publishState();
      return r;
    }
    for (let i = 0; i < 20; i++) {
      await new Promise((x) => setTimeout(x, 500));
      await refreshHealth();
      if (supervisor.snapshot().bootReady || lastHealth.agentReady) break;
    }
    if (supervisor.snapshot().bootReady || lastHealth.agentReady) {
      setOnboardingState(OnboardingState.AGENT_READY, {
        agentReadyAt: new Date().toISOString(),
        lastError: null,
        lastErrorCode: null,
      });
    } else {
      setOnboardingError("AGENT_START_FAILED", userErrorMessage("AGENT_START_FAILED"));
    }
    publishState();
    return { ...r, health: lastHealth, onboarding: loadOnboarding() };
  });

  ipcMain.handle("stop-agent", async () => {
    await supervisor.stop();
    await refreshHealth();
    publishState();
    return { ok: true };
  });

  ipcMain.handle("restart-agent", async () => {
    await supervisor.stop();
    const r = await startAgentIfAllowed();
    for (let i = 0; i < 20; i++) {
      await new Promise((x) => setTimeout(x, 500));
      await refreshHealth();
      if (supervisor.snapshot().bootReady || lastHealth.agentReady) break;
    }
    publishState();
    return { ...r, health: lastHealth };
  });

  ipcMain.handle("begin-pairing", async () => {
    const ts = await refreshNetwork();
    if (!ts.ready || ts.phase !== "READY") {
      lastPairingUi = { substatus: "EXPIRED" };
      return {
        ok: false,
        error: "NETWORK_NOT_READY",
        message:
          "Tailscale debe estar READY antes de crear una sesión de pairing. No se permite fallback LAN.",
      };
    }
    const port = config.loadConfig().hubPort || 8787;
    let pairingEndpoint;
    if (ts.ipv4) pairingEndpoint = `ws://${ts.ipv4}:${port}/ws`;
    else if (ts.selfDnsName) {
      const host = String(ts.selfDnsName).replace(/\.$/, "");
      pairingEndpoint = `ws://${host}:${port}/ws`;
    } else {
      return {
        ok: false,
        error: "NETWORK_NOT_READY",
        message: "No hay endpoint Tailscale para el QR de pairing.",
      };
    }

    setOnboardingState(OnboardingState.PAIRING);
    ensureAgentId();
    preserveExistingPairing();
    ensurePairingCredentials();
    const created = await hubPairingFetch("/v1/pairing/sessions", {
      method: "POST",
      body: JSON.stringify({ endpoint: pairingEndpoint }),
    });
    if (!created.ok || !created.json?.ok) {
      lastPairingUi = { substatus: "EXPIRED" };
      return {
        ok: false,
        error: created.json?.error || "pairing_create_failed",
        message: "No se pudo crear la sesión de pairing.",
      };
    }
    const j = created.json;
    if (j.containsHubToken === true) {
      return { ok: false, error: "security", message: "QR inválido." };
    }
    lastPairingUi = {
      substatus: "QR_READY",
      sessionId: j.pairingSessionId,
      uri: j.uri,
      qrDataUrl: j.qrDataUrl,
      expiresAt: j.expiresAt,
    };
    publishState();
    return {
      ok: true,
      mode: "qr",
      pairingSessionId: j.pairingSessionId,
      uri: j.uri,
      qrDataUrl: j.qrDataUrl,
      expiresAt: j.expiresAt,
      ttlMs: j.ttlMs,
      containsHubToken: false,
      substatus: "QR_READY",
    };
  });

  ipcMain.handle("poll-pairing", async () => {
    if (!lastPairingUi?.sessionId) return { ok: false, error: "no_session" };
    const st = await hubPairingFetch(
      `/v1/pairing/sessions/${lastPairingUi.sessionId}`,
    );
    if (!st.ok) return { ok: false, error: "poll_failed" };
    const row = st.json;
    if (row.status === "AWAITING_CONFIRMATION") {
      lastPairingUi = {
        ...lastPairingUi,
        substatus: "CONFIRMING",
        deviceId: row.deviceId,
        deviceName: row.deviceName,
      };
    } else if (row.status === "EXPIRED") {
      lastPairingUi = { ...lastPairingUi, substatus: "EXPIRED" };
    } else if (row.status === "REJECTED") {
      lastPairingUi = { ...lastPairingUi, substatus: "REJECTED" };
    } else if (row.status === "CONSUMED") {
      lastPairingUi = { ...lastPairingUi, substatus: "APPROVED" };
    } else if (row.status === "PENDING") {
      lastPairingUi = { ...lastPairingUi, substatus: "QR_READY" };
    }
    publishState();
    return {
      ok: true,
      status: row.status,
      substatus: lastPairingUi.substatus,
      deviceId: row.deviceId,
      deviceName: row.deviceName,
      expiresAt: row.expiresAt,
    };
  });

  ipcMain.handle("approve-pairing", async () => {
    if (!lastPairingUi?.sessionId) return { ok: false, error: "no_session" };
    const r = await hubPairingFetch(
      `/v1/pairing/sessions/${lastPairingUi.sessionId}/approve`,
      { method: "POST", body: "{}" },
    );
    if (!r.ok || !r.json?.ok) {
      return { ok: false, error: r.json?.code || "approve_failed" };
    }
    lastPairingUi = {
      ...lastPairingUi,
      substatus: "APPROVED",
      deviceId: r.json.deviceId,
      deviceName: r.json.deviceName,
    };
    publishState();
    return { ok: true, deviceId: r.json.deviceId, deviceName: r.json.deviceName };
  });

  ipcMain.handle("reject-pairing", async () => {
    if (!lastPairingUi?.sessionId) return { ok: false, error: "no_session" };
    await hubPairingFetch(
      `/v1/pairing/sessions/${lastPairingUi.sessionId}/reject`,
      { method: "POST", body: "{}" },
    );
    lastPairingUi = { ...lastPairingUi, substatus: "REJECTED" };
    publishState();
    return { ok: true };
  });

  ipcMain.handle("list-trusted-devices", async () => {
    const r = await hubPairingFetch("/v1/pairing/trusted-devices");
    if (!r.ok || !r.json?.ok) {
      return { ok: false, error: "list_failed", devices: [] };
    }
    return { ok: true, devices: r.json.devices || [] };
  });

  ipcMain.handle("revoke-trusted-device", async (_e, payload) => {
    const deviceId = String(payload?.deviceId || "").trim();
    if (!deviceId) return { ok: false, error: "device_id_required" };
    const r = await hubPairingFetch(
      `/v1/pairing/trusted-devices/${encodeURIComponent(deviceId)}/revoke`,
      { method: "POST", body: "{}" },
    );
    if (!r.ok || !r.json?.ok) {
      return { ok: false, error: r.json?.code || "revoke_failed" };
    }
    await refreshHealth();
    publishState();
    return {
      ok: true,
      deviceId,
      status: r.json.status,
      alreadyRevoked: r.json.alreadyRevoked,
    };
  });

  ipcMain.handle("confirm-pairing-or-skip", async (_e, payload) => {
    const skip = Boolean(payload?.skip);
    if (skip) {
      setOnboardingState(OnboardingState.CONFIGURING, {
        pairingSkipped: true,
        pairingConfirmedAt: null,
      });
      lastPairingUi = null;
      publishState();
      return { ok: true, skipped: true };
    }
    if (lastPairingUi?.substatus === "APPROVED") {
      setOnboardingState(OnboardingState.CONFIGURING, {
        pairingSkipped: false,
        pairingConfirmedAt: new Date().toISOString(),
      });
      publishState();
      return { ok: true, skipped: false };
    }
    return {
      ok: false,
      error: "PAIRING_TIMEOUT",
      message: userErrorMessage("PAIRING_TIMEOUT"),
    };
  });

  ipcMain.handle("complete-onboarding", async () => {
    const cfg = config.loadConfig();
    const ts = await refreshNetwork();
    if (!ts.ready || ts.phase !== "READY") {
      return { ok: false, error: "NETWORK_NOT_READY" };
    }
    if (!cfg.firstRunComplete || !cfg.workspaceRoot) {
      return { ok: false, error: "AGENT_NOT_CONFIGURED" };
    }
    if (!canStartAgentRuntime(loadOnboarding(), { networkReady: true })) {
      return { ok: false, error: "NETWORK_NOT_READY" };
    }
    setOnboardingState(OnboardingState.READY, {
      lastError: null,
      lastErrorCode: null,
    });
    logOnboarding("HEALTH", "ready", {
      networkReady: true,
      agentId: Boolean(getAgentId()),
      pairing: hasPersistedPairingAuth(),
    });
    publishState();
    return { ok: true };
  });

  ipcMain.handle("open-logs", () => {
    shell.openPath(config.paths().logsDir);
    return { ok: true };
  });
  ipcMain.handle("open-console", () => {
    return openPersonalAgentInBrowser();
  });
  ipcMain.handle("copy-diagnostics", async () => copyDiagnosticsToClipboard());
  ipcMain.handle("retry-host-boot", async () => {
    if (!hostModeActive) {
      return { ok: false, error: "not_host_mode" };
    }
    try {
      const snap = supervisor?.snapshot?.() || {};
      if (!snap.running && supervisor) {
        await supervisor.stop().catch(() => {});
      }
      return await bootHostMode();
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "retry_failed",
      };
    }
  });
  ipcMain.handle("reveal-token-once", () => ({
    token: config.getHubToken(),
    kind: "LEGACY_INSTALL_CREDENTIAL",
  }));
  ipcMain.handle("get-pairing", async () => {
    if (lastPairingUi?.uri && lastPairingUi.qrDataUrl) {
      return {
        mode: "qr",
        uri: lastPairingUi.uri,
        qrDataUrl: lastPairingUi.qrDataUrl,
        expiresAt: lastPairingUi.expiresAt,
        pairingSessionId: lastPairingUi.sessionId,
        substatus: lastPairingUi.substatus,
        deviceName: lastPairingUi.deviceName,
        deviceId: lastPairingUi.deviceId,
        containsHubToken: false,
        wifiHint: "Escanea el QR con Personal Agent en Android.",
        tokenMasked: null,
        urls: [],
        consoleUrls: [],
        port: config.loadConfig().hubPort || 8787,
        agentId: getAgentId(),
        pairing: getPairingStatus(),
      };
    }
    const cfg = config.loadConfig();
    const ips = lanAddresses();
    const port = cfg.hubPort || 8787;
    const ts = probeTailscale({ isDevelopment: !app.isPackaged });
    const urls = [];
    if (ts.ipv4) urls.push(`ws://${ts.ipv4}:${port}/ws`);
    if (ts.selfDnsName) {
      const host = String(ts.selfDnsName).replace(/\.$/, "");
      urls.push(`ws://${host}:${port}/ws`);
    }
    for (const ip of ips) urls.push(`ws://${ip}:${port}/ws`);
    return {
      mode: "legacy",
      urls: [...new Set(urls)],
      consoleUrls: [
        `http://127.0.0.1:${port}/`,
        ...(ts.ipv4 ? [`http://${ts.ipv4}:${port}/`] : []),
        ...ips.map((ip) => `http://${ip}:${port}/`),
      ],
      port,
      tokenMasked:
        getPairingStatus().tokenMasked ||
        config.maskToken(config.getHubToken()),
      wifiHint: "Compatibilidad legacy: URL + credencial de instalación.",
      tailscaleReady: Boolean(ts.ready && ts.phase === "READY"),
      agentId: getAgentId(),
      agentHostId: getAgentId(),
      pairing: getPairingStatus(),
      containsHubToken: true,
    };
  });

  ipcMain.handle("validate-config", (_e, payload) => {
    const workspaceRoot = String(payload?.workspaceRoot || "").trim();
    const apiKey = String(payload?.anthropicApiKey || "").trim();
    const errors = [];
    if (!workspaceRoot) errors.push("workspace_required");
    else if (!fs.existsSync(workspaceRoot)) errors.push("workspace_missing");
    else {
      try {
        fs.accessSync(workspaceRoot, fs.constants.R_OK | fs.constants.W_OK);
      } catch {
        errors.push("workspace_inaccessible");
      }
    }
    if (!apiKey && !config.getAnthropicApiKey()) errors.push("api_key_required");
    return { ok: errors.length === 0, errors };
  });

  ipcMain.handle("get-capabilities-summary", () => ({
    // Network security ≠ tool authorization
    note: "Tailscale asegura la red; no autoriza Tools por sí solo.",
    capabilities: [
      { id: "files", label: "Archivos", status: "Enabled" },
      { id: "applications", label: "Aplicaciones", status: "Enabled" },
      { id: "terminal", label: "Terminal", status: "Ask" },
      { id: "browser", label: "Navegador", status: "Ask" },
      { id: "mcp", label: "MCP", status: "Configure" },
    ],
  }));

  ipcMain.handle("artifact-head", async (_e, payload) => {
    const artifactId = String(payload?.artifactId || "").trim();
    if (!artifactId) return { ok: false, error: "artifact_id_required" };
    return hubArtifactHead(artifactId);
  });

  ipcMain.handle("artifact-download", async (_e, payload) => {
    const artifactId = String(payload?.artifactId || "").trim();
    if (!artifactId) return { ok: false, error: "artifact_id_required" };
    const dest =
      String(payload?.destPath || "").trim() ||
      path.join(config.paths().runtimeDir, "downloads", `${artifactId}.bin`);
    return hubArtifactDownload(artifactId, dest);
  });
}

app.whenReady().then(async () => {
  if (shutdownRequested) {
    await shutdownHost("uninstall_helper");
    return;
  }
  if (app.isPackaged) {
    process.env.ELECTRON_IS_PACKAGED = "1";
  }
  config.ensureDirs();
  productRoot = resolveProductRoot();
  migrateLegacyIfNeeded();
  supervisor = createAgentSupervisor({
    productRoot,
    getEnv: gatewayEnv,
    onLog: () => {},
    onState: publishState,
  });
  wireIpc();
  createTray();

  const legacyOnboarding = process.env.PERSONAL_AGENT_LEGACY_ONBOARDING === "1";
  if (!legacyOnboarding) {
    await bootHostMode();
    return;
  }

  createWindow();
  const ts = await refreshNetwork();
  lastPreflight = await runPreflight({
    productRoot,
    onboardingState: loadOnboarding().state,
    processHealthy: null,
  });

  const cfg = config.loadConfig();
  const onboarding = loadOnboarding();
  // Legacy: never auto-start Agent without Tailscale READY.
  if (
    cfg.firstRunComplete &&
    cfg.workspaceRoot &&
    ts.ready &&
    ts.phase === "READY" &&
    canStartAgentRuntime(onboarding, { networkReady: true })
  ) {
    await startAgentIfAllowed();
    await refreshHealth();
  } else if (cfg.firstRunComplete && !(ts.ready && ts.phase === "READY")) {
    logOnboarding("AGENT_PROVISIONING", "defer_start_network", {
      state: onboarding.state,
      phase: ts.phase,
    });
    if (
      onboarding.state === OnboardingState.READY ||
      onboarding.state === OnboardingState.AGENT_READY ||
      onboarding.state === OnboardingState.PAIRING
    ) {
      setOnboardingState(OnboardingState.NETWORK_VERIFYING, {
        scenario: onboarding.scenario || "RECOVERY",
      });
    }
  }
  publishState();
});

app.on("before-quit", () => {
  quitting = true;
  destroyTray();
});
