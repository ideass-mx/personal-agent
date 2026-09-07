/**
 * Web setup / onboarding — Fase 5–6 helpers + API client.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  isApplicationReadyForChat,
  isLlmConfigured,
  isProviderSelectable,
  providerComingSoonLabel,
  responseLooksLikeSecretLeak,
  stepFromStatus,
  USER_PLAN_LABEL,
} from "../src/features/setup/setup-flow.ts";
import type { SetupStatusDto } from "../src/types.ts";
import {
  configureSetupLlm,
  fetchSetupProviders,
  fetchSetupStatus,
  verifySetup,
} from "../src/api/setup.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function dto(partial: Partial<SetupStatusDto>): SetupStatusDto {
  return {
    ok: true,
    state: "AGENT_READY",
    installationReady: true,
    llmConfigured: false,
    verified: false,
    onboardingCompleted: false,
    llmProvider: null,
    lastError: null,
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

describe("setup-flow", () => {
  it("AGENT_READY renders onboarding agent_ready step", () => {
    assert.equal(stepFromStatus(dto({ state: "AGENT_READY" })), "agent_ready");
  });

  it("READY opens done only when llmConfigured", () => {
    assert.equal(
      stepFromStatus(
        dto({
          state: "READY",
          onboardingCompleted: true,
          llmConfigured: true,
          verified: true,
        }),
      ),
      "done",
    );
  });

  it("F/G/H matrix: profile vs llm gates (application ready)", () => {
    // F: profile incomplete + llm false → not chat-ready (profile gated in App)
    assert.equal(
      isApplicationReadyForChat(
        dto({ llmConfigured: false, state: "AGENT_READY" }),
      ),
      false,
    );
    // G: profile complete + llm false → LLM config (not chat)
    assert.equal(
      isApplicationReadyForChat(
        dto({ llmConfigured: false, state: "LLM_REQUIRED" }),
      ),
      false,
    );
    assert.equal(
      stepFromStatus(
        dto({
          state: "READY",
          onboardingCompleted: true,
          llmConfigured: false,
        }),
      ),
      "llm_intro",
    );
    // H: both complete → chat
    assert.equal(
      isApplicationReadyForChat(
        dto({ llmConfigured: true, state: "READY", onboardingCompleted: true }),
      ),
      true,
    );
  });

  it("READY without llmConfigured forces llm_intro (stale after uninstall)", () => {
    assert.equal(
      stepFromStatus(
        dto({
          state: "READY",
          onboardingCompleted: true,
          llmConfigured: false,
          verified: true,
        }),
      ),
      "llm_intro",
    );
  });

  it("profile/llm matrix via isApplicationReadyForChat", () => {
    assert.equal(isLlmConfigured(dto({ llmConfigured: false })), false);
    assert.equal(isLlmConfigured(dto({ llmConfigured: true })), true);
    assert.equal(
      isApplicationReadyForChat(dto({ llmConfigured: false, state: "READY" })),
      false,
    );
    assert.equal(
      isApplicationReadyForChat(dto({ llmConfigured: true, state: "READY" })),
      true,
    );
  });

  it("reload preserves mid-flow via status", () => {
    assert.equal(
      stepFromStatus(dto({ state: "LLM_REQUIRED" })),
      "llm_intro",
    );
    assert.equal(
      stepFromStatus(dto({ state: "LLM_CONNECTED", llmConfigured: true })),
      "verifying",
    );
    assert.equal(
      stepFromStatus(dto({ state: "VERIFICATION_ERROR", llmConfigured: true })),
      "verifying",
    );
  });

  it("Anthropic selectable; unavailable not selectable", () => {
    assert.equal(
      isProviderSelectable({ id: "anthropic", name: "Anthropic", available: true }),
      true,
    );
    assert.equal(
      isProviderSelectable({ id: "openai", name: "OpenAI", available: false }),
      false,
    );
    assert.equal(
      providerComingSoonLabel({
        id: "google",
        name: "Google",
        available: false,
      }),
      "Próximamente",
    );
  });

  it("detects secret leaks", () => {
    assert.equal(responseLooksLikeSecretLeak('{"state":"READY"}'), false);
    assert.equal(
      responseLooksLikeSecretLeak('{"credential":"sk-ant-secret"}'),
      true,
    );
  });

  it("USER_PLAN_LABEL is Plan Personal", () => {
    assert.equal(USER_PLAN_LABEL, "Plan Personal");
  });
});

describe("setup API client", () => {
  it("loads provider list", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          providers: [
            { id: "anthropic", name: "Anthropic", available: true },
            { id: "openai", name: "OpenAI", available: false },
          ],
        }),
        { status: 200 },
      )) as typeof fetch;
    const list = await fetchSetupProviders("http://x", "t".repeat(32));
    assert.equal(list.length, 2);
    assert.equal(list[0].available, true);
  });

  it("credential submission never echoes secret in typed result", async () => {
    const secret = "sk-ant-client-secret-zzzz";
    globalThis.fetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body || "{}")) as {
        credential?: string;
      };
      assert.equal(body.credential, secret);
      return new Response(
        JSON.stringify(
          dto({
            state: "LLM_CONNECTED",
            llmConfigured: true,
            llmProvider: "anthropic",
          }),
        ),
        { status: 200 },
      );
    }) as typeof fetch;
    const res = await configureSetupLlm("http://x", "t".repeat(32), {
      provider: "anthropic",
      credential: secret,
    });
    assert.equal(JSON.stringify(res).includes(secret), false);
  });

  it("credential errors surface human message", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "invalid_credential",
            message: "La clave no parece válida.",
          },
        }),
        { status: 400 },
      )) as typeof fetch;
    await assert.rejects(
      () =>
        configureSetupLlm("http://x", "t".repeat(32), {
          provider: "anthropic",
          credential: "too-short-but-sent",
        }),
      /válida/i,
    );
  });

  it("verification success and failure", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify(
          dto({
            state: "VERIFIED",
            llmConfigured: true,
            verified: true,
          }),
        ),
        { status: 200 },
      )) as typeof fetch;
    const ok = await verifySetup("http://x", "t".repeat(32));
    assert.equal(ok.state, "VERIFIED");

    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "verification_failed",
            message:
              "No pudimos conectar con tu proveedor de IA. Revisa la clave e inténtalo de nuevo.",
          },
        }),
        { status: 400 },
      )) as typeof fetch;
    await assert.rejects(() => verifySetup("http://x", "t".repeat(32)), /proveedor/i);
  });

  it("status fetch for AGENT_READY", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(dto({ state: "AGENT_READY" })), {
        status: 200,
      })) as typeof fetch;
    const s = await fetchSetupStatus("http://x", "t".repeat(32));
    assert.equal(s.state, "AGENT_READY");
    assert.equal(s.installationReady, true);
  });
});
