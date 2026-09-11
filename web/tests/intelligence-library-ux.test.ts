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
  it("solo lista Cloud/Local cuando estan conectados o instalados", () => {
    assert.match(center, /Cloud opcional/);
    assert.match(center, /if \(cloud\?\.connected\)/);
    assert.match(center, /Local solo en la biblioteca si ya está instalado/);
    assert.match(center, /if \(localInstalled\)/);
    assert.doesNotMatch(center, /Local siempre visible/);
  });

  it("tras conectar BYOK muestra exito compacto y activa predeterminada", () => {
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

  it("Agregar: Local/Cloud primero; proveedores solo bajo Cloud", () => {
    assert.match(center, /panel === "add"/);
    assert.match(center, /panel === "add_cloud"/);
    assert.match(center, /Elige Local o Cloud/);
    assert.match(center, /Personal Agent Cloud o tu propia cuenta/);
    const addBlock = center.slice(
      center.indexOf('{panel === "add" ? ('),
      center.indexOf('{panel === "add_cloud" ? ('),
    );
    assert.doesNotMatch(addBlock, /provider-card-grid/);
    assert.doesNotMatch(addBlock, /Tu cuenta/);
    assert.match(addBlock, /setPanel\("add_cloud"\)/);
  });
});
