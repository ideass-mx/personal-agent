/**
 * Installer: solo instala; copy humano; sin LLM/Tailscale/Android en el camino.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const iss = path.join(repoRoot, "installer/windows/personal-agent.iss");
const infoBefore = path.join(
  repoRoot,
  "installer/windows/info-before.txt",
);

describe("installer simplified happy path", () => {
  it("InfoBefore is human and omits infra jargon", () => {
    assert.equal(fs.existsSync(infoBefore), true);
    const text = fs.readFileSync(infoBefore, "utf8");
    assert.match(text, /Instalando Personal Agent/i);
    assert.match(text, /configuraci/i);
    for (const banned of [
      "Gateway",
      "Tailscale",
      "HUB_TOKEN",
      "MCP",
      "ANTHROPIC",
      "WebSocket",
      "pairing",
    ]) {
      assert.equal(
        text.includes(banned),
        false,
        `InfoBefore no debe mencionar ${banned}`,
      );
    }
  });

  it("iss wires InfoBefore and does not prompt LLM/Tailscale", () => {
    const src = fs.readFileSync(iss, "utf8");
    assert.match(src, /InfoBeforeFile=info-before\.txt/);
    assert.doesNotMatch(src, /ANTHROPIC|Tailscale|HUB_TOKEN|OpenAI/);
    assert.match(src, /tu agente está listo para configurarse/i);
  });
});
