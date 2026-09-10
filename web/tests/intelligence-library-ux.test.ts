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
    assert.match(center, /Cloud opcional/);
    assert.match(center, /if \(cloud\?\.connected\)/);
    assert.match(center, /Local siempre visible/);
    assert.match(center, /○ No instalado/);
  });

  it("tras conectar BYOK muestra éxito compacto y activa predeterminada", () => {
    assert.match(center, /byokJustConnected/);
    assert.match(center, /Modelo recomendado/);
    assert.match(center, /Modelo seleccionado/);
    assert.match(center, /Continuar/);
    assert.match(center, /selectIntelligenceConnection/);
    assert.match(center, /modelSelection: "recommended"/);
  });

  it("Cloud no expone el proveedor subyacente en el copy", () => {
    assert.match(center, /Modelos gestionados por Personal Agent/);
    assert.doesNotMatch(
      center,
      /Misma familia de modelos que\s*\n?\s*Anthropic/,
    );
  });
});