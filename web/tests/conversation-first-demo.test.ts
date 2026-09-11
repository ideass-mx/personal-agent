/**
 * Conversation-first adaptive demo — intent mock + scenario smoke.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  detectIntent,
  detectProductIntent,
} from "../src/experience/conversationFirst/detectIntent.ts";
import { DEMO_SCENARIOS } from "../src/experience/conversationFirst/scenarios.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const expDir = path.join(here, "../src/experience");

describe("conversation-first adaptive demo", () => {
  it("simple ask stays conversation", () => {
    const d = detectIntent("¿Qué es aprendizaje automático?", {
      inProject: false,
    });
    assert.equal(d.kind, "simple_ask");
    assert.equal(detectProductIntent("¿Qué es aprendizaje automático?"), "conversation");
  });

  it("reminder becomes task without project", () => {
    const d = detectIntent("Mañana recuérdame revisar la propuesta.", {
      inProject: false,
    });
    assert.equal(d.kind, "task");
  });

  it("trading interest alone does not create article project", () => {
    assert.equal(
      detectProductIntent("Últimamente me interesa mucho el trading cuantitativo."),
      "conversation",
    );
    const d = detectIntent(
      "Últimamente me interesa mucho el trading cuantitativo.",
      { inProject: false },
    );
    assert.equal(d.kind, "conversation_continue");
  });

  it("research alone is not scientific article", () => {
    assert.equal(
      detectProductIntent(
        "Quiero investigar los principales algoritmos utilizados en trading cuantitativo.",
      ),
      "research",
    );
    const d = detectIntent(
      "Quiero investigar los principales algoritmos utilizados en trading cuantitativo.",
      { inProject: false },
    );
    assert.equal(d.kind, "research_only");
  });

  it("article after conversation proposes project", () => {
    const d = detectIntent(
      "Sí. De hecho quiero hacer un artículo científico sobre esto.",
      {
        inProject: false,
        priorUserTexts: [
          "Últimamente me interesa mucho el trading cuantitativo.",
          "Quiero investigar cuáles se utilizan.",
        ],
      },
    );
    assert.equal(d.kind, "scientific_article_propose");
  });

  it("clear article intent creates direct article path", () => {
    const d = detectIntent(
      "Quiero crear un artículo científico sobre algoritmos de optimización utilizados en trading cuantitativo.",
      { inProject: false },
    );
    assert.equal(d.kind, "scientific_article_direct");
    assert.match(d.reply || "", /Vamos a crear tu artículo científico/i);
    assert.ok(d.projectTitle);
  });

  it("doctorado proposes complex work", () => {
    const d2 = detectIntent(
      "Quiero investigar mis opciones de doctorado y comparar universidades.",
      { inProject: false },
    );
    assert.equal(d2.kind, "complex_work");
    assert.equal(d2.projectTitle, "Doctorado");
  });

  it("demo scenarios cover A–D article matrix", () => {
    const ids = DEMO_SCENARIOS.map((s) => s.id);
    for (const id of [
      "simple",
      "article_via_conversation",
      "article_direct",
      "research_only",
      "article",
      "task",
      "doctorado",
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
    assert.match(src, /Direct article/);
    assert.match(src, /Scientific article/);
  });
});
