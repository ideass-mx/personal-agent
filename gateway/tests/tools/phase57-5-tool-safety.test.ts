/**
 * PHASE 57.5 — Tool Safety Policy tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TOOL_POLICY } from "../../src/tools/policy.ts";
import {
  evaluateToolSafety,
  toolSafetyDeniedResult,
  toolSafetyDiagnosticMetadata,
} from "../../src/tools/safety.ts";
import { createConfirmationWaiter } from "../../src/sessions/confirmation-waiter.ts";
import type { UserContext } from "../../src/identity/types.ts";

const ownerCtx: UserContext = {
  userId: "local-user",
  agentId: "personal-agent",
  sessionId: "as_test",
  deviceId: "dev-pc",
  authKind: "device",
};

describe("PHASE 57.5 Tool Safety Policy", () => {
  it("ALLOWED for read / automatic tools", () => {
    const ev = evaluateToolSafety({
      toolName: "filesystem.read",
      policy: DEFAULT_TOOL_POLICY,
      executionMode: "automatic",
      userContext: ownerCtx,
    });
    assert.equal(ev.decision, "ALLOWED");
    assert.equal(ev.reason, "policy_automatic");
  });

  it("CONFIRMATION_REQUIRED for write / process tools", () => {
    for (const name of [
      "filesystem.write",
      "process.execute",
      "office.excel.write",
    ] as const) {
      const ev = evaluateToolSafety({
        toolName: name,
        policy: DEFAULT_TOOL_POLICY,
        executionMode: "confirm",
        userContext: ownerCtx,
      });
      assert.equal(ev.decision, "CONFIRMATION_REQUIRED", name);
    }
  });

  it("DENIED for unknown / omitted tools (fail-closed)", () => {
    const ev = evaluateToolSafety({
      toolName: "customer.test",
      policy: DEFAULT_TOOL_POLICY,
      userContext: ownerCtx,
    });
    assert.equal(ev.decision, "DENIED");
    assert.equal(ev.reason, "unknown_tool_deny_by_default");
    const result = toolSafetyDeniedResult(ev, false);
    assert.equal(result.error.code, "tool_not_found");
  });

  it("Policy receives UserContext but deviceId does not change authority", () => {
    const a = evaluateToolSafety({
      toolName: "filesystem.write",
      policy: DEFAULT_TOOL_POLICY,
      executionMode: "confirm",
      userContext: { ...ownerCtx, deviceId: "phone" },
    });
    const b = evaluateToolSafety({
      toolName: "filesystem.write",
      policy: DEFAULT_TOOL_POLICY,
      executionMode: "confirm",
      userContext: { ...ownerCtx, deviceId: "laptop" },
    });
    assert.equal(a.decision, b.decision);
    assert.equal(a.reason, b.reason);
  });

  it("Policy does not use HUB_TOKEN as identity", () => {
    const hub = "hub-token-not-an-identity!!!!!!!!!!!";
    const ev = evaluateToolSafety({
      toolName: "math.add",
      policy: DEFAULT_TOOL_POLICY,
      executionMode: "automatic",
      userContext: {
        userId: "local-user",
        agentId: "personal-agent",
        authKind: "install_compat",
        sessionId: "as_1",
      },
    });
    assert.equal(ev.decision, "ALLOWED");
    assert.notEqual(ev.toolName, hub);
    const meta = toolSafetyDiagnosticMetadata(ev, {
      sessionId: "as_1",
      userId: "local-user",
    });
    assert.equal(meta.userId, "local-user");
    assert.notEqual(meta.userId, hub);
    assert.equal(meta.decision, "ALLOWED");
    assert.equal(meta.tool, "math.add");
  });

  it("HITL: confirm approve once; reject; no reuse", async () => {
    const waiter = createConfirmationWaiter({
      sessionId: "ws_1",
      deviceId: "dev-1",
    });
    const request = {
      confirmationId: "cf_1",
      toolCallId: "tc_1",
      toolName: "filesystem.write",
      input: { path: "/tmp/x" },
      conversationId: "c1",
      deviceId: "dev-1",
      sessionId: "ws_1",
    };
    const pending = waiter.port.wait(request);
    assert.equal(
      waiter.respond("cf_1", true, { sessionId: "ws_1", deviceId: "dev-1" }),
      true,
    );
    const outcome = await pending;
    assert.equal(outcome.decision, "approved");
    // One-shot: cannot reuse approval.
    assert.equal(
      waiter.respond("cf_1", true, { sessionId: "ws_1", deviceId: "dev-1" }),
      false,
    );

    const req2 = { ...request, confirmationId: "cf_2" };
    const pending2 = waiter.port.wait(req2);
    assert.equal(
      waiter.respond("cf_2", false, { sessionId: "ws_1", deviceId: "dev-1" }),
      true,
    );
    const rejected = await pending2;
    assert.equal(rejected.decision, "rejected");
  });

  it("revoked-session claimant cannot approve pending HITL", async () => {
    const waiter = createConfirmationWaiter({
      sessionId: "ws_live",
      deviceId: "dev-rev",
    });
    const request = {
      confirmationId: "cf_rev",
      toolCallId: "tc_rev",
      toolName: "process.execute",
      input: { cmd: "echo" },
      conversationId: "c2",
      deviceId: "dev-rev",
      sessionId: "ws_live",
    };
    const pending = waiter.port.wait(request);
    // Wrong / stale session id (post-revoke WS would fail requireActiveAuthSession;
    // claimant mismatch also refuses without settling).
    assert.equal(
      waiter.respond("cf_rev", true, {
        sessionId: "ws_other",
        deviceId: "dev-rev",
      }),
      false,
    );
    assert.equal(waiter.hasPending("cf_rev"), true);
    waiter.cancelAll();
    const outcome = await pending;
    assert.equal(outcome.decision, "cancelled");
  });

  it("DENIED never maps to ALLOWED for omitted tools", () => {
    const ev = evaluateToolSafety({
      toolName: "keyboard.control",
      policy: DEFAULT_TOOL_POLICY,
    });
    assert.equal(ev.decision, "DENIED");
    assert.equal(
      toolSafetyDeniedResult(ev, true).error.code,
      "policy_denied",
    );
  });
});
