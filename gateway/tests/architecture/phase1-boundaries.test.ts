/**
 * PHASE 1: fronteras Agent Platform (docs + grafo de imports).
 * No valida runtime distribuido ni rename de carpetas.
 */
import assert from "node:assert/strict";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const RUNTIME = path.join(repoRoot, "gateway/src/agents/runtime.ts");

const FORBIDDEN_SPEC = [
  /^hono$/,
  /^@hono\//,
  /^ws$/,
  /^@modelcontextprotocol\//,
  /^better-sqlite3$/,
  /^node:fs$/,
  /^node:fs\/promises$/,
  /^node:child_process$/,
  /^winax$/,
];

const FORBIDDEN_SOURCE = [
  /from ["']hono["']/,
  /from ["']ws["']/,
  /@modelcontextprotocol\/sdk/,
  /better-sqlite3/,
  /from ["']node:fs/,
  /from ["']node:child_process["']/,
  /from ["']winax["']/,
  /Excel\.Application/,
];

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

/** Grafo de imports de valor (no `import type`) desde runtime.ts. */
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

describe("PHASE 1 fronteras Agent Platform", () => {
  it("A–E Agent Runtime no importa Hono, WS, MCP SDK, fs, Excel ni SQLite", () => {
    const runtimeSrc = readFileSync(RUNTIME, "utf8");
    for (const re of FORBIDDEN_SOURCE) {
      assert.doesNotMatch(runtimeSrc, re, String(re));
    }

    for (const file of valueImportGraph(RUNTIME)) {
      const src = readFileSync(file, "utf8");
      const rel = path.relative(repoRoot, file);
      for (const re of FORBIDDEN_SOURCE) {
        assert.doesNotMatch(src, re, `${rel} ${re}`);
      }
      for (const imp of parseImports(src)) {
        for (const ban of FORBIDDEN_SPEC) {
          assert.equal(
            ban.test(imp.spec),
            false,
            `${rel} importa ${imp.spec}`,
          );
        }
      }
    }

    assert.doesNotMatch(runtimeSrc, /from ["'].*memory\/history\.ts["']/);
  });

  it("F no hay un segundo Agent Runtime por especialización", () => {
    const srcDirs = [
      path.join(repoRoot, "gateway/src"),
      path.join(repoRoot, "node/src"),
    ];
    for (const dir of srcDirs) {
      for (const file of walkTs(dir)) {
        const text = readFileSync(file, "utf8");
        const rel = path.relative(repoRoot, file);
        assert.doesNotMatch(text, /WriterRuntime|ResearchRuntime|EditorRuntime/, rel);
        assert.doesNotMatch(text, /createWriterRuntime|createResearchRuntime/, rel);
        assert.doesNotMatch(
          text,
          /SingleNodeRuntime|SingleNodeGateway|LocalDeploymentArchitecture/,
          rel,
        );
      }
    }
    const runtimeFiles = walkTs(path.join(repoRoot, "gateway/src/agents")).filter(
      (f) => path.basename(f) === "runtime.ts",
    );
    assert.equal(runtimeFiles.length, 1);
    assert.equal(
      runtimeFiles[0],
      path.join(repoRoot, "gateway/src/agents/runtime.ts"),
    );
  });

  it("G existe carpeta node/ de producto (PHASE 53)", () => {
    assert.equal(existsSync(path.join(repoRoot, "node")), true);
  });

  it("H I J vocabulario: Gateway oficial, Hub físico, término descartado ausente", () => {
    const terminology = readFileSync(
      path.join(repoRoot, "docs/architecture/terminology.md"),
      "utf8",
    );
    const boundaries = readFileSync(
      path.join(repoRoot, "docs/architecture/boundaries.md"),
      "utf8",
    );
    const combined = `${terminology}\n${boundaries}`;
    assert.match(combined, /Agent Platform/);
    assert.match(combined, /\*\*Gateway\*\*/);
    assert.match(combined, /Agent Runtime/);
    assert.match(combined, /\*\*Node\*\*/);
    assert.match(combined, /\*\*Tool\*\*/);
    assert.match(combined, /MCP Server/);
    assert.match(combined, /MCP Adapter/);
    assert.match(combined, /\*\*Workspace\*\*/);
    assert.match(combined, /\*\*Conversation\*\*/);
    assert.match(combined, /`gateway\/`|`hub\/`/);
    for (const text of [terminology, boundaries]) {
      assert.doesNotMatch(text, /Control Plane/i);
      assert.doesNotMatch(text, /control-plane/i);
      assert.doesNotMatch(text, /ControlPlane/);
    }
    assert.match(terminology, /Gateway/);
    assert.match(terminology, /legacy Gateway Gateway/);
    assert.match(terminology, /`attachGateway`/);
    assert.match(terminology, /Deuda de nomenclatura/);
    assert.match(terminology, /Local Node/);
    assert.match(terminology, /concepto canónico/i);
    assert.match(boundaries, /MCP Client → stdio/);
    assert.match(terminology, /Book Agent/);

    for (const dir of [
      path.join(repoRoot, "gateway/src"),
      path.join(repoRoot, "node/src"),
    ]) {
      for (const file of walkTs(dir)) {
        const text = readFileSync(file, "utf8");
        assert.doesNotMatch(
          text,
          /Control Plane|control-plane|ControlPlane/,
          path.relative(repoRoot, file),
        );
      }
    }
  });
});
