/**
 * PHASE 58.5 — message + sidebar CSS / layout contracts.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(root, "src/styles/app.css"), "utf8");
const tokens = fs.readFileSync(path.join(root, "src/styles/tokens.css"), "utf8");
const thread = fs.readFileSync(
  path.join(root, "src/features/conversations/ConversationThreadScreen.tsx"),
  "utf8",
);

function block(selector: string): string {
  return (css.match(new RegExp(`${selector}\\s*\\{[^}]+\\}`, "s"))?.[0] ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function parsePx(declaration: string, prop: string): number {
  const m = declaration.match(new RegExp(`${prop}:\\s*([\\d.]+)px`));
  assert.ok(m, `expected ${prop} in px`);
  return Number(m![1]);
}

describe("PHASE 58.5 message + overflow UX", () => {
  it("msg p font >= 16; user bubble radius >= 20", () => {
    const msgP = block("\\.msg p");
    const fontSize = parsePx(msgP, "font-size");
    assert.ok(fontSize >= 16, `font-size ${fontSize} >= 16`);
    assert.match(msgP, /line-height:\s*1\.6/);
    assert.match(msgP, /white-space:\s*pre-wrap/);

    const user = block("\\.msg\\.user");
    const radius = parsePx(user, "border-radius");
    assert.ok(radius >= 20, `border-radius ${radius} >= 20`);
    assert.match(user, /padding:\s*12px 16px/);
  });

  it("no blank-stage; textarea composer; overflow chain intact", () => {
    assert.doesNotMatch(css, /\.blank-stage\b/);
    assert.equal(thread.includes("blank-stage"), false);
    assert.match(thread, /<textarea/);
    assert.doesNotMatch(thread, /<input\b/);
    assert.match(
      css,
      /\.work-area:has\(\s*>\s*\.conversation-screen\s*\)\s*\{[^}]*overflow:\s*hidden/s,
    );
    assert.match(css, /\.conversation-screen\s*\{[^}]*overflow:\s*hidden/s);
    assert.match(css, /\.thread\s*\{[^}]*overflow-y:\s*auto/s);
    assert.match(
      tokens,
      /html\s*,\s*body\s*,\s*#root\s*\{[^}]*overflow:\s*hidden/s,
    );
  });

  it("sidebar conv sections / menu / confirm styles exist", () => {
    assert.match(css, /\.conv-section-label\s*\{/);
    assert.match(css, /\.conv-row\s*\{/);
    assert.match(css, /\.conv-menu-btn\s*\{/);
    assert.match(css, /\.conv-menu\s*\{/);
    assert.match(css, /\.conv-confirm\s*\{/);
  });

  it("agent cap-chip can say Personal Agent", () => {
    assert.match(thread, /Personal Agent/);
    assert.match(thread, /whiteSpace:\s*["']pre-wrap["']/);
  });
});
