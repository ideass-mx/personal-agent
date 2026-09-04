"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function withTempData(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pa-onb-"));
  const prev = process.env.PERSONAL_AGENT_DATA_DIR;
  process.env.PERSONAL_AGENT_DATA_DIR = dir;
  for (const rel of [
    "../lib/config.cjs",
    "../lib/onboarding.cjs",
    "../lib/agent-identity.cjs",
    "../lib/install-scenario.cjs",
    "../lib/preflight.cjs",
    "../lib/tailscale.cjs",
    "../lib/onboarding-log.cjs",
    "../lib/pairing.cjs",
  ]) {
    delete require.cache[require.resolve(rel)];
  }
  try {
    return fn(dir);
  } finally {
    if (prev === undefined) delete process.env.PERSONAL_AGENT_DATA_DIR;
    else process.env.PERSONAL_AGENT_DATA_DIR = prev;
  }
}

function execStatus(json, whichOk = true) {
  return (cmd, args) => {
    if (cmd === "which" || cmd === "where") {
      return {
        status: whichOk ? 0 : 1,
        stdout: whichOk ? "/usr/bin/tailscale" : "",
        stderr: "",
      };
    }
    if (args && args[0] === "status") {
      return {
        status: 0,
        stdout: typeof json === "string" ? json : JSON.stringify(json),
        stderr: "",
      };
    }
    return { status: 1, stdout: "", stderr: "" };
  };
}

test("onboarding state persists and recovers", () => {
  withTempData(() => {
    const ob = require("../lib/onboarding.cjs");
    const a = ob.setOnboardingState(ob.OnboardingState.NETWORK_VERIFYING, {
      scenario: "RECOVERY",
    });
    assert.equal(a.state, "NETWORK_VERIFYING");
    delete require.cache[require.resolve("../lib/onboarding.cjs")];
    const again = require("../lib/onboarding.cjs").loadOnboarding();
    assert.equal(again.state, "NETWORK_VERIFYING");
    assert.equal(again.scenario, "RECOVERY");
  });
});

test("AGENT_PROVISIONING replaces AGENT_INSTALLING; legacy migrates", () => {
  withTempData(() => {
    const ob = require("../lib/onboarding.cjs");
    assert.equal(ob.OnboardingState.AGENT_PROVISIONING, "AGENT_PROVISIONING");
    assert.equal(ob.OnboardingState.AGENT_INSTALLING, undefined);
    assert.ok(ob.STAGE_ORDER.includes("AGENT_PROVISIONING"));
    assert.ok(!ob.STAGE_ORDER.includes("AGENT_INSTALLING"));

    const file = ob.onboardingFile();
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          version: 1,
          state: "AGENT_INSTALLING",
          scenario: "RECOVERY",
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
    const loaded = ob.loadOnboarding();
    assert.equal(loaded.state, "AGENT_PROVISIONING");
    const disk = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(disk.state, "AGENT_PROVISIONING");
  });
});

test("canStartAgentRuntime requires NETWORK_READY or later AND networkReady", () => {
  withTempData(() => {
    const ob = require("../lib/onboarding.cjs");
    ob.setOnboardingState(ob.OnboardingState.PREFLIGHT);
    assert.equal(ob.canStartAgentRuntime(undefined, { networkReady: true }), false);
    assert.equal(
      ob.canStartAgentRuntime(undefined, { networkReady: false }),
      false,
    );
    ob.setOnboardingState(ob.OnboardingState.NETWORK_READY);
    assert.equal(ob.canStartAgentRuntime(undefined, { networkReady: true }), true);
    assert.equal(
      ob.canStartAgentRuntime(undefined, { networkReady: false }),
      false,
    );
    ob.setOnboardingState(ob.OnboardingState.AGENT_PROVISIONING);
    assert.equal(ob.canStartAgentRuntime(undefined, { networkReady: true }), true);
  });
});

test("AUTH_REQUIRED blocks Agent provisioning gate", () => {
  withTempData(() => {
    const ob = require("../lib/onboarding.cjs");
    ob.setOnboardingState(ob.OnboardingState.NETWORK_AUTHENTICATION);
    assert.equal(
      ob.canStartAgentRuntime(undefined, { networkReady: false }),
      false,
    );
  });
});

