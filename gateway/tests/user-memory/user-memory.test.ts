/**
 * Memoria personal — clasificación, no-memoria, lifecycle, aislamiento de proyecto.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, before } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-user-memory-"));
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const { runMigrations } = await import("../../src/db/database.ts");
const { ensureLocalIdentity } = await import("../../src/identity/ensure-local.ts");
const { LOCAL_USER_ID } = await import("../../src/identity/types.ts");
const {
  classifyMemoryText,
  evaluateMemoryCandidate,
  evaluateUtterance,
  processMemoryCandidates,
  createUserMemory,
  listUserMemories,
  forgetUserMemory,
  expireDueMemories,
  getUserMemoryById,
  contentSimilarity,
} = await import("../../src/user-memory/index.ts");
const { listAgentRules } = await import("../../src/agent-rules/index.ts");

before(() => {
  runMigrations();
  ensureLocalIdentity();
});

describe("user-memory classification", () => {
  const cases: Array<[string, string]> = [
    ["I prefer concise answers.", "PREFERENCES"],
    ["I prefer concise technical explanations.", "PREFERENCES"],
    ["I'm interested in AI.", "INTERESTS"],
    ["I want to publish a book.", "GOALS"],
    ["I'm building an AI agent.", "WORK_AND_PROJECTS"],
    ["Pedro is my business partner.", "PEOPLE_AND_RELATIONSHIPS"],
    ["I usually work late.", "HABITS"],
    ["CFE is paid monthly.", "IMPORTANT_INFORMATION"],
  ];

  for (const [text, category] of cases) {
    it(`classifies «${text}» → ${category}`, () => {
      const c = classifyMemoryText(text);
      assert.equal(c.kind, "memory");
      if (c.kind === "memory") assert.equal(c.category, category);
    });
  }
});

describe("user-memory non-memory", () => {
  it("ignores ephemeral tiredness", () => {
    const c = classifyMemoryText("I'm tired today.");
    assert.equal(c.kind, "ephemeral");
    const r = evaluateUtterance("I'm tired today.", []);
    assert.equal(r.outcome, "IGNORE");
  });

  it("keeps project knowledge out of global memory", () => {
    const c = classifyMemoryText("This paper uses difference-in-differences.");
    assert.equal(c.kind, "project_knowledge");
    const r = evaluateMemoryCandidate(
      {
        content: "This paper uses difference-in-differences.",
        fromProjectKnowledge: true,
        projectId: "ws_1",
      },
      [],
    );
    assert.equal(r.outcome, "IGNORE");
  });

  it("routes agent rules to Settings, not Memory", () => {
    const c = classifyMemoryText("Ask me before making payments.");
    assert.equal(c.kind, "agent_rule");
    const applied = processMemoryCandidates(LOCAL_USER_ID, [
      { content: "Ask me before making payments.", type: "EXPLICIT" },
    ]);
    assert.equal(applied[0]?.outcome, "ROUTE_TO_AGENT_RULE");
    assert.ok(applied[0]?.applied);
    const rules = listAgentRules(LOCAL_USER_ID);
    assert.ok(rules.some((r) => /payment|pag/i.test(r.content)));
    const memories = listUserMemories({ userId: LOCAL_USER_ID });
    assert.ok(!memories.some((m) => /payment|pag/i.test(m.content)));
  });
});

describe("user-memory lifecycle", () => {
  it("creates, dedupes (merge), and supersedes preferences", () => {
    const a = processMemoryCandidates(LOCAL_USER_ID, [
      {
        content: "User prefers long explanations.",
        category: "PREFERENCES",
        type: "INFERRED",
        confidence: 0.6,
      },
    ]);
    assert.equal(a[0]?.outcome, "CREATE");
    const id = a[0]?.memory?.id;
    assert.ok(id);

    const merge = processMemoryCandidates(LOCAL_USER_ID, [
      {
        content: "User prefers long explanations.",
        category: "PREFERENCES",
        type: "EXPLICIT",
        confidence: 0.9,
      },
    ]);
    assert.equal(merge[0]?.outcome, "MERGE");
    const afterMerge = getUserMemoryById(id!);
    assert.ok(afterMerge);
    assert.ok((afterMerge.confidence ?? 0) > 0.6);

    const supersede = processMemoryCandidates(LOCAL_USER_ID, [
      {
        content: "User prefers concise explanations.",
        category: "PREFERENCES",
        type: "EXPLICIT",
        confidence: 0.95,
      },
    ]);
    assert.equal(supersede[0]?.outcome, "SUPERSEDE");
    const old = getUserMemoryById(id!);
    assert.equal(old?.status, "SUPERSEDED");
    assert.ok(old?.supersededBy);
    const next = getUserMemoryById(old!.supersededBy!);
    assert.equal(next?.status, "ACTIVE");
    assert.match(next!.content, /concise/i);
  });

  it("explicit beats weaker inferred on conflict", () => {
    const created = createUserMemory({
      userId: LOCAL_USER_ID,
      category: "PREFERENCES",
      type: "EXPLICIT",
      scope: "GLOBAL",
      content: "Prefiere respuestas breves.",
      confidence: 0.9,
    });
    const r = evaluateMemoryCandidate(
      {
        content: "Prefiere respuestas muy largas y detalladas.",
        category: "PREFERENCES",
        type: "INFERRED",
        confidence: 0.4,
      },
      [created],
    );
    // Explicit existing has higher authority than weak inferred
    assert.ok(r.outcome === "IGNORE" || r.outcome === "SUPERSEDE");
    if (r.outcome === "SUPERSEDE") {
      // Only if similarity/conflict triggers and authority allows — EXPLICIT new would win;
      // INFERRED should IGNORE when old is EXPLICIT
      assert.fail("weak inferred should not supersede explicit");
    }
  });

  it("raises confidence on merge and soft-forgets", () => {
    const m = createUserMemory({
      userId: LOCAL_USER_ID,
      category: "INTERESTS",
      type: "EXPLICIT",
      scope: "GLOBAL",
      content: "Interested in quantitative finance.",
      confidence: 0.5,
    });
    const merged = processMemoryCandidates(LOCAL_USER_ID, [
      {
        content: "Interested in quantitative finance.",
        category: "INTERESTS",
        type: "OBSERVED",
        confidence: 0.7,
      },
    ]);
    assert.equal(merged[0]?.outcome, "MERGE");
    const forgotten = forgetUserMemory(m.id);
    assert.equal(forgotten.status, "DELETED");
  });

  it("expires due memories", () => {
    const m = createUserMemory({
      userId: LOCAL_USER_ID,
      category: "IMPORTANT_INFORMATION",
      type: "EXPLICIT",
      scope: "TEMPORARY",
      content: "Temporal note for expiry test.",
      expiresAt: "2000-01-01T00:00:00",
    });
    const n = expireDueMemories(LOCAL_USER_ID);
    assert.ok(n >= 1);
    const again = getUserMemoryById(m.id);
    assert.equal(again?.status, "ARCHIVED");
  });

  it("contentSimilarity detects near-duplicates", () => {
    assert.ok(
      contentSimilarity(
        "prefers concise explanations",
        "prefers concise technical explanations",
      ) > 0.4,
    );
  });
});

describe("user-memory project isolation", () => {
  it("does not promote project knowledge automatically", () => {
    const before = listUserMemories({ userId: LOCAL_USER_ID, scope: "GLOBAL" })
      .length;
    const results = processMemoryCandidates(LOCAL_USER_ID, [
      {
        content: "The manuscript must cite peer-reviewed sources.",
        fromProjectKnowledge: true,
        projectId: "ws_paper",
        type: "INFERRED",
      },
    ]);
    assert.equal(results[0]?.outcome, "IGNORE");
    const after = listUserMemories({ userId: LOCAL_USER_ID, scope: "GLOBAL" })
      .length;
    assert.equal(after, before);
  });

  it("allows intentional PROJECT_DERIVED promotion of durable user facts", () => {
    const results = processMemoryCandidates(LOCAL_USER_ID, [
      {
        content: "I want to publish scientific papers as a long-term goal.",
        type: "PROJECT_DERIVED",
        scope: "GLOBAL",
        category: "GOALS",
        projectId: null,
        confidence: 0.8,
        sourceType: "project",
        sourceId: "ws_paper",
        sourceReason: "Hecho durable del usuario visto en el proyecto.",
      },
    ]);
    assert.ok(
      results[0]?.outcome === "CREATE" ||
        results[0]?.outcome === "PROMOTE_TO_GLOBAL" ||
        results[0]?.outcome === "MERGE" ||
        results[0]?.outcome === "UPDATE" ||
        results[0]?.outcome === "SUPERSEDE",
    );
    assert.ok(results[0]?.applied);
    assert.equal(results[0]?.memory?.category, "GOALS");
    assert.equal(results[0]?.memory?.scope, "GLOBAL");
    assert.equal(results[0]?.memory?.type, "PROJECT_DERIVED");
  });
});
