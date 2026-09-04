/**
 * PHASE 56.1-B — Tool inputSchema plumbing MCP → RemoteAgentTool → LLM descriptor.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toLLMToolDescriptor } from "../../src/tools/descriptor.ts";
import {
  GENERIC_INPUT_SCHEMA,
  SCHEMA_FALLBACK_KEY,
  isSchemaFallback,
  sanitizeDiscoveredInputSchema,
} from "../../src/tools/schema-sanitize.ts";
import { registerDiscoveredAgentTools } from "../../src/tools/discover.ts";
import { ToolRegistry } from "../../src/tools/registry.ts";
import type { RemoteToolExecutor } from "../../src/tools/remote.ts";

const REQUIRED = [
  "filesystem.read",
  "filesystem.list",
  "filesystem.write",
  "process.execute",
] as const;

function baseListed(
  extras: Array<{ name: string; description?: string; inputSchema?: unknown }> = [],
) {
  const required = REQUIRED.map((name) => ({
    name,
    description: name,
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  }));
  return { tools: [...required, ...extras] };
}

const noopExecutor: RemoteToolExecutor = {
  async execute(req) {
    return {
      requestId: req.requestId,
      result: { ok: true, content: {} },
    };
  },
};

describe("PHASE 56.1-B schema sanitize", () => {
  it("schema simple object", () => {
    const r = sanitizeDiscoveredInputSchema({
      type: "object",
      properties: { title: { type: "string" } },
    });
    assert.equal(r.usedFallback, false);
    assert.equal((r.schema.properties as { title: { type: string } }).title.type, "string");
  });

  it("schema con múltiples propiedades y required", () => {
    const r = sanitizeDiscoveredInputSchema({
      type: "object",
      properties: {
        a: { type: "string" },
        b: { type: "number" },
        c: { type: "boolean" },
      },
      required: ["a", "b"],
      additionalProperties: false,
    });
    assert.equal(r.usedFallback, false);
    assert.deepEqual(r.schema.required, ["a", "b"]);
    assert.equal(r.schema.additionalProperties, false);
  });

  it("enum", () => {
    const r = sanitizeDiscoveredInputSchema({
      type: "object",
      properties: {
        format: { type: "string", enum: ["pdf", "docx", "md"] },
      },
    });
    assert.equal(r.usedFallback, false);
    const format = (r.schema.properties as { format: { enum: string[] } }).format;
    assert.deepEqual(format.enum, ["pdf", "docx", "md"]);
  });

  it("nested objects", () => {
    const r = sanitizeDiscoveredInputSchema({
      type: "object",
      properties: {
        meta: {
          type: "object",
          properties: {
            author: { type: "string" },
          },
          required: ["author"],
        },
      },
    });
    assert.equal(r.usedFallback, false);
    const meta = (r.schema.properties as { meta: { properties: { author: unknown } } })
      .meta;
    assert.ok(meta.properties.author);
  });

  it("array items", () => {
    const r = sanitizeDiscoveredInputSchema({
      type: "object",
      properties: {
        tags: { type: "array", items: { type: "string" }, minItems: 1 },
      },
    });
    assert.equal(r.usedFallback, false);
    const tags = (r.schema.properties as { tags: { type: string; items: { type: string } } })
      .tags;
    assert.equal(tags.type, "array");
    assert.equal(tags.items.type, "string");
  });

  it("fallback cuando schema falta", () => {
    const r = sanitizeDiscoveredInputSchema(undefined);
    assert.equal(r.usedFallback, true);
    assert.equal(r.reason, "missing");
    assert.equal(isSchemaFallback(r.schema), true);
    assert.equal(r.schema[SCHEMA_FALLBACK_KEY], true);
    assert.equal(r.schema.type, GENERIC_INPUT_SCHEMA.type);
  });

  it("schema inválido → fallback", () => {
    const r = sanitizeDiscoveredInputSchema("not-an-object");
    assert.equal(r.usedFallback, true);
    assert.equal(r.reason, "invalid_type");
    assert.equal(isSchemaFallback(r.schema), true);
  });

  it("descriptor LLM conserva schema esperado tras discovery", async () => {
    const registry = new ToolRegistry();
    const rich = {
      type: "object",
      properties: {
        title: { type: "string", description: "Titulo" },
        pages: { type: "integer", minimum: 1 },
        format: { type: "string", enum: ["pdf", "md"] },
      },
      required: ["title"],
      additionalProperties: false,
    };
    const policy = {
      "filesystem.read": "automatic" as const,
      "filesystem.list": "automatic" as const,
      "filesystem.write": "confirm" as const,
      "process.execute": "confirm" as const,
      "agent.echo": "automatic" as const,
    };
    await registerDiscoveredAgentTools(
      registry,
      {
        listTools: async () =>
          baseListed([
            {
              name: "agent.echo",
              description: "echo",
              inputSchema: rich,
            },
          ]),
      },
      noopExecutor,
      { policy },
    );
    const tool = registry.get("agent.echo");
    assert.ok(tool);
    const desc = toLLMToolDescriptor(tool!);
    assert.equal(desc.name, "agent.echo");
    assert.deepEqual(desc.inputSchema.required, ["title"]);
    assert.equal(
      (desc.inputSchema.properties as { title: { type: string } }).title.type,
      "string",
    );
    assert.deepEqual(
      (desc.inputSchema.properties as { format: { enum: string[] } }).format.enum,
      ["pdf", "md"],
    );
    assert.equal(isSchemaFallback(desc.inputSchema), false);
  });

  it("discovery usa fallback marcado si schema ausente", async () => {
    const registry = new ToolRegistry();
    const policy = {
      "filesystem.read": "automatic" as const,
      "filesystem.list": "automatic" as const,
      "filesystem.write": "confirm" as const,
      "process.execute": "confirm" as const,
      "math.add": "automatic" as const,
    };
    await registerDiscoveredAgentTools(
      registry,
      {
        listTools: async () =>
          baseListed([
            {
              name: "math.add",
              description: "add",
              // inputSchema omitted
            },
          ]),
      },
      noopExecutor,
      { policy },
    );
    const tool = registry.get("math.add");
    assert.ok(tool);
    assert.equal(isSchemaFallback(tool!.inputSchema), true);
  });
});
