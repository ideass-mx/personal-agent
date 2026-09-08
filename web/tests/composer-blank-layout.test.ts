/**
 * PHASE 58.6 — blank composer layout + readability (grid blank, autosize 28–240).
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

describe("PHASE 58.6 blank composer layout", () => {
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

  it("blank-state grid upper-middle; content capped; no translateY / vh", () => {
    const blank = block("\\.blank-state");
    assert.match(blank, /grid-template-rows/);
    assert.match(blank, /display:\s*grid/);
    const content = block("\\.blank-state-content");
    assert.match(content, /width:\s*min\(\s*720px,/);
    assert.doesNotMatch(content, /translateY/);
    assert.doesNotMatch(content, /\d+vh/);
    assert.doesNotMatch(blank, /translateY/);
    assert.doesNotMatch(blank, /\d+vh/);
  });

  it("thread full width; thread-inner / dock shell use min(760", () => {
    const threadBlock = block("\\.thread");
    assert.doesNotMatch(threadBlock, /width:\s*min\(\s*760/);
    assert.match(block("\\.thread-inner"), /width:\s*min\(\s*760/);
    assert.match(
      block("\\.composer-dock \\.composer-shell"),
      /width:\s*min\(\s*760/,
    );
  });

  it("msg p readability font-size 16px + font-chat", () => {
    const msgP = block("\\.msg p");
    const fontSize = parsePx(msgP, "font-size");
    assert.equal(fontSize, 16);
    assert.match(msgP, /line-height:\s*1\.6/);
    assert.match(msgP, /font-family:\s*var\(--font-chat\)/);
  });

  it("composer-input min 28 / max 240 / font 16px", () => {
    const input = block("\\.composer-input");
    assert.equal(parsePx(input, "min-height"), 28);
    assert.equal(parsePx(input, "max-height"), 240);
    assert.equal(parsePx(input, "font-size"), 16);
    assert.match(input, /line-height:\s*1\.5/);
    assert.match(input, /font-family:\s*var\(--font-chat\)/);
  });

  it("composer-shell border 0 / radius >= 28; hero/dock tall", () => {
    const shell = block("\\.composer-shell");
    assert.match(shell, /border:\s*0/);
    assert.ok(parsePx(shell, "border-radius") >= 28);
    const heroShell = block("\\.composer-hero \\.composer-shell");
    assert.match(heroShell, /border:\s*0/);
    assert.ok(parsePx(heroShell, "border-radius") >= 28);
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
