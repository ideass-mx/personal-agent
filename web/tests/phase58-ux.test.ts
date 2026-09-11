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

  it("Shell companion nav uses Settings, not Tu agente", () => {
    const shell = fs.readFileSync(
      path.join(root, "src/components/Shell.tsx"),
      "utf8",
    );
    assert.match(shell, /Settings/);
    assert.equal(shell.includes("Tu agente"), false);
    assert.match(shell, /label="Chat"/);
  });

  it("ConversationScreen blank state has hero + composer autofocus", () => {
    const src = fs.readFileSync(
      path.join(root, "src/features/conversations/ConversationThreadScreen.tsx"),
      "utf8",
    );
    assert.match(src, /¿En qué te ayudo\?/);
    assert.match(src, /blank-state/);
    assert.match(src, /composer-hero/);
    assert.match(src, /textareaRef\.current\?\.focus/);
    assert.equal(/ID \$\{activeConversationId/.test(src), false);
  });

  it("tokens.css is dark-first companion palette", () => {
    const tokens = fs.readFileSync(path.join(root, "src/styles/tokens.css"), "utf8");
    assert.match(tokens, /color-scheme:\s*dark/);
    assert.match(tokens, /--bg:\s*#0e1013/i);
    assert.match(tokens, /--shell-bg:\s*var\(--bg\)/);
  });

  it("AppContext polls refreshConversationsUntilTitled after assistant_done", () => {
    const src = fs.readFileSync(
      path.join(root, "src/state/AppContext.tsx"),
      "utf8",
    );
    assert.match(src, /refreshConversationsUntilTitled/);
    assert.match(src, /assistant_done/);
    assert.match(
      src,
      /assistant_done[\s\S]*refreshConversationsUntilTitled\(msg\.conversationId\)/,
    );
    assert.match(src, /nueva conversación/i);
  });
});
