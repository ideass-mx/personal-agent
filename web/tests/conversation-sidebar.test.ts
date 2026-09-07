/**
 * PHASE 58.5 — conversation sidebar: pin/delete UX contracts (source scan).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("PHASE 58.5 conversation sidebar", () => {
  it("ConversationSidebarList has ⋯, Fijar/Desfijar, Eliminar, confirm, sections", () => {
    const src = fs.readFileSync(
      path.join(
        root,
        "src/features/conversations/ConversationSidebarList.tsx",
      ),
      "utf8",
    );
    assert.match(src, /⋯/);
    assert.match(src, /Fijar/);
    assert.match(src, /Desfijar/);
    assert.match(src, /Eliminar/);
    assert.match(src, /Eliminar conversación/);
    assert.match(src, /Esta acción no se puede deshacer/);
    assert.match(src, /Fijadas/);
    assert.match(src, /Conversaciones/);
    assert.match(src, /conv-confirm/);
    assert.match(src, /setConversationPinned/);
    assert.match(src, /removeConversation/);
    assert.match(src, /title=\{fullTitle\}/);
  });

  it("Shell uses ConversationSidebarList", () => {
    const shell = fs.readFileSync(
      path.join(root, "src/components/Shell.tsx"),
      "utf8",
    );
    assert.match(shell, /ConversationSidebarList/);
  });

  it("AppContext exposes pin/remove and sorts pinned first", () => {
    const src = fs.readFileSync(
      path.join(root, "src/state/AppContext.tsx"),
      "utf8",
    );
    assert.match(src, /setConversationPinned/);
    assert.match(src, /removeConversation/);
    assert.match(src, /compareConversationsForSidebar/);
    assert.match(src, /pinned:\s*false/);
    assert.match(src, /patchConversationPinned/);
    assert.match(src, /deleteConversation/);
  });

  it("http client has patch/delete + normalize pinned", () => {
    const http = fs.readFileSync(path.join(root, "src/api/http.ts"), "utf8");
    assert.match(http, /export async function patchConversationPinned/);
    assert.match(http, /export async function deleteConversation/);
    assert.match(http, /compareConversationsForSidebar/);
    assert.match(http, /normalizeConversationMeta/);
    assert.match(http, /Boolean\(c\.pinned\)/);
  });
});
