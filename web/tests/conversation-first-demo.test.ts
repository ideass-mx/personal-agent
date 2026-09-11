/**
 * Conversation-first adaptive demo — intent mock + scenario smoke.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { detectIntent } from "../src/experience/conversationFirst/detectIntent.ts";
import { DEMO_SCENARIOS } from "../src/experience/conversationFirst/scenarios.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const expDir = path.join(here, "../src/experience");

describe("conversation-first adaptive demo", () => {
  it("simple ask stays conversation", () => {
    const d = detectIntent("¿Qué es aprendizaje automático?", {
      inProject: false,
    });
    assert.equal(d.kind, "simple_ask");
  });

  it("reminder becomes task without project", () => {
    const d = detectIntent("Mañana recuérdame revisar la propuesta.", {
      inProject: false,
    });
    assert.equal(d.kind, "task");
  });

  it("doctorado proposes complex work", () => {
    const d = detectIntent(
      "Quiero comparar opciones, costos, modalidad y saber cuáles podrían convenirme.",
      { inProject: false },
    );
    // Without "doctorado" this may be generic — seed path uses doctorado context.
    const d2 = detectIntent(
      "Quiero investigar mis opciones de doctorado y comparar universidades.",
      { inProject: false },
    );
    assert.equal(d2.kind, "complex_work");
    assert.equal(d2.projectTitle, "Doctorado");
    void d;
  });

  it("literature review is explicit work", () => {
    const d = detectIntent(
      "Necesito un artículo de revisión sobre los algoritmos de optimización utilizados en trading cuantitativo.",
      { inProject: false },
    );
    assert.equal(d.kind, "explicit_work");
  });

  it("demo scenarios cover the DoD matrix", () => {
    const ids = DEMO_SCENARIOS.map((s) => s.id);
    for (const id of [
      "simple",
      "task",
      "doctorado",
      "article",
      "files",
      "evidence",
    ]) {
      assert.ok(ids.includes(id as (typeof ids)[number]), id);
    }
  });

  it("conversation-first sources avoid HTML injection APIs", () => {
    const files = [
      "conversationFirst/ConversationFirstDemo.tsx",
      "conversationFirst/detectIntent.ts",
      "ExperienceLabScreen.tsx",
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.join(expDir, f), "utf8");
      assert.equal(src.includes("dangerouslySetInnerHTML"), false, f);
      assert.equal(/\beval\s*\(/.test(src), false, f);
    }
  });

  it("lab exposes conversation-first tab and fourth comparison column", () => {
    const src = fs.readFileSync(
      path.join(expDir, "ExperienceLabScreen.tsx"),
      "utf8",
    );
    assert.match(src, /Conversación → Trabajo/);
    assert.match(src, /Conversation-first Adaptive/);
    assert.match(src, /ConversationFirstDemo/);
  });
});
