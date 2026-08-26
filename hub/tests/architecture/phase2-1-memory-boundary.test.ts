/**
 * PHASE 2.1: frontera TurnMemory.
 * El Runtime conoce el contrato, no SQLite ni history.ts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createSqliteTurnMemory } from "../../src/memory/sqlite-turn-memory.ts";
import type { TurnMemory } from "../../src/memory/types.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const RUNTIME = path.join(repoRoot, "hub/src/agent/runtime.ts");
const MEMORY_TYPES = path.join(repoRoot, "hub/src/memory/types.ts");

describe("PHASE 2.1 frontera TurnMemory", () => {
  it("el contrato vive una sola vez en memory/types.ts", () => {
    const types = readFileSync(MEMORY_TYPES, "utf8");
    const runtime = readFileSync(RUNTIME, "utf8");
    assert.match(types, /export interface TurnMemory/);
    assert.doesNotMatch(runtime, /export interface TurnMemory/);
    assert.match(
      runtime,
      /import type \{ TurnMemory \} from ["']\.\.\/memory\/types\.ts["']/,
    );
  });

  it("runtime.ts no importa history.ts ni better-sqlite3", () => {
    const runtime = readFileSync(RUNTIME, "utf8");
    assert.doesNotMatch(runtime, /memory\/history/);
    assert.doesNotMatch(runtime, /sqlite-turn-memory/);
    assert.doesNotMatch(runtime, /better-sqlite3/);
    assert.doesNotMatch(runtime, /from ["']\.\.\/db\//);
  });

  it("createSqliteTurnMemory implementa TurnMemory", () => {
    const memory: TurnMemory = createSqliteTurnMemory();
    assert.equal(typeof memory.ensureConversation, "function");
    assert.equal(typeof memory.addMessage, "function");
    assert.equal(typeof memory.getHistory, "function");
  });
});
