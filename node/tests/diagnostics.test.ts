import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { diagnosticsExtension } from "../src/extensions/diagnostics.ts";
import { createDefaultExtensions } from "../src/extensions/defaults.ts";
import { assertValidExtension } from "../src/extensions/validate.ts";
import type { AgentExtension } from "../src/extensions/types.ts";
import { startLocalAgent } from "../src/lifecycle.ts";
import { createDefaultToolRegistry } from "../src/tools/defaults.ts";
import {
  DIAGNOSTICS_PING_NAME,
  diagnosticsPingTool,
} from "../src/tools/diagnostics.ts";
import { ToolRegistry } from "../src/tools/registry.ts";
import type { AgentTool } from "../src/tools/types.ts";

const ctx = { conversationId: "c_diag" };

const stubTool = (name: string): AgentTool => ({
  name,
  description: name,
  inputSchema: { type: "object" },
  executionMode: "automatic",
  async execute() {
    return { ok: true, content: name };
  },
});

describe("diagnostics.ping", () => {
  it("devuelve { pong: true }", async () => {
    const result = await diagnosticsPingTool.execute({}, ctx);
    assert.deepEqual(result, { ok: true, content: { pong: true } });
  });

  it("no usa filesystem, spawn, red ni process.env", () => {
    const toolSrc = readFileSync(
      fileURLToPath(new URL("../src/tools/diagnostics.ts", import.meta.url)),
      "utf8",
    );
    const extSrc = readFileSync(
      fileURLToPath(new URL("../src/extensions/diagnostics.ts", import.meta.url)),
      "utf8",
    );
    for (const src of [toolSrc, extSrc]) {
      assert.doesNotMatch(src, /node:child_process|node:fs|node:net|node:http/);
      assert.doesNotMatch(src, /process\.env/);
      assert.doesNotMatch(src, /\bspawn\(/);
      assert.doesNotMatch(src, /\bfetch\(/);
      assert.doesNotMatch(src, /import\(|require\(|eval\(|new Function/);
    }
  });
});

describe("diagnostics extension", () => {
  it("es una AgentExtension válida con diagnostics.ping", () => {
    const valid = assertValidExtension(diagnosticsExtension);
    assert.equal(valid.name, "diagnostics");
    assert.deepEqual(
      valid.tools.map((t) => t.name),
      [DIAGNOSTICS_PING_NAME],
    );
  });

  it("registra diagnostics.ping vía registerExtension", () => {
    const registry = new ToolRegistry();
    registry.registerExtension(diagnosticsExtension);
    assert.ok(registry.get(DIAGNOSTICS_PING_NAME));
  });

  it("el core no registra diagnostics.ping fuera de extensions", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../src/tools/defaults.ts", import.meta.url)),
      "utf8",
    );
    const life = readFileSync(
      fileURLToPath(new URL("../src/lifecycle.ts", import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(
      src,
      /diagnostics\.ping|diagnosticsPingTool|diagnosticsExtension/,
    );
    assert.doesNotMatch(life, /diagnostics/);
    assert.match(src, /registerExtension/);
    assert.ok(createDefaultToolRegistry().get(DIAGNOSTICS_PING_NAME));
  });
});

describe("11C presencia / ausencia", () => {
  it("con diagnostics: tools/list incluye diagnostics.ping", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "11c-on", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      assert.ok(listed.tools.some((t) => t.name === DIAGNOSTICS_PING_NAME));
      assert.equal(
        listed.tools.some((t) => "executionMode" in t),
        false,
      );
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });

  it("sin diagnostics: tools/list no incluye diagnostics.ping", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const without = createDefaultExtensions().filter(
      (e) => e.name !== "diagnostics",
    );
    const agent = await startLocalAgent(serverT, {
      registry: createDefaultToolRegistry({}, without),
    });
    const client = new Client({ name: "11c-off", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      assert.equal(
        listed.tools.some((t) => t.name === DIAGNOSTICS_PING_NAME),
        false,
      );
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });
});

describe("11C namespace diagnostics", () => {
  it("puede registrar diagnostics.ping y no filesystem/process/system", () => {
    const registry = new ToolRegistry();
    registry.registerExtension(diagnosticsExtension);
    assert.ok(registry.get("diagnostics.ping"));
    for (const name of [
      "filesystem.read",
      "filesystem.write",
      "process.execute",
      "system.info",
    ]) {
      assert.throws(
        () =>
          createDefaultToolRegistry({}, [
            { name: "diagnostics", tools: [stubTool(name)] },
          ]),
        /namespace/,
        name,
      );
    }
  });
});

describe("11C extensión inválida impide READY", () => {
  it("registry no se construye; startLocalAgent no deja started", async () => {
    const invalid: AgentExtension = {
      name: "diagnostics",
      tools: [stubTool("filesystem.read")],
    };
    assert.throws(() => createDefaultToolRegistry({}, [invalid]), /namespace/);
    const [, serverT] = InMemoryTransport.createLinkedPair();
    let started = false;
    await assert.rejects(async () => {
      const registry = createDefaultToolRegistry({}, [invalid]);
      const agent = await startLocalAgent(serverT, { registry });
      started = agent.started;
      await agent.shutdown();
    }, /namespace/);
    assert.equal(started, false);
  });
});

describe("11C contrato sin executionMode en AgentExtension", () => {
  it("AgentExtension no declara executionMode", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../src/extensions/types.ts", import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(src, /executionMode/);
    assert.doesNotMatch(src, /["']confirm["']|["']automatic["']/);
    const ext: AgentExtension = diagnosticsExtension;
    assert.equal("executionMode" in ext, false);
  });
});
