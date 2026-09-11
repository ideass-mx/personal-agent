/**
 * PHASE 64 — Experience Layer web contract / security smoke tests.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  assertSafeStructuredResult,
  FIXTURE_BY_ID,
  FIXTURE_RESEARCH_COMPARISON,
  FIXTURE_RESEARCH_COMPLETED,
} from "../../gateway/src/experience/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const expDir = path.join(here, "../src/experience");

describe("PHASE 64 experience web", () => {
  it("research completed has compare + sources + report actions", () => {
    const research = FIXTURE_RESEARCH_COMPLETED.blocks.find(
      (b) => b.type === "research",
    );
    assert.ok(research && research.type === "research");
    const actions = research.actions?.map((a) => a.action) || [];
    assert.ok(actions.includes("research.compare"));
    assert.ok(actions.includes("research.sources"));
    assert.ok(actions.includes("research.report"));
  });

  it("comparison fixture adds comparison block", () => {
    const types = FIXTURE_RESEARCH_COMPARISON.blocks.map((b) => b.type);
    assert.ok(types.includes("research"));
    assert.ok(types.includes("comparison"));
  });

  it("all fixtures round-trip safely", () => {
    for (const fixture of Object.values(FIXTURE_BY_ID)) {
      assertSafeStructuredResult(JSON.parse(JSON.stringify(fixture)));
    }
  });

  it("Experience Layer renderers never use dangerouslySetInnerHTML or eval", () => {
    const files = [
      "renderers/StructuredBlockRenderer.tsx",
      "renderers/StructuredBlockView.tsx",
      "renderers/ActionBar.tsx",
      "ResearchExperience.tsx",
      "ExperienceLabScreen.tsx",
      "conversationFirst/ConversationFirstDemo.tsx",
    ];
    for (const f of files) {
      const src = fs.readFileSync(path.join(expDir, f), "utf8");
      assert.equal(src.includes("dangerouslySetInnerHTML"), false, f);
      assert.equal(/\beval\s*\(/.test(src), false, f);
      assert.equal(src.includes("new Function"), false, f);
    }
  });

  it("ResearchExperience opens SourcesPanel without fetch/search APIs", () => {
    const src = fs.readFileSync(
      path.join(expDir, "ResearchExperience.tsx"),
      "utf8",
    );
    assert.match(src, /SourcesPanel/);
    assert.match(src, /research\.sources/);
    assert.doesNotMatch(src, /research\.search|fetch\(/);
  });

  it("workflow actions cover compare / report / approval", () => {
    const src = fs.readFileSync(
      path.join(expDir, "ResearchExperience.tsx"),
      "utf8",
    );
    assert.match(src, /research\.compare/);
    assert.match(src, /FIXTURE_RESEARCH_ARTIFACT/);
    assert.match(src, /approval\.approve/);
    assert.match(src, /approval\.reject/);
  });
});
