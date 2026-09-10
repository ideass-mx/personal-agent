import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("conversation intelligence picker", () => {
  it("composer embeds picker and per-conversation hint", () => {
    const thread = readFileSync(
      join(root, "src/features/conversations/ConversationThreadScreen.tsx"),
      "utf8",
    );
    assert.match(thread, /ConversationIntelligencePicker/);
    assert.match(thread, /composer-toolbar/);
    assert.match(thread, /conv-intel-hint/);
    assert.match(thread, /solo esta conversación|Solo\s+afecta a esta conversación/i);
    assert.doesNotMatch(thread, /IntelligenceIndicator/);
  });

  it("picker copy scopes change to this conversation", () => {
    const picker = readFileSync(
      join(
        root,
        "src/features/configuration/ConversationIntelligencePicker.tsx",
      ),
      "utf8",
    );
    assert.match(picker, /solo esta conversación/);
    assert.match(picker, /setConversationIntelligenceId/);
  });

  it("WS client can send intelligenceConnectionId", () => {
    const sock = readFileSync(
      join(root, "src/websocket/HubSocket.ts"),
      "utf8",
    );
    assert.match(sock, /intelligenceConnectionId/);
  });

  it("styles define pill + menu", () => {
    const css = readFileSync(join(root, "src/styles/app.css"), "utf8");
    assert.match(css, /\.conv-intel-pill\s*\{/);
    assert.match(css, /\.conv-intel-menu\s*\{/);
    assert.match(css, /\.composer-toolbar\s*\{/);
  });
});
