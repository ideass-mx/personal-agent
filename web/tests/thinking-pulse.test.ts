import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("thinking pulse UX", () => {
  it("muestra círculo pulsante mientras busy sin tokens", () => {
    const screen = readFileSync(
      path.join(root, "src/features/conversations/ConversationThreadScreen.tsx"),
      "utf8",
    );
    assert.match(screen, /showThinkingPulse/);
    assert.match(screen, /thinking-pulse/);
    assert.doesNotMatch(screen, /▍/);

    const css = readFileSync(path.join(root, "src/styles/app.css"), "utf8");
    assert.match(css, /@keyframes thinking-pulse/);
    assert.match(css, /\.thinking-pulse/);
  });
});
