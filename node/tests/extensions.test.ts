import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { echoExtension } from "../src/extensions/echo.ts";
import { createFilesystemExtension } from "../src/extensions/filesystem.ts";
import { mathExtension } from "../src/extensions/math.ts";
import { createProcessExtension } from "../src/extensions/process.ts";
import { systemExtension } from "../src/extensions/system.ts";
import { createDefaultExtensions } from "../src/extensions/defaults.ts";
import { assertValidExtension } from "../src/extensions/validate.ts";
import type { AgentExtension } from "../src/extensions/types.ts";
import { startLocalAgent } from "../src/lifecycle.ts";
import { AGENT_ECHO, agentEchoTool } from "../src/tools/echo.ts";
import { mathAddTool } from "../src/tools/math.ts";
import { createDefaultToolRegistry } from "../src/tools/defaults.ts";
import { ToolRegistry } from "../src/tools/registry.ts";
import type { AgentTool } from "../src/tools/types.ts";

const stubTool = (name: string): AgentTool => ({
  name,
  description: name,
  inputSchema: { type: "object" },
  executionMode: "automatic",
  async execute() {
    return { ok: true, content: name };
  },
});

describe("10A AgentExtension", () => {
  it("A: extensión válida registra sus tools", () => {
    const registry = new ToolRegistry();
    const ext: AgentExtension = {
      name: "demo",
      tools: [stubTool("demo.ping")],
    };
    registry.registerExtension(ext);
    assert.ok(registry.get("demo.ping"));
  });

  it("B: echo extension registra agent.echo", () => {
    const registry = new ToolRegistry();
    registry.registerExtension(echoExtension);
    assert.equal(echoExtension.name, "echo");
    assert.equal(registry.get(AGENT_ECHO.name), agentEchoTool);
  });

  it("C: tools/list MCP contiene agent.echo", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "10a", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      assert.ok(listed.tools.some((t) => t.name === "agent.echo"));
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });

  it("E: extensión duplicada (mismo name/tools) falla al arrancar", () => {
    assert.throws(
      () => createDefaultToolRegistry({}, [mathExtension, mathExtension]),
      /duplicada/,
    );
  });

  it("F: extensión inválida falla al arrancar", () => {
    assert.throws(
      () =>
        createDefaultToolRegistry({}, [
          { name: "", tools: [stubTool("x.y")] } as AgentExtension,
        ]),
      /inválida/,
    );
    assert.throws(() => assertValidExtension(null), /inválida/);
    assert.throws(
      () =>
        createDefaultToolRegistry({}, [
          { name: "bad", tools: "nope" } as unknown as AgentExtension,
        ]),
      /tools/,
    );
  });

  it("G: extensión sin tools es no-op válido", () => {
    const registry = new ToolRegistry();
    registry.registerExtension({ name: "empty", tools: [] });
    assert.equal(registry.list().length, 0);
    const valid = assertValidExtension({ name: "empty", tools: [] });
    assert.equal(valid.tools.length, 0);
  });

  it("H–K: defaults solo vía extensions (echo, filesystem, process, math, system, diagnostics, customer, office)", () => {
    const names = createDefaultExtensions().map((e) => e.name);
    assert.deepEqual(names, [
      "echo",
      "filesystem",
      "process",
      "math",
      "system",
      "diagnostics",
      "customer",
      "office",
    ]);
    const registry = createDefaultToolRegistry();
    assert.ok(registry.get("agent.echo"));
    assert.ok(registry.get("filesystem.read"));
    assert.ok(registry.get("filesystem.write"));
    assert.ok(registry.get("filesystem.list"));
    assert.ok(registry.get("process.execute"));
    assert.ok(registry.get("math.add"));
    assert.ok(registry.get("math.subtract"));
    assert.ok(registry.get("math.multiply"));
    assert.ok(registry.get("math.divide"));
    assert.ok(registry.get("system.info"));
    assert.ok(registry.get("diagnostics.ping"));
    assert.ok(registry.get("customer.demo"));
    assert.ok(registry.get("customer.test"));
    assert.ok(registry.get("office.excel.read"));
    assert.ok(registry.get("office.excel.write"));
  });
});

