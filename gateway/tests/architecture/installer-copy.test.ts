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

  it("iss wires InfoBefore, stable AppId, versioned output, electron primary launch", () => {
    const src = fs.readFileSync(iss, "utf8");
    assert.match(src, /InfoBeforeFile=info-before\.txt/);
    assert.doesNotMatch(src, /ANTHROPIC|Tailscale|HUB_TOKEN|OpenAI/);
    assert.match(src, /tu agente está listo para configurarse/i);
    assert.match(
      src,
      /AppId=\{\{A8E5C2F1-9B47-4D3A-9E21-PERSONALAGENT51\}\}/,
    );
    assert.match(src, /OutputBaseFilename=\{#MyOutputBaseFilename\}/);
    assert.match(src, /MyAppExeName "runtime\\electron\\electron\.exe"/);
    assert.match(src, /Parameters: \{#MyAppParams\}/);
    assert.doesNotMatch(src, /MyAppExeName "AgentePersonal\.bat"/);
  });
});
