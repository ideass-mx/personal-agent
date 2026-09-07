/**
 * PHASE 58.4 — blank composer layout contract (lower-middle, not bottom:0).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(root, "src/styles/app.css"), "utf8");
const thread = fs.readFileSync(
  path.join(root, "src/features/conversations/ConversationThreadScreen.tsx"),
  "utf8",
);

describe("PHASE 58.4 blank composer layout", () => {
  it("blank-stage uses flex column and asymmetric vertical padding (not bottom:0)", () => {
    assert.match(css, /\.blank-stage\s*\{[^}]*display:\s*flex/s);
    assert.match(css, /\.blank-stage\s*\{[^}]*flex-direction:\s*column/s);
    assert.match(css, /\.blank-stage\s*\{[^}]*padding:\s*[^;]*vh[^;]*vh/s);
    const blankBlock = (css.match(/\.blank-stage\s*\{[^}]+\}/s)?.[0] ?? "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(blankBlock, /bottom:\s*0/);
    assert.doesNotMatch(blankBlock, /position:\s*fixed/);
  });

  it("blank conversation mounts hero + composer inside blank-stage", () => {
    assert.match(thread, /blank-stage/);
    assert.match(thread, /¿En qué te ayudo\?/);
    assert.match(thread, /composer-hero/);
    assert.match(thread, /inputRef\.current\?\.focus/);
  });
});
