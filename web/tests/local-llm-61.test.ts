/**
 * PHASE 61 — onboarding local-first (sin API key en camino crítico).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stepFromStatus } from "../src/features/setup/setup-flow.ts";

describe("PHASE 61 setup flow local-first", () => {
  it("AGENT_READY sin LLM → hardware (modelo local)", () => {
    const step = stepFromStatus({
      state: "AGENT_READY",
      installationReady: true,
      llmConfigured: false,
      verified: false,
      onboardingCompleted: false,
      llmProvider: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: null,
    });
    assert.equal(step, "hardware");
  });

  it("READY con llmConfigured → done", () => {
    const step = stepFromStatus({
      state: "READY",
      installationReady: true,
      llmConfigured: true,
      verified: true,
      onboardingCompleted: true,
      llmProvider: "local",
      lastErrorCode: null,
      lastErrorMessage: null,
      updatedAt: null,
    });
    assert.equal(step, "done");
  });
});