describe("10B filesystem/process extensions", () => {
  it("filesystemExtension aporta read, list y write", () => {
    const ext = createFilesystemExtension();
    assert.equal(ext.name, "filesystem");
    assert.deepEqual(
      ext.tools.map((t) => t.name).sort(),
      ["filesystem.list", "filesystem.read", "filesystem.write"],
    );
  });

  it("processExtension aporta process.execute", () => {
    const ext = createProcessExtension();
    assert.equal(ext.name, "process");
    assert.deepEqual(
      ext.tools.map((t) => t.name),
      ["process.execute"],
    );
  });

  it("echoExtension aporta agent.echo", () => {
    assert.deepEqual(
      echoExtension.tools.map((t) => t.name),
      ["agent.echo"],
    );
  });

  it("createDefaultToolRegistry no registra tools fuera de extensions", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../src/tools/defaults.ts", import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(src, /createFilesystemReadTool|createFilesystemWriteTool/);
    assert.doesNotMatch(src, /createFilesystemListTool|createProcessExecuteTool/);
    assert.match(src, /registerExtension/);
  });

  it("tools/list MCP contiene las tools de las extensions (incl. math)", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "10b", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      const names = listed.tools.map((t) => t.name).sort();
      assert.deepEqual(names, [
        "agent.echo",
        "customer.demo",
        "customer.test",
        "diagnostics.ping",
        "filesystem.list",
        "filesystem.read",
        "filesystem.write",
        "math.add",
        "math.divide",
        "math.multiply",
        "math.subtract",
        "office.excel.read",
        "office.excel.write",
        "process.execute",
        "system.info",
      ]);
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });
});

describe("10C math extension", () => {
  it("mathExtension aporta las cuatro operaciones", () => {
    assert.equal(mathExtension.name, "math");
    assert.deepEqual(
      mathExtension.tools.map((t) => t.name).sort(),
      ["math.add", "math.divide", "math.multiply", "math.subtract"],
    );
  });
});

describe("11A AgentExtension namespace y fail-closed", () => {
  it("A: tool fuera de namespace falla", () => {
    assert.throws(
      () =>
        createDefaultToolRegistry({}, [
          { name: "filesystem", tools: [stubTool("process.execute")] },
        ]),
      /namespace/,
    );
    assert.throws(
      () =>
        createDefaultToolRegistry({}, [
          { name: "foo", tools: [stubTool("filesystem.read")] },
        ]),
      /namespace/,
    );
  });

  it("B: tool duplicada dentro de la misma extensión falla", () => {
    assert.throws(
      () =>
        assertValidExtension({
          name: "math",
          tools: [mathAddTool, mathAddTool],
        }),
      /duplicada/,
    );
  });

  it("C: dos extensiones con el mismo name fallan", () => {
    assert.throws(
      () =>
        createDefaultToolRegistry({}, [
          { name: "empty", tools: [] },
          { name: "empty", tools: [] },
        ]),
      /duplicada/,
    );
  });

  it("D: extensión inválida no construye registry (MCP no arranca)", () => {
    assert.throws(
      () =>
        createDefaultToolRegistry({}, [
          { name: "bad name", tools: [] } as AgentExtension,
        ]),
      /inválida/,
    );
    assert.throws(
      () =>
        createDefaultToolRegistry({}, [
          { name: "x.y", tools: [] } as AgentExtension,
        ]),
      /inválida/,
    );
  });

  it("echo solo puede registrar agent.echo", () => {
    assert.throws(
      () =>
        createDefaultToolRegistry({}, [
          { name: "echo", tools: [stubTool("echo.ping")] },
        ]),
      /namespace/,
    );
  });
});

describe("11B system extension y namespace", () => {
  it("systemExtension aporta solo system.info", () => {
    assert.equal(systemExtension.name, "system");
    assert.deepEqual(
      systemExtension.tools.map((t) => t.name),
      ["system.info"],
    );
  });

  it("system no puede registrar filesystem.write (sin privilegio extra)", () => {
    assert.throws(
      () =>
        createDefaultToolRegistry({}, [
          { name: "system", tools: [stubTool("filesystem.write")] },
        ]),
      /namespace/,
    );
  });

  it("system no puede registrar process.execute", () => {
    assert.throws(
      () =>
        createDefaultToolRegistry({}, [
          { name: "system", tools: [stubTool("process.execute")] },
        ]),
      /namespace/,
    );
  });

  it("nombres inválidos: system, filesystem.system; excel.read es local anidado válido", () => {
    assert.throws(
      () =>
        createDefaultToolRegistry({}, [
          { name: "system", tools: [stubTool("system")] },
        ]),
      /namespace/,
    );
    assert.throws(
      () =>
        createDefaultToolRegistry({}, [
          { name: "system", tools: [stubTool("filesystem.system")] },
        ]),
      /namespace/,
    );
    const nested = createDefaultToolRegistry({}, [
      { name: "office", tools: [stubTool("office.excel.read")] },
    ]);
    assert.ok(nested.get("office.excel.read"));
  });
});