test("agent host identity is created once and reused", () => {
  withTempData(() => {
    const id = require("../lib/agent-identity.cjs");
    const first = id.ensureAgentHostId();
    assert.equal(first.created, true);
    const second = id.ensureAgentHostId();
    assert.equal(second.created, false);
    assert.equal(second.id, first.id);
  });
});

test("Existing HUB_TOKEN is preserved via pairing boundary", () => {
  withTempData(() => {
    const cfg = require("../lib/config.cjs");
    const pairing = require("../lib/pairing.cjs");
    const token = cfg.ensureHubToken();
    const again = pairing.preserveExistingPairing();
    assert.equal(again.preserved, true);
    assert.equal(again.created, false);
    const ensured = pairing.ensurePairingCredentials();
    assert.equal(ensured.created, false);
    assert.equal(ensured.token, token);
    assert.equal(cfg.getHubToken(), token);
  });
});

test("install scenario NEW vs UPDATE vs NO_DOWNGRADE", () => {
  withTempData((dir) => {
    const { classifyInstallScenario, InstallScenario } = require("../lib/install-scenario.cjs");
    const fresh = classifyInstallScenario({
      productRoot: null,
      onboardingState: null,
    });
    assert.equal(fresh.scenario, InstallScenario.NEW);

    const cfg = require("../lib/config.cjs");
    const c = cfg.loadConfig();
    c.firstRunComplete = true;
    c.workspaceRoot = path.join(dir, "ws");
    fs.mkdirSync(c.workspaceRoot, { recursive: true });
    cfg.saveConfig(c);
    require("../lib/pairing.cjs").ensurePairingCredentials();
    require("../lib/agent-identity.cjs").ensureAgentHostId();

    const update = classifyInstallScenario({
      productRoot: null,
      onboardingState: "READY",
    });
    assert.equal(update.scenario, InstallScenario.UPDATE);
    assert.equal(update.preservePairing, true);
    assert.equal(update.preserveIdentity, true);

    const product = path.join(dir, "product");
    fs.mkdirSync(product, { recursive: true });
    fs.writeFileSync(path.join(product, "VERSION"), "9.9.9-phase99\n");
    const nodl = classifyInstallScenario({
      productRoot: product,
      onboardingState: "READY",
      installerVersion: "0.1.0",
    });
    assert.equal(nodl.scenario, InstallScenario.NO_DOWNGRADE);
  });
});

test("tailscale: executable exists but backend not Running → NOT READY", () => {
  const { probeTailscale, TailscalePhase } = require("../lib/tailscale.cjs");
  const prev = process.env.PERSONAL_AGENT_SKIP_TAILSCALE;
  delete process.env.PERSONAL_AGENT_SKIP_TAILSCALE;
  const r = probeTailscale({
    isDevelopment: false,
    exec: execStatus({
      BackendState: "Stopped",
      Self: { DNSName: "pc.ts.net.", TailscaleIPs: ["100.64.0.1"] },
    }),
  });
  assert.notEqual(r.phase, TailscalePhase.READY);
  assert.equal(r.ready, false);
  if (prev !== undefined) process.env.PERSONAL_AGENT_SKIP_TAILSCALE = prev;
});

test("tailscale: authenticated Running but no Tailscale IP → CONNECTED not READY", () => {
  const { probeTailscale, TailscalePhase } = require("../lib/tailscale.cjs");
  const prev = process.env.PERSONAL_AGENT_SKIP_TAILSCALE;
  delete process.env.PERSONAL_AGENT_SKIP_TAILSCALE;
  const r = probeTailscale({
    isDevelopment: false,
    exec: execStatus({
      BackendState: "Running",
      Self: { DNSName: "pc.ts.net.", TailscaleIPs: [] },
      CurrentTailnet: { Name: "example.ts.net" },
    }),
  });
  assert.equal(r.phase, TailscalePhase.CONNECTED);
  assert.equal(r.ready, false);
  assert.equal(r.connected, true);
  if (prev !== undefined) process.env.PERSONAL_AGENT_SKIP_TAILSCALE = prev;
});

