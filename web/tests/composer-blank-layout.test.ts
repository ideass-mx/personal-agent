/**
 * PHASE 58.4 — blank composer layout contract (lower-middle, not bottom:0).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(root, "src/styles/app.css"), "utf8");
const thread = fs.readFileSync(
  path.join(root, "src/features/conversations/ConversationThreadScreen.tsx"),
  "utf8",
);

describe("PHASE 58.4 blank composer layout", () => {
  it("work-area + conversation-screen form a flex height chain", () => {
    assert.match(css, /\.work-area\s*\{[^}]*display:\s*flex/s);
    assert.match(css, /\.work-area\s*\{[^}]*flex-direction:\s*column/s);
    assert.match(
      css,
      /\.conversation-screen\s*\{[^}]*flex:\s*1\s+1\s+auto/s,
    );
    assert.match(css, /\.conversation-screen\s*\{[^}]*min-height:\s*0/s);
  });

  it("blank-stage uses flex spacers for lower-middle (not bottom:0)", () => {
    assert.match(css, /\.blank-stage\s*\{[^}]*display:\s*flex/s);
    assert.match(css, /\.blank-stage\s*\{[^}]*flex-direction:\s*column/s);
    assert.match(css, /\.blank-stage::before\s*\{[^}]*flex:/s);
    assert.match(css, /\.blank-stage::after\s*\{[^}]*flex:/s);
    const blankBlock = (css.match(/\.blank-stage\s*\{[^}]+\}/s)?.[0] ?? "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(blankBlock, /bottom:\s*0/);
    assert.doesNotMatch(blankBlock, /position:\s*(fixed|absolute)/);
    const hero = (
      css.match(/\.blank-stage\s+\.composer\.composer-hero\s*\{[^}]+\}/s)?.[0] ??
      ""
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(hero, /bottom:\s*0/);
    assert.doesNotMatch(hero, /position:\s*(fixed|absolute|sticky)/);
  });

  it("blank conversation mounts hero + composer inside blank-stage", () => {
    assert.match(thread, /blank-stage/);
    assert.match(thread, /¿En qué te ayudo\?/);
    assert.match(thread, /composer-hero/);
    assert.match(thread, /inputRef\.current\?\.focus/);
  });
});
