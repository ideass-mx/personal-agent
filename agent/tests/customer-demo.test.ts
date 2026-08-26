import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { customerDemoExtension } from "../src/extensions/customer-demo.ts";
import { createDefaultExtensions } from "../src/extensions/defaults.ts";
import { assertValidExtension } from "../src/extensions/validate.ts";
import type { AgentExtension } from "../src/extensions/types.ts";
import { startLocalAgent } from "../src/lifecycle.ts";
import { createDefaultToolRegistry } from "../src/tools/defaults.ts";
import {
  CUSTOMER_DEMO_NAME,
  customerDemoTool,
} from "../src/tools/customer-demo.ts";
import { CUSTOMER_TEST_NAME } from "../src/tools/customer-test.ts";
import { ToolRegistry } from "../src/tools/registry.ts";
import type { AgentTool } from "../src/tools/types.ts";

const ctx = { conversationId: "c_customer" };
const agentRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const stubTool = (name: string): AgentTool => ({
  name,
  description: name,
  inputSchema: { type: "object" },
  executionMode: "automatic",
  async execute() {
    return { ok: true, content: name };
  },
});

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

describe("13A customer.demo", () => {
  it("devuelve { customer: \"demo\", message }", async () => {
    const result = await customerDemoTool.execute(
      { message: "hola" },
      ctx,
    );
    assert.deepEqual(result, {
      ok: true,
      content: { customer: "demo", message: "hola" },
    });
  });

  it("rechaza input sin message string", async () => {
    const result = await customerDemoTool.execute({}, ctx);
    assert.equal(result.ok, false);
  });

  it("no usa filesystem, spawn, red ni process.env", () => {
    const toolSrc = readFileSync(
      fileURLToPath(new URL("../src/tools/customer-demo.ts", import.meta.url)),
      "utf8",
    );
    const extSrc = readFileSync(
      fileURLToPath(
        new URL("../src/extensions/customer-demo.ts", import.meta.url),
      ),
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

describe("13A customer extension", () => {
  it("es AgentExtension válida: identidad customer → customer.demo", () => {
    const valid = assertValidExtension(customerDemoExtension);
    assert.equal(valid.name, "customer");
    assert.deepEqual(
      valid.tools.map((t) => t.name),
      [CUSTOMER_DEMO_NAME, CUSTOMER_TEST_NAME],
    );
  });

  it("registra customer.demo vía registerExtension", () => {
    const registry = new ToolRegistry();
    registry.registerExtension(customerDemoExtension);
    assert.ok(registry.get(CUSTOMER_DEMO_NAME));
    assert.ok(registry.get(CUSTOMER_TEST_NAME));
  });

  it("el core no registra customer.demo fuera de extensions", () => {
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
      /customer\.demo|customerDemoTool|customerDemoExtension/,
    );
    assert.doesNotMatch(life, /customer/);
    assert.match(src, /registerExtension/);
    assert.ok(createDefaultToolRegistry().get(CUSTOMER_DEMO_NAME));
  });
});

describe("13A presencia / ausencia", () => {
  it("con customer: tools/list incluye customer.demo", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const agent = await startLocalAgent(serverT);
    const client = new Client({ name: "13a-on", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      assert.ok(listed.tools.some((t) => t.name === CUSTOMER_DEMO_NAME));
      assert.ok(listed.tools.some((t) => t.name === CUSTOMER_TEST_NAME));
      assert.equal(
        listed.tools.some((t) => "executionMode" in t),
        false,
      );
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });

  it("sin customer: tools/list no incluye customer.demo; MCP fail-closed", async () => {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const without = createDefaultExtensions().filter(
      (e) => e.name !== "customer",
    );
    const agent = await startLocalAgent(serverT, {
      registry: createDefaultToolRegistry({}, without),
    });
    const client = new Client({ name: "13a-off", version: "0.0.0" });
    await client.connect(clientT);
    try {
      const listed = await client.listTools();
      assert.equal(
        listed.tools.some((t) => t.name === CUSTOMER_DEMO_NAME),
        false,
      );
      assert.equal(
        listed.tools.some((t) => t.name === CUSTOMER_TEST_NAME),
        false,
      );
      const mcp = await client.callTool({
        name: CUSTOMER_DEMO_NAME,
        arguments: {
          requestId: "rt_off",
          context: { conversationId: "c" },
          input: { message: "x" },
        },
      });
      assert.equal(mcp.isError, true);
    } finally {
      await client.close();
      await agent.shutdown();
    }
  });
});

describe("13A namespace 11A sin relajar", () => {
  it("customer no puede registrar filesystem.write ni process.execute", () => {
    for (const name of ["filesystem.write", "process.execute", "agent.echo"]) {
      assert.throws(
        () =>
          createDefaultToolRegistry({}, [
            { name: "customer", tools: [stubTool(name)] },
          ]),
        /namespace/,
        name,
      );
    }
  });

  it("customer-demo + customer.demo no es un mapeo 11A; filesystem.write fail-closed", () => {
    assert.throws(
      () =>
        createDefaultToolRegistry({}, [
          { name: "customer-demo", tools: [customerDemoTool] },
        ]),
      /namespace/,
    );
    assert.throws(
      () =>
        createDefaultToolRegistry({}, [
          { name: "customer-demo", tools: [stubTool("filesystem.write")] },
        ]),
      /namespace/,
    );
    assert.throws(
      () =>
        createDefaultToolRegistry({}, [
          { name: "customer-demo", tools: [stubTool("process.execute")] },
        ]),
      /namespace/,
    );
  });

  it("extensión duplicada fail-closed", () => {
    assert.throws(
      () =>
        createDefaultToolRegistry({}, [
          customerDemoExtension,
          customerDemoExtension,
        ]),
      /duplicada/,
    );
  });

  it("extensión inválida impide READY", async () => {
    const invalid: AgentExtension = {
      name: "customer",
      tools: [stubTool("filesystem.write")],
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

describe("13A sin PluginManager ni capas nuevas", () => {
  it("customer-demo no usa import() dinámico ni capas extra", () => {
    const files = [
      fileURLToPath(new URL("../src/tools/customer-demo.ts", import.meta.url)),
      fileURLToPath(
        new URL("../src/extensions/customer-demo.ts", import.meta.url),
      ),
    ];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /PluginManager|Guardian|PermissionManager/);
      assert.doesNotMatch(text, /PolicyEngine/);
      assert.doesNotMatch(text, /import\(|require\(|eval\(|new Function/);
    }
    for (const file of walkTs(path.join(agentRoot, "src"))) {
      const text = readFileSync(file, "utf8");
      assert.doesNotMatch(text, /PluginManager/, file);
      assert.doesNotMatch(text, /class Guardian/, file);
      assert.doesNotMatch(text, /PermissionManager/, file);
      assert.doesNotMatch(text, /PolicyEngine/, file);
    }
  });
});
