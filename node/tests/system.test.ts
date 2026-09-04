import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { systemExtension } from "../src/extensions/system.ts";
import { assertValidExtension } from "../src/extensions/validate.ts";
import { createDefaultToolRegistry } from "../src/tools/defaults.ts";
import { SYSTEM_INFO_NAME, systemInfoTool } from "../src/tools/system.ts";
import { ToolRegistry } from "../src/tools/registry.ts";

const ctx = { conversationId: "c_system" };

describe("system.info", () => {
  it("devuelve platform, arch, nodeVersion y pid", async () => {
    const result = await systemInfoTool.execute({}, ctx);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const content = result.content as {
      platform: string;
      arch: string;
      nodeVersion: string;
      pid: number;
    };
    assert.equal(content.platform, process.platform);
    assert.equal(content.arch, process.arch);
    assert.equal(content.nodeVersion, process.version);
    assert.equal(content.pid, process.pid);
    assert.deepEqual(Object.keys(content).sort(), [
      "arch",
      "nodeVersion",
      "pid",
      "platform",
    ]);
  });

  it("no usa spawn, filesystem ni process.env", () => {
    const toolSrc = readFileSync(
      fileURLToPath(new URL("../src/tools/system.ts", import.meta.url)),
      "utf8",
    );
    const extSrc = readFileSync(
      fileURLToPath(new URL("../src/extensions/system.ts", import.meta.url)),
      "utf8",
    );
    for (const src of [toolSrc, extSrc]) {
      assert.doesNotMatch(src, /child_process|node:fs|process\.env|\bspawn\(/);
      assert.doesNotMatch(src, /import\(|require\(|eval\(|new Function/);
    }
  });
});

describe("system extension", () => {
  it("es una AgentExtension válida con system.info", () => {
    const valid = assertValidExtension(systemExtension);
    assert.equal(valid.name, "system");
    assert.deepEqual(
      valid.tools.map((t) => t.name),
      [SYSTEM_INFO_NAME],
    );
  });

  it("registra system.info vía registerExtension", () => {
    const registry = new ToolRegistry();
    registry.registerExtension(systemExtension);
    assert.ok(registry.get(SYSTEM_INFO_NAME));
  });

  it("el core no registra system.info fuera de extensions", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../src/tools/defaults.ts", import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(src, /system\.info|systemInfoTool|systemExtension/);
    assert.match(src, /registerExtension/);
    assert.ok(createDefaultToolRegistry().get(SYSTEM_INFO_NAME));
  });
});
