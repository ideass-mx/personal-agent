"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApi", {
  getState: () => ipcRenderer.invoke("get-state"),
  onState: (cb) => {
    const listener = (_e, state) => cb(state);
    ipcRenderer.on("state", listener);
    return () => ipcRenderer.removeListener("state", listener);
  },
  runPreflight: () => ipcRenderer.invoke("run-preflight"),
  getTailscaleStatus: () => ipcRenderer.invoke("get-tailscale-status"),
  openTailscaleDownload: () => ipcRenderer.invoke("open-tailscale-download"),
  startTailscaleLogin: () => ipcRenderer.invoke("start-tailscale-login"),
  verifySecureNetwork: () => ipcRenderer.invoke("verify-secure-network"),
  chooseWorkspace: () => ipcRenderer.invoke("choose-workspace"),
  completeFirstRun: (payload) =>
    ipcRenderer.invoke("complete-first-run", payload),
  validateConfig: (payload) => ipcRenderer.invoke("validate-config", payload),
  startAgent: () => ipcRenderer.invoke("start-agent"),
  stopAgent: () => ipcRenderer.invoke("stop-agent"),
  restartAgent: () => ipcRenderer.invoke("restart-agent"),
  beginPairing: () => ipcRenderer.invoke("begin-pairing"),
  pollPairing: () => ipcRenderer.invoke("poll-pairing"),
  approvePairing: () => ipcRenderer.invoke("approve-pairing"),
  rejectPairing: () => ipcRenderer.invoke("reject-pairing"),
  listTrustedDevices: () => ipcRenderer.invoke("list-trusted-devices"),
  revokeTrustedDevice: (payload) =>
    ipcRenderer.invoke("revoke-trusted-device", payload),
  confirmPairingOrSkip: (payload) =>
    ipcRenderer.invoke("confirm-pairing-or-skip", payload),
  completeOnboarding: () => ipcRenderer.invoke("complete-onboarding"),
  getCapabilitiesSummary: () =>
    ipcRenderer.invoke("get-capabilities-summary"),
  openLogs: () => ipcRenderer.invoke("open-logs"),
  openConsole: () => ipcRenderer.invoke("open-console"),
  copyDiagnostics: () => ipcRenderer.invoke("copy-diagnostics"),
  revealTokenOnce: () => ipcRenderer.invoke("reveal-token-once"),
  getPairing: () => ipcRenderer.invoke("get-pairing"),
  artifactHead: (payload) => ipcRenderer.invoke("artifact-head", payload),
  artifactDownload: (payload) =>
    ipcRenderer.invoke("artifact-download", payload),
});
