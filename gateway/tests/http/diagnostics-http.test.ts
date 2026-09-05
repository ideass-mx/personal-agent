import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { Hono } from "hono";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-diag-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-diagnostics-placeholder";
process.env.HUB_TOKEN = "d".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_ID = "77777777-7777-4777-8777-777777777777";
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

const { createSqliteDiagnosticsStore } = await import(
  "../../src/diagnostics/store.ts"
);
const { mountDiagnosticsHttp } = await import(
  "../../src/http/diagnostics-http.ts"
);
const { mapAnthropicError } = await import("../../src/providers/anthropic.ts");

const HUB = process.env.HUB_TOKEN!;

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("diagnostics store and endpoint", () => {
  it("creates unique ids, sanitizes metadata, and retains only recent rows", () => {
    const store = createSqliteDiagnosticsStore();
    const seen = new Set<string>();
    for (let i = 0; i < 1005; i++) {
      const diagnosticId = store.createDiagnosticId();
      seen.add(diagnosticId);
      store.record({
        diagnosticId,
        component: "LLM_PROVIDER",
        stage: "LLM_REQUEST",
        level: "ERROR",
        event: "LLM_REQUEST_FAILED",
        errorCode: "LLM_REQUEST_FAILED",
        message: "Authorization: Bearer secret",
        metadata: {
          provider: "anthropic",
          apiKey: "sk-ant-secret",
          nested: { cookie: "abc", httpStatus: 500 },
        },
      });
    }
    assert.equal(seen.size, 1005);
    const recent = store.recent(1500);
    assert.equal(recent.length, 1000);
    assert.equal(JSON.stringify(recent).includes("sk-ant-secret"), false);
    assert.equal(JSON.stringify(recent).includes("Bearer secret"), false);
  });

  it("requires auth and returns safe rows", async () => {
    const store = createSqliteDiagnosticsStore();
    store.record({
      diagnosticId: "PA-TEST01",
      component: "AGENT_RUNTIME",
      stage: "AGENT_RUNTIME",
      level: "ERROR",
      event: "REQUEST_FAILED",
      errorCode: "AGENT_RUNTIME_FAILED",
      message: "boom",
      metadata: { provider: "anthropic" },
    });
    const app = new Hono();
    mountDiagnosticsHttp(app, { hubToken: HUB, diagnostics: store });

    const denied = await app.request("/v1/diagnostics/recent");
    assert.equal(denied.status, 401);

    const ok = await app.request("/v1/diagnostics/PA-TEST01", {
      headers: { Authorization: `Bearer ${HUB}` },
    });
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as { events: Array<{ diagnosticId: string }> };
    assert.equal(body.events[0]?.diagnosticId, "PA-TEST01");
  });
});

describe("Anthropic diagnostic mapping", () => {
  it("maps known provider failures to stable codes", () => {
    assert.equal(
      mapAnthropicError(
        { status: 401, error: { message: "unauthorized", type: "authentication_error" } },
        { diagnosticId: "PA-A", streamStarted: false, model: "claude-sonnet-4-6" },
      ).errorCode,
      "LLM_AUTH_FAILED",
    );
    assert.equal(
      mapAnthropicError(
        { status: 404, error: { message: "model missing", type: "not_found_error" } },
        { diagnosticId: "PA-B", streamStarted: false, model: "claude-sonnet-4-6" },
      ).errorCode,
      "LLM_MODEL_NOT_FOUND",
    );
    const invalid = mapAnthropicError(
      {
        status: 400,
        requestID: "req_123",
        name: "BadRequestError",
        error: {
          type: "error",
          error: {
            type: "invalid_request_error",
            message:
              "tools.0.custom.name: String should match pattern '^[a-zA-Z0-9_-]{1,64}$'",
          },
        },
      },
      { diagnosticId: "PA-BAD", streamStarted: false, model: "claude-sonnet-4-6" },
    );
    assert.equal(invalid.errorCode, "LLM_REQUEST_INVALID");
    assert.equal(invalid.httpStatus, 400);
    assert.equal(invalid.metadata?.providerErrorType, "invalid_request_error");
    assert.equal(invalid.metadata?.providerRequestId, "req_123");
    assert.match(String(invalid.metadata?.safeProviderMessage || ""), /tools\.0\.custom\.name/);
    assert.equal(
      mapAnthropicError(
        { status: 429, error: { message: "rate limit", type: "rate_limit_error" } },
        { diagnosticId: "PA-C", streamStarted: false, model: "claude-sonnet-4-6" },
      ).errorCode,
      "LLM_RATE_LIMITED",
    );
    assert.equal(
      mapAnthropicError(
        { code: "ETIMEDOUT", message: "request timed out" },
        { diagnosticId: "PA-D", streamStarted: false, model: "claude-sonnet-4-6" },
      ).errorCode,
      "LLM_TIMEOUT",
    );
    assert.equal(
      mapAnthropicError(
        { message: "stream reset" },
        { diagnosticId: "PA-E", streamStarted: true, model: "claude-sonnet-4-6" },
      ).errorCode,
      "LLM_STREAM_FAILED",
    );
  });
});

