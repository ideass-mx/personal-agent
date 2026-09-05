import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { fetchRecentDiagnostics } from "../src/api/diagnostics.ts";
import {
  buildDiagnosticClipboardText,
  formatDiagnosticDetails,
  friendlyChatError,
} from "../src/lib/diagnostics.ts";
import type { DiagnosticInfo, HealthSnapshot } from "../src/types.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const diagnostic: DiagnosticInfo = {
  diagnosticId: "PA-7F42C1",
  component: "LLM_PROVIDER",
  stage: "LLM_REQUEST",
  errorCode: "LLM_REQUEST_INVALID",
  timestamp: "2026-09-04T22:14:02.019Z",
  provider: "anthropic",
  httpStatus: 400,
  providerErrorType: "invalid_request_error",
  providerRequestId: "req_123",
  safeMessage:
    "tools.0.custom.name: String should match pattern '^[a-zA-Z0-9_-]{1,64}$'",
  model: "claude-sonnet-4-6",
};

describe("web diagnostics helpers", () => {
  it("keeps chat error friendly and formats safe details", () => {
    assert.match(friendlyChatError(), /No pude generar la respuesta/i);
    const details = formatDiagnosticDetails(diagnostic);
    assert.match(details, /LLM_REQUEST_INVALID/);
    assert.match(details, /PA-7F42C1/);
    assert.match(details, /invalid_request_error/);
    assert.match(details, /req_123/);
    assert.equal(/api key|authorization|cookie|token/i.test(details), false);
  });

  it("builds compact diagnostic clipboard text", () => {
    const health: HealthSnapshot = {
      ok: true,
      devices: [],
      agentReady: true,
      agentTools: [],
      version: "0.7.0",
      platform: "win32",
      architecture: "x64",
    };
    const text = buildDiagnosticClipboardText(diagnostic, health);
    assert.match(text, /Personal Agent Diagnostic/);
    assert.match(text, /ID: PA-7F42C1/);
    assert.match(text, /HTTP: 400/);
    assert.match(text, /Provider Error Type: invalid_request_error/);
    assert.match(text, /Provider Request ID: req_123/);
    assert.equal(/api key|authorization|cookie|token/i.test(text), false);
  });
});

describe("diagnostics API client", () => {
  it("loads recent diagnostics", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          ok: true,
          events: [
            {
              timestamp: "2026-09-04T22:14:02.019Z",
              diagnosticId: "PA-7F42C1",
              requestId: "PA-7F42C1",
              component: "LLM_PROVIDER",
              stage: "LLM_REQUEST",
              level: "ERROR",
              event: "LLM_AUTH_FAILED",
              errorCode: "LLM_AUTH_FAILED",
              message: "unauthorized",
              durationMs: 120,
              metadata: { provider: "anthropic" },
            },
          ],
        }),
        { status: 200 },
      )) as typeof fetch;
    const rows = await fetchRecentDiagnostics("http://x", "t".repeat(32));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.diagnosticId, "PA-7F42C1");
  });
});

