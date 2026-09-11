import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { workingPatienceLabel } from "../src/lib/toolActivity.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("thinking pulse UX", () => {
  it("muestra círculo pulsante mientras busy sin tokens", () => {
    const screen = readFileSync(
      path.join(root, "src/features/conversations/ConversationThreadScreen.tsx"),
      "utf8",
    );
    assert.match(screen, /showThinkingPulse/);
    assert.match(screen, /thinking-pulse/);
    assert.match(screen, /workingPatienceLabel/);
    assert.doesNotMatch(screen, /⌛/);

    const css = readFileSync(path.join(root, "src/styles/app.css"), "utf8");
    assert.match(css, /@keyframes thinking-pulse/);
    assert.match(css, /\.thinking-pulse/);
    assert.match(css, /\.thinking-label/);
  });

  it("escala copy de paciencia con el tiempo", () => {
    assert.match(
      workingPatienceLabel({ busyMs: 500, hasAssistantTokens: false }),
      /trabajando/i,
    );
    assert.match(
      workingPatienceLabel({ busyMs: 9_000, hasAssistantTokens: false }),
      /pensando/i,
    );
    assert.match(
      workingPatienceLabel({ busyMs: 1_000, hasAssistantTokens: true }),
      /Procesando/i,
    );
  });
});
