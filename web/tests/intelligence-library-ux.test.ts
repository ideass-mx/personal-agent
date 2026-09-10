import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const center = readFileSync(
  join(root, "src/features/configuration/IntelligenceCenter.tsx"),
  "utf8",
);

describe("Intelligence Center library UX", () => {
  it("solo lista Cloud/Local cuando están conectados o instalados", () => {
    assert.match(center, /Cloud es opcional/);
    assert.match(center, /if \(cloud\?\.connected\)/);
    assert.match(center, /if \(snap\?\.local\.installed \|\| localReady\)/);
    assert.doesNotMatch(
      center,
      /statusLine: cloud\?\.connected[\s\S]*: "No conectado"/,
    );
  });

  it("tras conectar BYOK muestra éxito compacto y activa predeterminada", () => {
    assert.match(center, /byokJustConnected/);
    assert.match(center, /Modelo recomendado/);
    assert.match(center, /Continuar/);
    assert.match(center, /selectIntelligenceConnection/);
    assert.match(center, /modelSelection: "recommended"/);
  });
});
