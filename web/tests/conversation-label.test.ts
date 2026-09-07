import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  conversationListLabel,
  looksLikeTechnicalId,
} from "../src/lib/conversationLabel.ts";

describe("PHASE 58 conversation labels", () => {
  it("prefers title over id", () => {
    assert.equal(
      conversationListLabel({
        title: "Control de drones con guante",
        summary: "Diseño…",
      }),
      "Control de drones con guante",
    );
  });

  it("falls back to summary then Nueva conversación — never hash", () => {
    assert.equal(
      conversationListLabel({ title: null, summary: "Plan de doctorado" }),
      "Plan de doctorado",
    );
    const empty = conversationListLabel({ title: null, summary: null });
    assert.equal(empty, "Nueva conversación");
    assert.equal(looksLikeTechnicalId(empty), false);
    assert.equal(looksLikeTechnicalId("c_8f91abcd"), true);
    assert.equal(looksLikeTechnicalId("Navegar Personal Agent"), true);
  });
});
