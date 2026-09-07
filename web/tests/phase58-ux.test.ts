/**
 * Web UX contracts — PHASE 58.1 dark Personal Agent surface.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("PHASE 58.1 Personal Agent UX", () => {
  it("AgentSpaceScreen is removed from web product", () => {
    const agentScreen = path.join(
      root,
      "src/features/agent/AgentSpaceScreen.tsx",
    );
    assert.equal(fs.existsSync(agentScreen), false);
    const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
    assert.equal(app.includes("AgentSpaceScreen"), false);
    assert.match(app, /setNav\("conversation"\)/);
    assert.match(app, /st\.llmConfigured/);
  });

  it("Shell shows Plan Personal, not Tu agente", () => {
    const shell = fs.readFileSync(
      path.join(root, "src/components/Shell.tsx"),
      "utf8",
    );
    assert.match(shell, /Plan Personal/);
    assert.equal(shell.includes("Tu agente"), false);
  });

  it("ConversationScreen blank stage has hero + composer autofocus", () => {
    const src = fs.readFileSync(
      path.join(root, "src/features/conversations/ConversationThreadScreen.tsx"),
      "utf8",
    );
    assert.match(src, /¿En qué te ayudo\?/);
    assert.match(src, /blank-stage/);
    assert.match(src, /composer-hero/);
    assert.match(src, /inputRef\.current\?\.focus/);
    assert.equal(/ID \$\{activeConversationId/.test(src), false);
  });

  it("tokens.css is dark-first", () => {
    const tokens = fs.readFileSync(path.join(root, "src/styles/tokens.css"), "utf8");
    assert.match(tokens, /color-scheme:\s*dark/);
    assert.match(tokens, /--shell-bg:\s*#0d0f12/);
  });
});
