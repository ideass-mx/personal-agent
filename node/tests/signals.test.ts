import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const agentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxCli = path.join(agentRoot, "node_modules/tsx/dist/cli.mjs");
const entry = path.join(agentRoot, "src/index.ts");

describe("Agent proceso (signals)", () => {
  it("SIGTERM cierra el proceso", async () => {
    const child = spawn(process.execPath, [tsxCli, entry], {
      cwd: agentRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });
    assert.ok(child.pid);
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("agent no arrancó")), 8_000);
      child.stderr?.on("data", (buf: Buffer) => {
        if (buf.toString().includes("MCP stdio listo")) {
          clearTimeout(t);
          resolve();
        }
      });
      child.on("error", reject);
    });
    const exited = new Promise<number>((resolve, reject) => {
      child.on("exit", (code) => resolve(code ?? -1));
      child.on("error", reject);
    });
    child.kill("SIGTERM");
    const code = await Promise.race([
      exited,
      new Promise<number>((_, reject) =>
        setTimeout(() => reject(new Error("SIGTERM timeout")), 5_000),
      ),
    ]);
    assert.equal(code, 0);
  });
});
