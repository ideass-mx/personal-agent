import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  developmentAgentEntry,
  packagedAgentEntry,
  resolveAgentLaunch,
} from "../../src/runtime/resolve-agent.ts";
import { defaultAgentStdioCommand } from "../../src/tools/mcp-stdio.ts";
import { DEFAULT_TOOL_POLICY } from "../../src/tools/tool-policy.ts";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

describe("9B resolve Agent launch", () => {
  it("A: development encuentra Agent fuente (tsx)", () => {
    const launch = resolveAgentLaunch({
      hubModuleDir: path.join(repoRoot, "hub/src/runtime"),
      repoRoot,
    });
    assert.equal(launch.mode, "development");
    assert.equal(launch.command, process.execPath);
    assert.ok(launch.args[0].includes(path.join("tsx", "dist", "cli.mjs")));
    assert.equal(launch.args[1], path.join(repoRoot, "agent/src/index.ts"));
    assert.doesNotMatch(launch.args.join("\0"), /agent\.cjs/);
  });

  it("B: production encuentra Agent empaquetado", () => {
    const hubDir = path.posix.join("/opt", "pa", "hub");
    const agentMjs = path.posix.join("/opt", "pa", "agent", "agent.cjs");
    const launch = resolveAgentLaunch({
      hubModuleDir: hubDir,
      platform: "linux",
      exists: (p) => p === agentMjs,
      execPath: "/usr/bin/node",
    });
    assert.equal(launch.mode, "production");
    assert.equal(launch.command, "/usr/bin/node");
    assert.deepEqual(launch.args, [agentMjs]);
    assert.equal(launch.cwd, path.posix.dirname(agentMjs));
    assert.equal(launch.args.some((a) => a.includes("tsx")), false);
  });

  it("C: cwd no forma parte de la resolución", () => {
    const launch = resolveAgentLaunch({
      hubModuleDir: path.join(repoRoot, "hub/src/runtime"),
      repoRoot,
    });
    assert.equal(launch.cwd, path.join(repoRoot, "agent"));
    assert.equal(path.isAbsolute(launch.cwd), true);
    assert.equal(path.isAbsolute(launch.args[1]), true);
  });

  it("D: paths con espacios", () => {
    const hubDir = path.win32.join(
      "C:",
      "Program Files",
      "Personal Agent",
      "hub",
    );
    const launch = resolveAgentLaunch({
      hubModuleDir: hubDir,
      platform: "win32",
      exists: () => true,
      execPath: "C:\\Program Files\\nodejs\\node.exe",
    });
    assert.equal(launch.mode, "production");
    assert.ok(launch.agentEntry.includes("Program Files"));
    assert.ok(launch.agentEntry.includes("Personal Agent"));
    assert.match(launch.agentEntry, /agent\.cjs$/);
  });

  it("E: Windows usa path.win32, no barras / manuales", () => {
    const hubDir = "C:\\App\\hub";
    const entry = packagedAgentEntry(hubDir, "win32");
    assert.equal(entry, "C:\\App\\agent\\agent.cjs");
    assert.equal(entry.includes("/"), false);
    const dev = developmentAgentEntry("C:\\src\\repo", "win32");
    assert.equal(dev, "C:\\src\\repo\\agent\\src\\index.ts");
  });

  it("defaultAgentStdioCommand en este checkout es development", () => {
    const cmd = defaultAgentStdioCommand();
    assert.equal(cmd.command, process.execPath);
    assert.ok(cmd.args[1].endsWith(path.join("agent", "src", "index.ts")));
  });

  it("K/L: write y process.execute siguen en confirm", () => {
    assert.equal(DEFAULT_TOOL_POLICY["filesystem.write"], "confirm");
    assert.equal(DEFAULT_TOOL_POLICY["process.execute"], "confirm");
    assert.equal(DEFAULT_TOOL_POLICY["filesystem.read"], "automatic");
    assert.equal(DEFAULT_TOOL_POLICY["system.info"], "automatic");
    assert.equal(DEFAULT_TOOL_POLICY["diagnostics.ping"], "automatic");
    assert.equal(DEFAULT_TOOL_POLICY["customer.demo"], "automatic");
  });
});
