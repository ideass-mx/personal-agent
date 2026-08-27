"use strict";

let workspaceRoot = null;
let apiKeyDraft = "";

const $ = (id) => document.getElementById(id);

function show(id, visible) {
  $(id).classList.toggle("hidden", !visible);
}

function showFrStep(stepId) {
  for (const id of [
    "fr-welcome",
    "fr-workspace",
    "fr-provider",
    "fr-boot",
    "fr-ready",
  ]) {
    show(id, id === stepId);
  }
}

function markBootRows(state) {
  $("fr-st-gateway").textContent = state.running ? "● Funcionando" : "○ …";
  $("fr-st-node").textContent = state.bootReady
    ? "● Listo (boot)"
    : state.running
      ? "○ Arrancando…"
      : "○ —";
  $("fr-st-mcp").textContent = state.bootReady ? "● Listo (boot)" : "○ —";
  $("fr-st-tools").textContent = state.bootReady
    ? `● ${state.agentTools || "?"} (boot)`
    : "○ —";
  $("fr-st-workspace").textContent = state.workspaceRoot
    ? "● Configurado"
    : "○ —";
}

async function refresh() {
  const state = await window.desktopApi.getState();
  const needsFirst = !state.firstRunComplete || !state.workspaceRoot;
  show("first-run", needsFirst);
  show("main-panel", !needsFirst);
  if (needsFirst) {
    return;
  }

  $("status-badge").textContent = state.stateLabel;
  $("status-badge").className =
    "badge" +
    (state.state === "ERROR" ? " error" : state.state === "DEGRADED" ? " warn" : "");
  $("st-gateway").textContent = state.running ? "● Funcionando" : "○ Detenido";
  $("st-node").textContent = state.bootReady
    ? "● Arranque OK"
    : state.running
      ? "○ Arrancando…"
      : "○ —";
  $("st-mcp").textContent = state.bootReady ? "● Conectado (boot)" : "○ —";
  $("st-tools").textContent = state.bootReady
    ? `● ${state.agentTools || "?"} (boot)`
    : "○ —";
  $("st-workspace").textContent = state.workspaceRoot
    ? "● Configurado"
    : "○ Sin configurar";
}

$("fr-next-1").addEventListener("click", () => showFrStep("fr-workspace"));
$("fr-back-2").addEventListener("click", () => showFrStep("fr-welcome"));
$("fr-next-2").addEventListener("click", () => {
  if (!workspaceRoot) return;
  showFrStep("fr-provider");
});
$("fr-back-3").addEventListener("click", () => showFrStep("fr-workspace"));

$("btn-choose").addEventListener("click", async () => {
  const dir = await window.desktopApi.chooseWorkspace();
  if (!dir) return;
  workspaceRoot = dir;
  $("workspace-label").textContent = dir;
  $("fr-next-2").disabled = false;
});

$("fr-next-3").addEventListener("click", async () => {
  $("fr-provider-error").textContent = "";
  apiKeyDraft = $("api-key").value;
  const v = await window.desktopApi.validateConfig({
    workspaceRoot,
    anthropicApiKey: apiKeyDraft,
  });
  if (!v.ok) {
    $("fr-provider-error").textContent =
      v.errors.includes("api_key_required")
        ? "La clave de API es obligatoria."
        : v.errors.includes("workspace_inaccessible")
          ? "No se puede acceder a la carpeta."
          : "Revisa la configuración.";
    return;
  }

  showFrStep("fr-boot");
  $("fr-boot-msg").textContent = "Guardando e iniciando el Agent Host…";
  $("fr-boot-error").textContent = "";

  const saved = await window.desktopApi.completeFirstRun({
    workspaceRoot,
    anthropicApiKey: apiKeyDraft,
  });
  if (!saved.ok) {
    $("fr-boot-error").textContent = "No se pudo guardar la configuración.";
    return;
  }

  const started = await window.desktopApi.startAgent();
  if (!started.ok && !started.already) {
    $("fr-boot-error").textContent =
      "No se pudo iniciar el agente. Revisa Diagnostics / logs.";
    return;
  }

  for (let i = 0; i < 30; i++) {
    const state = await window.desktopApi.getState();
    markBootRows(state);
    if (state.bootReady || state.state === "READY") {
      showFrStep("fr-ready");
      return;
    }
    if (state.state === "ERROR") {
      $("fr-boot-error").textContent =
        state.lastError || "Error al arrancar.";
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const late = await window.desktopApi.getState();
  markBootRows(late);
  if (late.bootReady || late.state === "READY") {
    showFrStep("fr-ready");
  } else {
    $("fr-boot-error").textContent =
      "El arranque tarda más de lo esperado. Puedes abrir Diagnostics o reintentar Iniciar.";
  }
});

$("btn-open-console-fr").addEventListener("click", () =>
  window.desktopApi.openConsole(),
);
$("fr-done").addEventListener("click", async () => {
  show("first-run", false);
  show("main-panel", true);
  await refresh();
});

$("btn-console").addEventListener("click", () =>
  window.desktopApi.openConsole(),
);

$("btn-connect").addEventListener("click", async () => {
  const pairing = await window.desktopApi.getPairing();
  show("pairing", true);
  $("token-masked").textContent = pairing.tokenMasked;
  $("wifi-hint").textContent =
    pairing.wifiHint ||
    "Asegúrate de que ambos estén en la misma Wi‑Fi.";
  const ul = $("pairing-urls");
  ul.innerHTML = "";
  for (const url of pairing.urls.length
    ? pairing.urls
    : [`ws://127.0.0.1:${pairing.port}`]) {
    const li = document.createElement("li");
    li.textContent = url;
    ul.appendChild(li);
  }
  const cul = $("console-urls");
  cul.innerHTML = "";
  for (const url of pairing.consoleUrls || []) {
    const li = document.createElement("li");
    li.textContent = url;
    cul.appendChild(li);
  }
});

$("btn-copy-token").addEventListener("click", async () => {
  const { token } = await window.desktopApi.revealTokenOnce();
  await navigator.clipboard.writeText(token);
  $("action-msg").textContent = "Token copiado. No lo compartas.";
});

$("btn-restart").addEventListener("click", async () => {
  await window.desktopApi.restartAgent();
  $("action-msg").textContent = "Reiniciando…";
  await refresh();
});
$("btn-stop").addEventListener("click", async () => {
  await window.desktopApi.stopAgent();
  await refresh();
});
$("btn-start").addEventListener("click", async () => {
  await window.desktopApi.startAgent();
  await refresh();
});
$("btn-diag").addEventListener("click", async () => {
  await window.desktopApi.copyDiagnostics();
  $("action-msg").textContent = "Diagnóstico copiado (sin secretos).";
});
$("btn-logs").addEventListener("click", () => window.desktopApi.openLogs());

window.desktopApi.onState(() => {
  void refresh();
});
void refresh();
