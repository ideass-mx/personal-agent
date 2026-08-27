"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApi", {
  getState: () => ipcRenderer.invoke("get-state"),
  onState: (cb) => {
    const listener = (_e, state) => cb(state);
    ipcRenderer.on("state", listener);
    return () => ipcRenderer.removeListener("state", listener);
  },
  chooseWorkspace: () => ipcRenderer.invoke("choose-workspace"),
  completeFirstRun: (payload) =>
    ipcRenderer.invoke("complete-first-run", payload),
  validateConfig: (payload) => ipcRenderer.invoke("validate-config", payload),
  startAgent: () => ipcRenderer.invoke("start-agent"),
  stopAgent: () => ipcRenderer.invoke("stop-agent"),
  restartAgent: () => ipcRenderer.invoke("restart-agent"),
  openLogs: () => ipcRenderer.invoke("open-logs"),
  openConsole: () => ipcRenderer.invoke("open-console"),
  copyDiagnostics: () => ipcRenderer.invoke("copy-diagnostics"),
  revealTokenOnce: () => ipcRenderer.invoke("reveal-token-once"),
  getPairing: () => ipcRenderer.invoke("get-pairing"),
});
