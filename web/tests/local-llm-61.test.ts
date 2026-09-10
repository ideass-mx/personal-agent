/**
 * PHASE 61 / 62 — onboarding: elegir inteligencia (Local o Cloud).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stepFromStatus } from "../src/features/setup/setup-flow.ts";

describe("PHASE 61 setup flow local-first", () => {
  it("AGENT_READY sin LLM → llm_intro (elegir cómo piensa el agente)", () => {
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
    assert.equal(step, "llm_intro");
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
