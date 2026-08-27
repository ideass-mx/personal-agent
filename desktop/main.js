"use strict";

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
const { createAgentSupervisor } = require("./lib/agent-process.cjs");

function resolveProductRoot() {
  if (process.env.PERSONAL_AGENT_PRODUCT_ROOT) {
    return process.env.PERSONAL_AGENT_PRODUCT_ROOT;
  }
  const beside = path.resolve(__dirname, "..");
  if (
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
  if (fs.existsSync(path.join(distWin, "gateway", "hub.cjs"))) {
    return distWin;
  }
  const dist = path.resolve(__dirname, "..", "dist");
  if (fs.existsSync(path.join(dist, "hub", "hub.cjs"))) {
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
  const env = {
    HUB_TOKEN: token,
    HUB_PORT: String(cfg.hubPort || 8787),
  };
  if (cfg.workspaceRoot) {
    env.AGENT_FILESYSTEM_ROOT = cfg.workspaceRoot;
  }
  if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
  env.PERSONAL_AGENT_DB = path.join(data.dbDir, "personal-agent.db");
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
let lastHealth = { ok: false, agentReady: false, agentTools: 0, devices: [] };

function publishState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("state", getUiSnapshot());
  refreshTrayMenu();
}

function getUiSnapshot() {
  const cfg = config.loadConfig();
  const snap = supervisor?.snapshot() || {
    running: false,
    bootReady: false,
    lastError: null,
  };
  const state = mapAgentState({
    workspaceConfigured: Boolean(cfg.workspaceRoot && cfg.firstRunComplete),
    processRunning: snap.running,
    bootReady: snap.bootReady,
    healthOk: snap.bootReady || lastHealth.ok,
    lastError: snap.lastError,
    androidConnected: null,
  });
  return {
    state,
    stateLabel: labelForState(state),
    workspaceRoot: cfg.workspaceRoot,
    port: cfg.hubPort || 8787,
    lanIps: lanAddresses(),
    tokenMasked: config.maskToken(config.getHubToken()),
    running: snap.running,
    bootReady: snap.bootReady,
    lastError: snap.lastError,
    anthropicApiKeySet: cfg.anthropicApiKeySet,
    firstRunComplete: cfg.firstRunComplete,
    productRoot,
    consoleUrl: consoleUrl(),
    agentTools: lastHealth.agentTools,
    devices: lastHealth.devices || [],
  };
}

async function refreshHealth() {
  const cfg = config.loadConfig();
  if (!supervisor?.isRunning()) {
    lastHealth = { ok: false, agentReady: false, agentTools: 0, devices: [] };
    return lastHealth;
  }
  lastHealth = await supervisor.probeHealth(cfg.hubPort || 8787);
  return lastHealth;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 560,
    height: 780,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "Agente personal",
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function buildTrayTemplate() {
  const snap = getUiSnapshot();
  return [
    {
      label: `Estado: ${snap.stateLabel}`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Iniciar agente",
      click: async () => {
        await supervisor.start();
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
        await supervisor.restart();
        await refreshHealth();
        publishState();
      },
    },
    {
      label: "Abrir Agent Console",
      click: () => {
        shell.openExternal(consoleUrl());
      },
    },
    {
      label: "Mostrar panel",
      click: () => {
        if (!mainWindow) createWindow();
        mainWindow.show();
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
        quitting = true;
        await supervisor.stop();
        app.quit();
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
    if (!mainWindow) createWindow();
    mainWindow.show();
  });
}

async function copyDiagnosticsToClipboard() {
  const cfg = config.loadConfig();
  const snap = supervisor.snapshot();
  const health = snap.running
    ? await supervisor.probeHealth(cfg.hubPort || 8787)
    : { ok: false, agentReady: false, agentTools: 0, devices: [] };
  const report = buildDiagnosticsReport({
    version: "0.1.0",
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
  clipboard.writeText(sanitizeDiagnostics(report));
  return { ok: true, report };
}

function wireIpc() {
  ipcMain.handle("get-state", async () => {
    await refreshHealth();
    return getUiSnapshot();
  });

  ipcMain.handle("choose-workspace", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "Carpeta de trabajo del agente",
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("complete-first-run", (_e, payload) => {
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
    if (!apiKey) {
      return { ok: false, error: "api_key_required" };
    }
    config.setAnthropicApiKey(apiKey);
    const cfg = config.loadConfig();
    cfg.workspaceRoot = workspaceRoot;
    cfg.firstRunComplete = true;
    cfg.hubPort = Number(payload?.hubPort) || cfg.hubPort || 8787;
    config.ensureHubToken();
    config.saveConfig(cfg);
    return { ok: true, tokenMasked: config.maskToken(config.getHubToken()) };
  });

  ipcMain.handle("start-agent", async () => {
    const r = await supervisor.start();
    // Poll health briefly for READY UI
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      await refreshHealth();
      if (supervisor.snapshot().bootReady || lastHealth.agentReady) break;
    }
    publishState();
    return { ...r, health: lastHealth };
  });
  ipcMain.handle("stop-agent", async () => {
    await supervisor.stop();
    await refreshHealth();
    publishState();
    return { ok: true };
  });
  ipcMain.handle("restart-agent", async () => {
    const r = await supervisor.restart();
    for (let i = 0; i < 20; i++) {
      await new Promise((x) => setTimeout(x, 500));
      await refreshHealth();
      if (supervisor.snapshot().bootReady || lastHealth.agentReady) break;
    }
    publishState();
    return { ...r, health: lastHealth };
  });
  ipcMain.handle("open-logs", () => {
    shell.openPath(config.paths().logsDir);
    return { ok: true };
  });
  ipcMain.handle("open-console", () => {
    shell.openExternal(consoleUrl());
    return { ok: true, url: consoleUrl() };
  });
  ipcMain.handle("copy-diagnostics", async () => copyDiagnosticsToClipboard());
  ipcMain.handle("reveal-token-once", () => ({
    token: config.getHubToken(),
  }));
  ipcMain.handle("get-pairing", () => {
    const cfg = config.loadConfig();
    const ips = lanAddresses();
    const port = cfg.hubPort || 8787;
    return {
      urls: ips.map((ip) => `ws://${ip}:${port}`),
      consoleUrls: [
        `http://127.0.0.1:${port}/`,
        ...ips.map((ip) => `http://${ip}:${port}/`),
      ],
      port,
      tokenMasked: config.maskToken(config.getHubToken()),
      wifiHint:
        "Usa la misma red Wi‑Fi en el PC y el teléfono. Internet remoto no está disponible.",
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
    if (!apiKey) errors.push("api_key_required");
    return { ok: errors.length === 0, errors };
  });
}

app.whenReady().then(async () => {
  config.ensureDirs();
  productRoot = resolveProductRoot();
  supervisor = createAgentSupervisor({
    productRoot,
    getEnv: gatewayEnv,
    onLog: () => {},
    onState: publishState,
  });
  wireIpc();
  createWindow();
  createTray();
  const cfg = config.loadConfig();
  if (cfg.firstRunComplete && cfg.workspaceRoot) {
    await supervisor.start();
    await refreshHealth();
    publishState();
  }
});

app.on("before-quit", () => {
  quitting = true;
});
