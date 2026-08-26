import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mathAddTool,
  mathDivideTool,
  mathMultiplyTool,
  mathSubtractTool,
} from "../src/tools/math.ts";
import { mathExtension } from "../src/extensions/math.ts";
import { assertValidExtension } from "../src/extensions/validate.ts";
import { ToolRegistry } from "../src/tools/registry.ts";
import { createDefaultToolRegistry } from "../src/tools/defaults.ts";

const ctx = { conversationId: "c_math" };

describe("math tools", () => {
  it("math.add(2, 3) → 5", async () => {
    const result = await mathAddTool.execute({ a: 2, b: 3 }, ctx);
    assert.deepEqual(result, { ok: true, content: { result: 5 } });
  });

  it("math.subtract(10, 4) → 6", async () => {
    const result = await mathSubtractTool.execute({ a: 10, b: 4 }, ctx);
    assert.deepEqual(result, { ok: true, content: { result: 6 } });
  });

  it("math.multiply(3, 4) → 12", async () => {
    const result = await mathMultiplyTool.execute({ a: 3, b: 4 }, ctx);
    assert.deepEqual(result, { ok: true, content: { result: 12 } });
  });

  it("math.divide(10, 2) → 5", async () => {
    const result = await mathDivideTool.execute({ a: 10, b: 2 }, ctx);
    assert.deepEqual(result, { ok: true, content: { result: 5 } });
  });

  it("math.divide entre cero es fail-closed", async () => {
    const result = await mathDivideTool.execute({ a: 1, b: 0 }, ctx);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "division_by_zero");
  });

  it("input inválido falla fail-closed", async () => {
    const bad = await mathAddTool.execute({ a: "x", b: 1 }, ctx);
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.error.code, "invalid_input");
    const inf = await mathSubtractTool.execute(
      { a: 1, b: Number.POSITIVE_INFINITY },
      ctx,
    );
    assert.equal(inf.ok, false);
  });
});

describe("math extension", () => {
  it("es una AgentExtension válida", () => {
    const valid = assertValidExtension(mathExtension);
    assert.equal(valid.name, "math");
    assert.deepEqual(
      valid.tools.map((t) => t.name).sort(),
      ["math.add", "math.divide", "math.multiply", "math.subtract"],
    );
  });

  it("registra las cuatro operaciones math.*", () => {
    const registry = new ToolRegistry();
    registry.registerExtension(mathExtension);
    assert.ok(registry.get("math.add"));
    assert.ok(registry.get("math.subtract"));
    assert.ok(registry.get("math.multiply"));
    assert.ok(registry.get("math.divide"));
  });

  it("duplicar math.add falla sin overwrite", () => {
    assert.throws(
      () => createDefaultToolRegistry({}, [mathExtension, mathExtension]),
      /duplicada|ya registrada/,
    );
  });
});
