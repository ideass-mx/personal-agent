/**
 * Setup capacity must not enter Agent Runtime import graph.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const RUNTIME = path.join(repoRoot, "gateway/src/agents/runtime.ts");

const IMPORT_RE =
  /import\s+(type\s+)?(?:[^;]*?)\s+from\s+["']([^"']+)["']/g;

function walkTs(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules") continue;
      walkTs(full, files);
      continue;
    }
    if (name.endsWith(".ts")) files.push(full);
  }
  return files;
}

function parseImports(source: string): { typeOnly: boolean; spec: string }[] {
  const out: { typeOnly: boolean; spec: string }[] = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    out.push({ typeOnly: Boolean(m[1]), spec: m[2]! });
  }
  return out;
}

function resolveRelative(fromFile: string, spec: string): string | undefined {
  if (!spec.startsWith(".")) return undefined;
  const base = path.resolve(path.dirname(fromFile), spec);
  if (existsSync(base)) return base;
  if (existsSync(base + ".ts")) return base + ".ts";
  return undefined;
}

function valueImportGraph(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    for (const imp of parseImports(src)) {
      if (imp.typeOnly) continue;
      const resolved = resolveRelative(file, imp.spec);
      if (resolved) queue.push(resolved);
    }
  }
  return [...seen];
}

describe("setup state boundaries", () => {
  it("Agent Runtime no importa setup/", () => {
    const graph = valueImportGraph(RUNTIME);
    for (const file of graph) {
      assert.equal(
        file.includes(`${path.sep}setup${path.sep}`),
        false,
        `Runtime importó setup: ${file}`,
      );
    }
  });

  it("setup-store no importa agents/runtime", () => {
    const store = path.join(repoRoot, "gateway/src/setup/setup-store.ts");
    const src = readFileSync(store, "utf8");
    assert.doesNotMatch(src, /agents\/runtime/);
    assert.doesNotMatch(src, /from ["']hono/);
  });

  it("server monta setup-http", () => {
    const server = path.join(repoRoot, "gateway/src/http/server.ts");
    const src = readFileSync(server, "utf8");
    assert.match(src, /mountSetupHttp/);
    assert.match(src, /setup-http/);
  });

  it("migración 008 existe", () => {
    assert.ok(
      existsSync(path.join(repoRoot, "db/migrations/008_setup_state.sql")),
    );
  });

  it("ProviderRegistry existe y no finge OpenAI/Google", () => {
    const reg = path.join(repoRoot, "gateway/src/providers/registry.ts");
    assert.ok(existsSync(reg));
    const src = readFileSync(reg, "utf8");
    assert.match(src, /available:\s*true/);
    assert.match(src, /id:\s*"openai"[\s\S]*available:\s*false/);
    assert.match(src, /id:\s*"google"[\s\S]*available:\s*false/);
  });
});
