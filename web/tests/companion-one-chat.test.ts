/**
 * Companion — políticas + humo de aceptación (un chat).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { routeIntent } from "../src/features/companion/policies/routeIntent.ts";
import {
  isTripStatusQuestion,
  isTripTopic,
  shouldOfferWorkspace,
} from "../src/features/companion/policies/shouldOfferWorkspace.ts";
import type { PromoteState } from "../src/features/companion/types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

function basePromote(over: Partial<PromoteState> = {}): PromoteState {
  return {
    topicId: "trip",
    label: "el viaje a Japón",
    mentions: 0,
    rejected: false,
    reoffered: false,
    workspaceId: null,
    notes: [],
    ...over,
  };
}

describe("companion intent router", () => {
  it("routes reminder to task", () => {
    assert.equal(
      routeIntent("Recuérdame pagar la luz el viernes"),
      "task",
    );
  });

  it("routes book intent to project", () => {
    assert.equal(
      routeIntent("Quiero escribir un libro sobre IA y empleo"),
      "project",
    );
  });

  it("routes trip planning to chat (promote policy handles offer)", () => {
    assert.equal(routeIntent("Planéame un viaje a Japón"), "chat");
    assert.equal(isTripTopic("Planéame un viaje a Japón"), true);
  });
});

describe("companion promote policy", () => {
  it("offers on first topic turn", () => {
    const d = shouldOfferWorkspace({
      promote: basePromote({ mentions: 1 }),
      isStatusQuestion: false,
      isTopicTurn: true,
      materialHeavy: false,
    });
    assert.equal(d.offer, true);
  });

  it("does not reoffer immediately after reject", () => {
    const d = shouldOfferWorkspace({
      promote: basePromote({ mentions: 2, rejected: true }),
      isStatusQuestion: false,
      isTopicTurn: true,
      materialHeavy: false,
    });
    assert.equal(d.offer, false);
  });

  it("reoffers once when material is heavy after reject", () => {
    const d = shouldOfferWorkspace({
      promote: basePromote({
        mentions: 4,
        rejected: true,
        reoffered: false,
      }),
      isStatusQuestion: false,
      isTopicTurn: true,
      materialHeavy: true,
    });
    assert.equal(d.offer, true);
    if (d.offer) assert.equal(d.reoffer, true);
  });

  it("status question is recognizable without workspace", () => {
    assert.equal(isTripStatusQuestion("¿Cómo va mi viaje?"), true);
  });
});

describe("companion shell wiring", () => {
  it("opens on Chat and hides multi-chat management UI", () => {
    const shell = fs.readFileSync(
      path.join(root, "src/components/Shell.tsx"),
      "utf8",
    );
    const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
    assert.match(shell, /title="Chat"/);
    assert.match(shell, /BellRouter/);
    assert.equal(shell.includes("newConversation"), false);
    assert.equal(shell.includes("ConversationSidebarList"), false);
    assert.match(app, /CompanionHost/);
    assert.equal(app.includes("ConversationsListScreen"), false);
  });

  it("workspace is three-panel", () => {
    const ws = fs.readFileSync(
      path.join(root, "src/features/companion/WorkspaceScreen.tsx"),
      "utf8",
    );
    assert.match(ws, /cp-ws-nav/);
    assert.match(ws, /cp-ws-surface/);
    assert.match(ws, /cp-ws-companion/);
    assert.match(ws, /Mientras no estabas/);
  });
});
