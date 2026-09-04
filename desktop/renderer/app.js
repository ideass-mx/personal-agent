"use strict";

let workspaceRoot = null;
let apiKeyDraft = "";

const $ = (id) => document.getElementById(id);

const FR_STEPS = [
  "fr-welcome",
  "fr-preflight",
  "fr-network",
  "fr-network-ready",
  "fr-workspace",
  "fr-provider",
  "fr-boot",
  "fr-pairing",
  "fr-capabilities",
  "fr-security",
  "fr-ready",
];

function show(id, visible) {
  $(id).classList.toggle("hidden", !visible);
}

function showFrStep(stepId) {
  for (const id of FR_STEPS) {
    show(id, id === stepId);
  }
}

function mark(el, ok, text) {
  el.textContent = text || (ok ? "✓" : "○");
}

function markBootRows(state) {
  $("fr-st-gateway").textContent = state.running ? "✓" : "…";
  $("fr-st-node").textContent = state.bootReady
    ? "✓"
    : state.running
      ? "…"
      : "—";
  $("fr-st-mcp").textContent = state.firstRunComplete ? "✓" : "…";
  $("fr-st-identity").textContent = state.agentHostId ? "✓" : "…";
  $("fr-st-tools").textContent = state.bootReady
    ? `✓ ${state.agentTools || "?"}`
    : "—";
  $("fr-st-workspace").textContent = state.workspaceRoot ? "✓" : "—";
}

async function runPreflightStep() {
  showFrStep("fr-preflight");
  $("pf-error").textContent = "";
  $("pf-next").disabled = true;
  $("pf-msg").textContent = "Preparando red segura…";
  const pf = await window.desktopApi.runPreflight();
  const c = pf.checks;
  mark($("pf-os"), c.windows.ok, c.windows.ok ? "✓" : "✗");
  mark($("pf-arch"), c.architecture.ok, c.architecture.arch);
  mark(
    $("pf-admin"),
    true,
    c.administrator.isAdmin === true
      ? "✓ (opcional)"
      : c.administrator.isAdmin === false
        ? "○ no admin (OK)"
        : "—",
  );
  mark($("pf-net"), c.internet.ok, c.internet.ok ? "✓" : "✗");
  $("pf-scenario").textContent = pf.scenario.scenario;

  if (pf.blocking.includes("NO_DOWNGRADE")) {
    $("pf-error").textContent =
      "Hay una versión más nueva instalada. Este instalador no hará downgrade.";
    return;
  }
  if (!pf.ok && pf.blocking.includes("NO_INTERNET") && !pf.networkReady) {
    $("pf-error").textContent = "Sin conexión a Internet. Reintenta.";
    return;
  }
  $("pf-next").disabled = false;
  $("pf-msg").textContent = pf.networkReady
    ? "Red segura ya disponible."
    : "Siguiente: conectar red segura (Tailscale).";
}

async function refreshNetworkUi() {
  const ts = await window.desktopApi.getTailscaleStatus();
  if (ts.ready) {
    $("net-status").textContent = `Listo — ${ts.ipv4 || ts.selfDnsName || "conectado"}`;
    $("net-error").textContent = "";
  } else if (!ts.installed) {
    $("net-status").textContent = "Tailscale no está instalado.";
  } else if (!ts.authenticated) {
    $("net-status").textContent = "Instalado — falta autenticación.";
  } else {
    $("net-status").textContent = `Instalado — ${ts.backendState || "no conectado"}`;
  }
  return ts;
}

async function goNetworkOrReady() {
  const ts = await refreshNetworkUi();
  if (ts.ready) {
    const v = await window.desktopApi.verifySecureNetwork();
    if (v.ok) {
      showFrStep("fr-network-ready");
      return;
    }
  }
  showFrStep("fr-network");
}

async function resumeFromState(state) {
  const ob = state.onboarding || {};
  const st = ob.state;
  if (state.needsOnboarding === false && state.networkReady && state.firstRunComplete) {
    show("first-run", false);
    show("main-panel", true);
    return;
  }
  show("first-run", true);
  show("main-panel", false);

  if (st === "READY" && state.networkReady && state.firstRunComplete) {
    show("first-run", false);
    show("main-panel", true);
    return;
  }
  if (!st || st === "PREFLIGHT" || st === "ERROR") {
    if (st === "ERROR" && ob.lastErrorCode === "NO_DOWNGRADE") {
      showFrStep("fr-preflight");
      $("pf-error").textContent = ob.lastError || "NO_DOWNGRADE";
      return;
    }
    showFrStep("fr-welcome");
    return;
  }
  if (
    st === "NETWORK_INSTALLING" ||
    st === "NETWORK_AUTHENTICATION" ||
    st === "NETWORK_VERIFYING"
  ) {
    await goNetworkOrReady();
    return;
  }
  if (st === "NETWORK_READY") {
    showFrStep("fr-network-ready");
    return;
  }
  if (
    st === "AGENT_PROVISIONING" ||
    st === "AGENT_INSTALLING" ||
    st === "AGENT_INITIALIZING" ||
    st === "AGENT_READY"
  ) {
    if (!state.workspaceRoot) {
      showFrStep("fr-workspace");
    } else if (!state.anthropicApiKeySet && st !== "AGENT_READY") {
      showFrStep("fr-provider");
    } else if (st === "AGENT_READY") {
      showFrStep("fr-pairing");
      await loadPairingIntoFr();
    } else {
      showFrStep("fr-boot");
    }
    return;
  }
  if (st === "PAIRING") {
    showFrStep("fr-pairing");
    await loadPairingIntoFr();
    return;
  }
  if (st === "CONFIGURING") {
    showFrStep("fr-capabilities");
    await loadCapabilities();
    return;
  }
  showFrStep("fr-welcome");
}

