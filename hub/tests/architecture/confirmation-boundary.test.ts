import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("PHASE 2.3 confirmation boundary", () => {
  it("Runtime importa ConfirmationPort, no ConfirmationWaiter ni WS/Hono", () => {
    const src = readFileSync(
      path.join(repoRoot, "hub/src/agent/runtime.ts"),
      "utf8",
    );
    assert.match(src, /ConfirmationPort/);
    assert.match(src, /from ["']\.\/confirmation\.ts["']/);
    assert.doesNotMatch(src, /ConfirmationWaiter/);
    assert.doesNotMatch(src, /createConfirmationWaiter/);
    assert.doesNotMatch(src, /confirmation-waiter/);
    assert.doesNotMatch(src, /waiter\.respond/);
    assert.doesNotMatch(src, /from ["']ws["']/);
    assert.doesNotMatch(src, /from ["']hono/);
  });

  it("ConfirmationPort no importa WebSocket ni Hono ni el waiter", () => {
    const src = readFileSync(
      path.join(repoRoot, "hub/src/agent/confirmation.ts"),
      "utf8",
    );
    assert.match(src, /export interface ConfirmationPort/);
    assert.match(src, /wait\(request: ConfirmationRequest\)/);
    assert.doesNotMatch(src, /createConfirmationWaiter/);
    assert.doesNotMatch(src, /ConfirmationWaiter/);
    assert.doesNotMatch(src, /from ["']ws["']/);
    assert.doesNotMatch(src, /WebSocket/);
    assert.doesNotMatch(src, /from ["']hono/);
    assert.doesNotMatch(src, /pending/);
  });

  it("ConfirmationWaiter vive en el Gateway (http/)", () => {
    const waiterPath = path.join(
      repoRoot,
      "hub/src/http/confirmation-waiter.ts",
    );
    assert.equal(existsSync(waiterPath), true);
    const src = readFileSync(waiterPath, "utf8");
    assert.match(src, /export function createConfirmationWaiter/);
    assert.match(src, /implements ConfirmationPort|port: ConfirmationPort/);
    assert.match(src, /respond\(/);
    assert.match(src, /CONFIRMATION_TIMEOUT_MS = 60_000/);
    const ws = readFileSync(path.join(repoRoot, "hub/src/http/ws.ts"), "utf8");
    assert.match(ws, /from ["']\.\/confirmation-waiter\.ts["']/);
    const sessions = readFileSync(
      path.join(repoRoot, "hub/src/http/sessions.ts"),
      "utf8",
    );
    assert.match(sessions, /from ["']\.\/confirmation-waiter\.ts["']/);
  });
});
