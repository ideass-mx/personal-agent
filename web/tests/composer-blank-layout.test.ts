/**
 * PHASE 58.4 — blank composer layout + readability (sin vh, autosize 54–240).
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

describe("PHASE 58.4 blank composer layout", () => {
  it("blank-state + blank-state-content (not blank-stage)", () => {
    assert.match(css, /\.blank-state\s*\{/);
    assert.match(css, /\.blank-state-content\s*\{/);
    assert.doesNotMatch(css, /\.blank-stage\b/);
    assert.doesNotMatch(css, /\.blank-stage::before/);
    assert.doesNotMatch(css, /\.blank-stage::after/);
    assert.equal(thread.includes("blank-stage"), false);
    assert.match(thread, /blank-state/);
    assert.match(thread, /blank-state-content/);
  });

  it("blank-state is centered flex; content capped at 760px; no vh", () => {
    const blank = block("\\.blank-state");
    assert.match(blank, /align-items:\s*center/);
    assert.match(blank, /justify-content:\s*center/);
    const content = block("\\.blank-state-content");
    assert.match(content, /width:\s*min\(\s*760px,\s*calc\(100%\s*-\s*48px\)/);
    assert.doesNotMatch(content, /\d+vh/);
    assert.doesNotMatch(content, /margin-top/);
  });

  it("thread / header / dock widths use min(760px, calc(100% - 48px))", () => {
    for (const sel of [
      "\\.thread",
      "\\.conversation-header",
      "\\.composer\\.composer-dock",
    ]) {
      assert.match(
        block(sel),
        /width:\s*min\(\s*760px,\s*calc\(100%\s*-\s*48px\)/,
      );
    }
  });

  it("msg p readability >= 16px (16.5)", () => {
    const msgP = block("\\.msg p");
    const fontSize = parsePx(msgP, "font-size");
    assert.ok(fontSize >= 16, `font-size ${fontSize} >= 16`);
    assert.equal(fontSize, 16.5);
    assert.match(msgP, /line-height:\s*1\.6/);
  });

  it("composer-input min 54 / max 240 / font 16px", () => {
    const input = block("\\.composer-input");
    assert.equal(parsePx(input, "min-height"), 54);
    assert.equal(parsePx(input, "max-height"), 240);
    assert.equal(parsePx(input, "font-size"), 16);
    assert.match(input, /line-height:\s*1\.55/);
    assert.match(input, /padding:\s*10px 0/);
  });

  it("composer-shell keeps align-items flex-end; cap-chip stays ~11px", () => {
    assert.match(block("\\.composer-shell"), /align-items:\s*flex-end/);
    const chip = block("\\.cap-chip");
    assert.equal(parsePx(chip, "font-size"), 11);
  });

  it("composer-shell exists; hero/dock static; no bottom:0 on blank composer", () => {
    assert.match(css, /\.composer-shell\s*\{/);
    const hero = block("\\.composer\\.composer-hero");
    const dock = block("\\.composer\\.composer-dock");
    assert.match(css, /\.composer\s*\{[^}]*position:\s*static/s);
    assert.doesNotMatch(hero, /bottom:\s*0/);
    assert.doesNotMatch(dock, /bottom:\s*0/);
    assert.doesNotMatch(hero, /position:\s*(fixed|absolute|sticky)/);
    assert.doesNotMatch(dock, /position:\s*(fixed|absolute|sticky)/);
  });

  it("scrollbar chain: work-area + conversation hidden; thread scrolls; body overflow", () => {
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

  it("ConversationThreadScreen: textarea only, blank-state, no summary, dock, helpers", () => {
    assert.match(thread, /<textarea/);
    assert.doesNotMatch(thread, /<input\b/);
    assert.match(thread, /blank-state/);
    assert.equal(/meta\.summary/.test(thread), false);
    assert.match(thread, /composer-dock/);
    assert.match(thread, /composerEnterShouldSend/);
    assert.match(thread, /applyComposerAutosize/);
    assert.match(thread, /textareaRef\.current\?\.focus/);
  });
});