let pairingPollTimer = null;

function stopPairingPoll() {
  if (pairingPollTimer) {
    clearInterval(pairingPollTimer);
    pairingPollTimer = null;
  }
}

async function loadPairingIntoFr() {
  stopPairingPoll();
  $("pair-error").textContent = "";
  $("pair-done").disabled = true;
  show("pair-confirm", false);
  const created = await window.desktopApi.beginPairing();
  if (!created.ok) {
    $("pair-error").textContent = created.message || "No se pudo crear el QR.";
    return;
  }
  if (created.containsHubToken) {
    $("pair-error").textContent = "Seguridad: el QR no debe contener HUB_TOKEN.";
    return;
  }
  const img = $("pair-qr");
  img.src = created.qrDataUrl;
  img.classList.remove("hidden");
  $("pair-hint").textContent = "Escanea con Android. El secreto es temporal y de un solo uso.";
  $("pair-ttl").textContent = created.expiresAt
    ? `Expira: ${created.expiresAt}`
    : "Expira en 5:00";
  $("pair-wait").textContent = "Waiting for your phone…";
  pairingPollTimer = setInterval(async () => {
    const p = await window.desktopApi.pollPairing();
    if (!p.ok) return;
    if (p.substatus === "CONFIRMING") {
      show("pair-confirm", true);
      $("pair-device-name").textContent = p.deviceName || p.deviceId || "Device";
      $("pair-wait").textContent = "Waiting for confirmation…";
    }
    if (p.substatus === "APPROVED") {
      stopPairingPoll();
      $("pair-wait").textContent = "Dispositivo conectado.";
      $("pair-done").disabled = false;
      show("pair-confirm", false);
    }
    if (p.substatus === "EXPIRED" || p.substatus === "REJECTED") {
      $("pair-wait").textContent = p.substatus === "EXPIRED"
        ? "El QR expiró. Genera uno nuevo."
        : "Emparejamiento rechazado.";
    }
  }, 1500);
}

