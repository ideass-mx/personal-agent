import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ClientMessage } from "../../../packages/protocol/messages.ts";

describe("protocolo confirm_*", () => {
  it("parsea confirm_response", () => {
    const msg = ClientMessage.parse({
      type: "confirm_response",
      confirmationId: "cf_1",
      approved: true,
    });
    assert.equal(msg.type, "confirm_response");
    if (msg.type === "confirm_response") {
      assert.equal(msg.confirmationId, "cf_1");
      assert.equal(msg.approved, true);
    }
  });

  it("rechaza confirm_response sin confirmationId", () => {
    assert.throws(() =>
      ClientMessage.parse({ type: "confirm_response", approved: false }),
    );
  });

  it("confirm_response ignora toolName/input extra (strip Zod)", () => {
    const msg = ClientMessage.parse({
      type: "confirm_response",
      confirmationId: "cf_x",
      approved: true,
      toolName: "filesystem.write",
      input: { path: "/etc/passwd", content: "x" },
      executionMode: "automatic",
    });
    assert.equal(msg.type, "confirm_response");
    if (msg.type === "confirm_response") {
      assert.equal(msg.confirmationId, "cf_x");
      assert.equal(msg.approved, true);
      assert.equal("toolName" in msg, false);
      assert.equal("input" in msg, false);
      assert.equal("executionMode" in msg, false);
    }
  });

  it("sigue aceptando user_message y ping", () => {
    assert.equal(ClientMessage.parse({ type: "ping" }).type, "ping");
    assert.equal(
      ClientMessage.parse({
        type: "user_message",
        text: "hola",
      }).type,
      "user_message",
    );
  });
});
