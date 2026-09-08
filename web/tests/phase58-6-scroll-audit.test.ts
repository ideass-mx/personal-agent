/**
 * PHASE 58.6 — scroll + visual audit contracts.
 *
 * Root cause: `.thread` combinaba `width: min(760px, …)` con `overflow-y: auto`,
 * así la barra de scroll quedaba pegada a la columna de mensajes en lugar del
 * borde derecho del work-area. Fix: `.thread` full width scrollea;
 * `.thread-inner` restringe el ancho del contenido.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { COMPOSER_TEXTAREA_MIN_PX } from "../src/lib/composerKeyboard.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(root, "src/styles/app.css"), "utf8");
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

describe("PHASE 58.6 scroll + visual audit", () => {
  it("thread full-bleed scroll; thread-inner width; no scrollbar-gutter", () => {
    const threadBlock = block("\\.thread");
    assert.match(threadBlock, /overflow-y:\s*auto/);
    assert.doesNotMatch(threadBlock, /width:\s*min\(\s*760/);
    assert.doesNotMatch(threadBlock, /scrollbar-gutter/);

    const inner = block("\\.thread-inner");
    assert.match(inner, /width:\s*min\(\s*760/);
  });

  it("conversation-screen + work-area:has overflow hidden", () => {
    assert.match(css, /\.conversation-screen\s*\{[^}]*overflow:\s*hidden/s);
    assert.match(
      css,
      /\.work-area:has\(\s*>\s*\.conversation-screen\s*\)\s*\{[^}]*overflow:\s*hidden/s,
    );
  });

  it("ConversationThreadScreen: thread-inner; no conversation-header / cap-chip", () => {
    assert.match(thread, /thread-inner/);
    assert.doesNotMatch(thread, /conversation-header/);
    assert.doesNotMatch(thread, /cap-chip/);
  });

  it("composer-dock / shell border 0 and radius >= 28", () => {
    const dock = block("\\.composer\\.composer-dock");
    assert.match(dock, /width:\s*100%/);

    const dockShell = block("\\.composer-dock \\.composer-shell");
    assert.match(dockShell, /border:\s*0/);
    assert.ok(parsePx(dockShell, "border-radius") >= 28);

    const shell = block("\\.composer-shell");
    assert.match(shell, /border:\s*0/);
    assert.ok(parsePx(shell, "border-radius") >= 28);
  });

  it("msg.user uses --user-bubble and radius >= 24", () => {
    const user = block("\\.msg\\.user");
    assert.match(user, /var\(--user-bubble\)|#1e4a7a|#[0-9a-fA-F]*[4-9a-fA-F][0-9a-fA-F]*[7-9a-fA-F]/);
    assert.ok(parsePx(user, "border-radius") >= 24);
  });

  it("blank-state uses grid-template-rows; no translateY / vh", () => {
    const blank = block("\\.blank-state");
    assert.match(blank, /grid-template-rows/);
    const content = block("\\.blank-state-content");
    assert.doesNotMatch(content, /translateY/);
    assert.doesNotMatch(content, /\d+vh/);
    assert.doesNotMatch(blank, /translateY/);
    assert.doesNotMatch(blank, /\d+vh/);
  });

  it("COMPOSER_TEXTAREA_MIN_PX === 28", () => {
    assert.equal(COMPOSER_TEXTAREA_MIN_PX, 28);
  });
});