async function loadCapabilities() {
  const caps = await window.desktopApi.getCapabilitiesSummary();
  const ul = $("cap-list");
  ul.innerHTML = "";
  for (const c of caps.capabilities || []) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${c.label}</span><strong>${c.status}</strong>`;
    ul.appendChild(li);
  }
}

async function refreshMain(state) {
  $("status-badge").textContent = state.stateLabel;
  $("status-badge").className =
    "badge" +
    (state.state === "ERROR"
      ? " error"
      : state.state === "DEGRADED" || state.state === "WAITING_NETWORK"
        ? " warn"
        : "");
  $("onboarding-badge").textContent = state.onboarding
    ? `Onboarding: ${state.onboarding.state} · ${state.scenario || ""}`
    : "";
  $("st-network").textContent = state.networkReady ? "● Conectada" : "○ Pendiente";
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

async function refresh() {
  const state = await window.desktopApi.getState();
  if (state.needsOnboarding) {
    await resumeFromState(state);
    return;
  }
  show("first-run", false);
  show("main-panel", true);
  await refreshMain(state);
}

$("fr-begin").addEventListener("click", () => {
  void runPreflightStep();
});
$("pf-retry").addEventListener("click", () => {
  void runPreflightStep();
});
$("pf-next").addEventListener("click", () => {
  void goNetworkOrReady();
});

$("net-download").addEventListener("click", async () => {
  await window.desktopApi.openTailscaleDownload();
  $("net-status").textContent =
    "Abre el instalador de Tailscale, completa la instalación y pulsa Verificar.";
});
$("net-login").addEventListener("click", async () => {
  $("net-error").textContent = "";
  const r = await window.desktopApi.startTailscaleLogin();
  if (!r.ok) {
    $("net-error").textContent =
      "No se pudo iniciar el login de Tailscale. Ábrelo desde la bandeja del sistema.";
  } else {
    $("net-status").textContent = "Completa el inicio de sesión y pulsa Verificar.";
  }
});
$("net-verify").addEventListener("click", async () => {
  $("net-error").textContent = "";
  const v = await window.desktopApi.verifySecureNetwork();
  if (!v.ok) {
    $("net-error").textContent =
      v.message || "La red segura no está lista todavía.";
    await refreshNetworkUi();
    return;
  }
  showFrStep("fr-network-ready");
});
$("net-ready-next").addEventListener("click", () => showFrStep("fr-workspace"));

$("fr-back-ws").addEventListener("click", () => showFrStep("fr-network-ready"));
$("fr-next-ws").addEventListener("click", () => {
  if (!workspaceRoot) return;
  showFrStep("fr-provider");
});
$("btn-choose").addEventListener("click", async () => {
  const dir = await window.desktopApi.chooseWorkspace();
  if (!dir) return;
  workspaceRoot = dir;
  $("workspace-label").textContent = dir;
  $("fr-next-ws").disabled = false;
});

$("fr-back-prov").addEventListener("click", () => showFrStep("fr-workspace"));
$("fr-next-prov").addEventListener("click", async () => {
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
          : v.errors.includes("NETWORK_NOT_READY")
            ? "La red segura debe estar lista primero."
            : "Revisa la configuración.";
    return;
  }

  showFrStep("fr-boot");
  $("fr-boot-msg").textContent = "Agent is starting…";
  $("fr-boot-error").textContent = "";

  const saved = await window.desktopApi.completeFirstRun({
    workspaceRoot,
    anthropicApiKey: apiKeyDraft,
  });
  if (!saved.ok) {
    $("fr-boot-error").textContent =
      saved.error === "NETWORK_NOT_READY"
        ? "La red segura debe estar lista antes de instalar el Agent."
        : "No se pudo guardar la configuración.";
    return;
  }
  $("fr-st-identity").textContent = saved.identityCreated
    ? "✓ nueva"
    : "✓ reutilizada";

  const started = await window.desktopApi.startAgent();
  if (!started.ok && !started.already) {
    $("fr-boot-error").textContent =
      started.message ||
      "No se pudo iniciar el agente. Revisa Diagnostics / logs.";
    return;
  }

  for (let i = 0; i < 30; i++) {
    const state = await window.desktopApi.getState();
    markBootRows(state);
    if (state.bootReady || state.onboarding?.state === "AGENT_READY") {
      showFrStep("fr-pairing");
      await loadPairingIntoFr();
      return;
    }
    if (state.state === "ERROR" || state.onboarding?.state === "ERROR") {
      $("fr-boot-error").textContent =
        state.onboarding?.lastError || state.lastError || "Error al arrancar.";
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  $("fr-boot-error").textContent =
    "El arranque tarda más de lo esperado. Puedes abrir Diagnostics o reintentar.";
});

$("pair-refresh").addEventListener("click", () => {
  void loadPairingIntoFr();
});
$("pair-approve").addEventListener("click", async () => {
  const r = await window.desktopApi.approvePairing();
  if (!r.ok) {
    $("pair-error").textContent = "No se pudo aprobar.";
    return;
  }
  $("pair-wait").textContent = "Dispositivo conectado.";
  $("pair-done").disabled = false;
  show("pair-confirm", false);
});
$("pair-reject").addEventListener("click", async () => {
  await window.desktopApi.rejectPairing();
  $("pair-wait").textContent = "Emparejamiento rechazado. Puedes generar otro QR.";
  show("pair-confirm", false);
});
$("pair-skip").addEventListener("click", async () => {
  stopPairingPoll();
  await window.desktopApi.confirmPairingOrSkip({ skip: true });
  showFrStep("fr-capabilities");
  await loadCapabilities();
});
$("pair-done").addEventListener("click", async () => {
  stopPairingPoll();
  $("pair-error").textContent = "";
  const r = await window.desktopApi.confirmPairingOrSkip({ skip: false });
  if (!r.ok) {
    $("pair-error").textContent = "Aprueba el dispositivo antes de continuar, o usa Más tarde.";
    return;
  }
  showFrStep("fr-capabilities");
  await loadCapabilities();
});

$("cap-next").addEventListener("click", async () => {
  const state = await window.desktopApi.getState();
  $("sec-net").textContent = state.networkReady ? "✓" : "✗";
  $("sec-id").textContent = state.agentHostId ? "✓" : "✗";
  $("sec-pair").textContent = state.pairingAuthPresent ? "✓ auth" : "○ pendiente";
  $("sec-rt").textContent = state.bootReady || state.running ? "✓" : "○";
  showFrStep("fr-security");
});

$("sec-next").addEventListener("click", async () => {
  const r = await window.desktopApi.completeOnboarding();
  if (!r.ok) {
    $("action-msg").textContent = "No se pudo cerrar el onboarding.";
    return;
  }
  const state = await window.desktopApi.getState();
  $("ready-android").textContent =
    (state.devices || []).length > 0 ? "● Connected" : "○ Pair later";
  showFrStep("fr-ready");
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
    pairing.wifiHint || "Preferible: red Tailscale.";
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
  const r = await window.desktopApi.startAgent();
  if (!r.ok && !r.already) {
    $("action-msg").textContent =
      r.message || "No se pudo iniciar (¿red segura lista?).";
  }
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