test("tailscale READY requires Running + Self + address", () => {
  const { probeTailscale, TailscalePhase } = require("../lib/tailscale.cjs");
  const prev = process.env.PERSONAL_AGENT_SKIP_TAILSCALE;
  delete process.env.PERSONAL_AGENT_SKIP_TAILSCALE;
  const ready = probeTailscale({
    isDevelopment: false,
    exec: execStatus({
      BackendState: "Running",
      Self: { DNSName: "pc.tailnet.ts.net.", TailscaleIPs: ["100.64.0.1"] },
      CurrentTailnet: { Name: "example.ts.net" },
    }),
  });
  assert.equal(ready.phase, TailscalePhase.READY);
  assert.equal(ready.ready, true);
  assert.equal(ready.ipv4, "100.64.0.1");

  const missing = probeTailscale({
    isDevelopment: false,
    exec: execStatus({}, false),
  });
  assert.equal(missing.phase, TailscalePhase.MISSING);
  if (prev !== undefined) process.env.PERSONAL_AGENT_SKIP_TAILSCALE = prev;
});

test("production + PERSONAL_AGENT_SKIP_TAILSCALE=1 → NO bypass", () => {
  const { probeTailscale, TailscalePhase, canSkipTailscale } = require("../lib/tailscale.cjs");
  const prevSkip = process.env.PERSONAL_AGENT_SKIP_TAILSCALE;
  const prevNode = process.env.NODE_ENV;
  process.env.PERSONAL_AGENT_SKIP_TAILSCALE = "1";
  assert.equal(canSkipTailscale({ isDevelopment: false }), false);
  const r = probeTailscale({
    isDevelopment: false,
    exec: execStatus({}, false),
  });
  assert.equal(r.skipped, false);
  assert.equal(r.phase, TailscalePhase.MISSING);
  assert.equal(r.ready, false);

  process.env.NODE_ENV = "production";
  assert.equal(canSkipTailscale({}), false);
  if (prevSkip === undefined) delete process.env.PERSONAL_AGENT_SKIP_TAILSCALE;
  else process.env.PERSONAL_AGENT_SKIP_TAILSCALE = prevSkip;
  if (prevNode === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = prevNode;
});

test("dev skip still works when isDevelopment", () => {
  const { probeTailscale, canSkipTailscale } = require("../lib/tailscale.cjs");
  const prev = process.env.PERSONAL_AGENT_SKIP_TAILSCALE;
  process.env.PERSONAL_AGENT_SKIP_TAILSCALE = "1";
  assert.equal(canSkipTailscale({ isDevelopment: true }), true);
  const r = probeTailscale({ isDevelopment: true });
  assert.equal(r.skipped, true);
  assert.equal(r.ready, true);
  if (prev === undefined) delete process.env.PERSONAL_AGENT_SKIP_TAILSCALE;
  else process.env.PERSONAL_AGENT_SKIP_TAILSCALE = prev;
});

test("mapAgentState waits on network", () => {
  const { mapAgentState, AgentUiState } = require("../lib/states.cjs");
  assert.equal(
    mapAgentState({
      workspaceConfigured: true,
      processRunning: true,
      bootReady: true,
      healthOk: true,
      networkReady: false,
    }),
    AgentUiState.WAITING_NETWORK,
  );
});

test("onboarding log redacts secrets", () => {
  withTempData(() => {
    const { redact } = require("../lib/onboarding-log.cjs");
    const out = redact({
      HUB_TOKEN: "supersecrettokenvalue",
      stage: "PREFLIGHT",
    });
    assert.equal(out.HUB_TOKEN, "[redacted]");
    assert.equal(out.stage, "PREFLIGHT");
  });
});

test("RECOVERY when incomplete onboarding state", () => {
  withTempData(() => {
    require("../lib/pairing.cjs").ensurePairingCredentials();
    const { classifyInstallScenario, InstallScenario } = require("../lib/install-scenario.cjs");
    const r = classifyInstallScenario({
      productRoot: null,
      onboardingState: "NETWORK_READY",
    });
    assert.equal(r.scenario, InstallScenario.RECOVERY);
  });
});
