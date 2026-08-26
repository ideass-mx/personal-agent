import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  confirmationCancelledResult,
  confirmationRejectedResult,
  confirmationTimeoutResult,
} from "../../src/agent/confirmation.ts";
import {
  CONFIRMATION_TIMEOUT_MS,
  createConfirmationWaiter,
} from "../../src/http/confirmation-waiter.ts";

function baseRequest(
  confirmationId: string,
  overrides: Partial<{
    toolCallId: string;
    toolName: string;
    input: unknown;
    conversationId: string;
    deviceId: string;
    sessionId: string;
  }> = {},
) {
  return {
    confirmationId,
    toolCallId: overrides.toolCallId ?? "call_1",
    toolName: overrides.toolName ?? "test.confirm",
    input: overrides.input ?? { x: 1 },
    conversationId: overrides.conversationId ?? "c_1",
    deviceId: overrides.deviceId ?? "device-1",
    sessionId: overrides.sessionId ?? "ws_1",
  };
}

describe("ConfirmationWaiter", () => {
  it("CONFIRMATION_TIMEOUT_MS es una constante positiva única", () => {
    assert.equal(typeof CONFIRMATION_TIMEOUT_MS, "number");
    assert.ok(CONFIRMATION_TIMEOUT_MS > 0);
  });

  it("approve resuelve approved con operación congelada", async () => {
    const waiter = createConfirmationWaiter({
      sessionId: "ws_1",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    const pending = waiter.port.wait(baseRequest("cf_1"));
    assert.equal(waiter.respond("cf_1", true), true);
    const outcome = await pending;
    assert.equal(outcome.decision, "approved");
    if (outcome.decision === "approved") {
      assert.equal(outcome.operation.toolName, "test.confirm");
      assert.deepEqual(outcome.operation.input, { x: 1 });
      assert.equal(outcome.operation.sessionId, "ws_1");
      assert.equal(outcome.operation.deviceId, "device-1");
    }
    assert.equal(waiter.hasPending("cf_1"), false);
  });

  it("reject resuelve rejected", async () => {
    const waiter = createConfirmationWaiter({
      sessionId: "ws_1",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    const pending = waiter.port.wait(baseRequest("cf_2"));
    assert.equal(waiter.respond("cf_2", false), true);
    assert.equal((await pending).decision, "rejected");
  });

  it("confirmationId desconocido no resuelve nada", async () => {
    const waiter = createConfirmationWaiter({
      sessionId: "ws_1",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    assert.equal(waiter.respond("cf_missing", true), false);
  });

  it("respuesta duplicada no vuelve a resolver", async () => {
    const waiter = createConfirmationWaiter({
      sessionId: "ws_1",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    const pending = waiter.port.wait(baseRequest("cf_dup"));
    assert.equal(waiter.respond("cf_dup", true), true);
    assert.equal(waiter.respond("cf_dup", false), false);
    assert.equal((await pending).decision, "approved");
  });

  it("timeout no aprueba", async () => {
    const waiter = createConfirmationWaiter({
      sessionId: "ws_1",
      deviceId: "device-1",
      timeoutMs: 20,
    });
    const outcome = await waiter.port.wait(baseRequest("cf_to"));
    assert.equal(outcome.decision, "timeout");
  });

  it("cancelAll fail-closed", async () => {
    const waiter = createConfirmationWaiter({
      sessionId: "ws_1",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    const pending = waiter.port.wait(baseRequest("cf_x"));
    waiter.cancelAll();
    assert.equal((await pending).decision, "cancelled");
    assert.equal(waiter.respond("cf_x", true), false);
  });

  it("helpers de ToolResult usan códigos esperados", () => {
    const rejected = confirmationRejectedResult();
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.error.code, "confirmation_rejected");
    }
    const timedOut = confirmationTimeoutResult();
    assert.equal(timedOut.ok, false);
    if (!timedOut.ok) {
      assert.equal(timedOut.error.code, "confirmation_timeout");
    }
    const cancelled = confirmationCancelledResult();
    assert.equal(cancelled.ok, false);
    if (!cancelled.ok) {
      assert.equal(cancelled.error.code, "confirmation_cancelled");
    }
  });
});

describe("ConfirmationWaiter hardening (binding)", () => {
  it("sessionId incorrecto no resuelve y deja el pending intacto", async () => {
    const waiter = createConfirmationWaiter({
      sessionId: "ws_1",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    const pending = waiter.port.wait(baseRequest("cf_s"));
    assert.equal(
      waiter.respond("cf_s", true, {
        sessionId: "ws_other",
        deviceId: "device-1",
      }),
      false,
    );
    assert.equal(waiter.hasPending("cf_s"), true);
    assert.equal(waiter.respond("cf_s", true), true);
    assert.equal((await pending).decision, "approved");
  });

  it("deviceId incorrecto no resuelve y deja el pending intacto", async () => {
    const waiter = createConfirmationWaiter({
      sessionId: "ws_1",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    const pending = waiter.port.wait(baseRequest("cf_d"));
    assert.equal(
      waiter.respond("cf_d", true, {
        sessionId: "ws_1",
        deviceId: "device-evil",
      }),
      false,
    );
    assert.equal(waiter.hasPending("cf_d"), true);
    waiter.cancelAll();
    assert.equal((await pending).decision, "cancelled");
  });

  it("conversationId incorrecta no resuelve y deja el pending intacto", async () => {
    const waiter = createConfirmationWaiter({
      sessionId: "ws_1",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    const pending = waiter.port.wait(
      baseRequest("cf_c", { conversationId: "c_real" }),
    );
    assert.equal(
      waiter.respond("cf_c", true, {
        sessionId: "ws_1",
        deviceId: "device-1",
        conversationId: "c_other",
      }),
      false,
    );
    assert.equal(waiter.hasPending("cf_c"), true);
    assert.equal(
      waiter.respond("cf_c", false, {
        sessionId: "ws_1",
        deviceId: "device-1",
        conversationId: "c_real",
      }),
      true,
    );
    assert.equal((await pending).decision, "rejected");
  });

  it("otra sesión/waiter no puede aprobar (CASO D)", async () => {
    const waiterA = createConfirmationWaiter({
      sessionId: "ws_a",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    const waiterB = createConfirmationWaiter({
      sessionId: "ws_b",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    const pending = waiterA.port.wait(
      baseRequest("cf_a", { sessionId: "ws_a" }),
    );
    assert.equal(waiterB.respond("cf_a", true), false);
    assert.equal(waiterA.hasPending("cf_a"), true);
    assert.equal(waiterA.respond("cf_a", true), true);
    assert.equal((await pending).decision, "approved");
  });

  it("input queda congelado (structuredClone) en el pending", async () => {
    const waiter = createConfirmationWaiter({
      sessionId: "ws_1",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    const mutable = { path: "/safe" };
    const pending = waiter.port.wait(
      baseRequest("cf_i", { input: mutable }),
    );
    mutable.path = "/pwned";
    const peeked = waiter.peek("cf_i");
    assert.deepEqual(peeked?.input, { path: "/safe" });
    assert.equal(waiter.respond("cf_i", true), true);
    const outcome = await pending;
    assert.equal(outcome.decision, "approved");
    if (outcome.decision === "approved") {
      assert.deepEqual(outcome.operation.input, { path: "/safe" });
    }
  });

  it("approve concurrente solo resuelve una vez", async () => {
    const waiter = createConfirmationWaiter({
      sessionId: "ws_1",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    const pending = waiter.port.wait(baseRequest("cf_race"));
    const results = [waiter.respond("cf_race", true), waiter.respond("cf_race", true)];
    assert.deepEqual(results.sort(), [false, true].sort());
    assert.equal((await pending).decision, "approved");
  });

  it("approve después de timeout no ejecuta (pending ausente)", async () => {
    const waiter = createConfirmationWaiter({
      sessionId: "ws_1",
      deviceId: "device-1",
      timeoutMs: 20,
    });
    const outcome = await waiter.port.wait(baseRequest("cf_ato"));
    assert.equal(outcome.decision, "timeout");
    assert.equal(waiter.respond("cf_ato", true), false);
  });

  it("approve después de reject no cambia nada", async () => {
    const waiter = createConfirmationWaiter({
      sessionId: "ws_1",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    const pending = waiter.port.wait(baseRequest("cf_ar"));
    assert.equal(waiter.respond("cf_ar", false), true);
    assert.equal(waiter.respond("cf_ar", true), false);
    assert.equal((await pending).decision, "rejected");
  });

  it("reject después de approve no cambia nada", async () => {
    const waiter = createConfirmationWaiter({
      sessionId: "ws_1",
      deviceId: "device-1",
      timeoutMs: 5_000,
    });
    const pending = waiter.port.wait(baseRequest("cf_ra"));
    assert.equal(waiter.respond("cf_ra", true), true);
    assert.equal(waiter.respond("cf_ra", false), false);
    assert.equal((await pending).decision, "approved");
  });
});
