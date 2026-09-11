/**
 * Crear proyecto: lenguaje natural, sin menú de tipos.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { interpretProjectGoal } from "../src/features/companion/policies/interpretProjectGoal.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

describe("crear proyecto — interpret()", () => {
  it("infiere artículo científico y secciones", () => {
    const r = interpretProjectGoal(
      "escribir un artículo científico sobre IA y productividad",
    );
    assert.equal(r.kind, "Paper");
    assert.equal(r.label, "Artículo científico");
    assert.ok(r.sections.includes("Metodología"));
    assert.ok(r.objective.startsWith("Escribir"));
  });

  it("infiere legal, finanzas, software y viaje", () => {
    assert.equal(
      interpretProjectGoal("Investigar la regulación de privacidad").kind,
      "Legal",
    );
    assert.equal(
      interpretProjectGoal("Construir un modelo financiero").kind,
      "Finance",
    );
    assert.equal(
      interpretProjectGoal("Construir una app con buena arquitectura").kind,
      "Software",
    );
    assert.equal(interpretProjectGoal("Planear un viaje a Japón").kind, "Travel");
  });

  it("fallback genérico sin menús de tipo", () => {
    const r = interpretProjectGoal("organizar mis notas del trimestre");
    assert.equal(r.kind, "Generic");
    assert.deepEqual(r.sections, [
      "Investigación",
      "Notas",
      "Trabajo",
      "Revisión",
    ]);
  });
});

describe("crear proyecto — UI sin menú contextual", () => {
  it("Shell abre create con + directo, sin NewProjectMenu", () => {
    const shell = fs.readFileSync(
      path.join(root, "src/components/Shell.tsx"),
      "utf8",
    );
    assert.equal(/NewProjectMenu/.test(shell), false);
    assert.equal(/onNewProjectType/.test(shell), false);
    assert.equal(/onContextMenu/.test(shell), false);
    assert.match(shell, /startCreateProject/);
    assert.match(shell, /Nuevo proyecto/);
    assert.equal(fs.existsSync(path.join(root, "src/features/projects/NewProjectMenu.tsx")), false);
  });

  it("ProjectCreateScreen es flujo de 2 fases NL", () => {
    const screen = fs.readFileSync(
      path.join(root, "src/features/companion/ProjectCreateScreen.tsx"),
      "utf8",
    );
    assert.match(screen, /¿Qué quieres lograr\?/);
    assert.match(screen, /interpretProjectGoal/);
    assert.match(screen, /Así lo configuraría/);
    assert.match(screen, /Crear proyecto/);
    assert.match(screen, /Ajustar/);
    assert.equal(/select|TemplatePicker|ProjectTypeSelect|onContextMenu/i.test(screen), false);
  });

  it("Experience Lab article path sigue independiente", () => {
    const lab = fs.readFileSync(
      path.join(root, "src/experience/ExperienceLabScreen.tsx"),
      "utf8",
    );
    const demo = fs.readFileSync(
      path.join(
        root,
        "src/experience/conversationFirst/ConversationFirstDemo.tsx",
      ),
      "utf8",
    );
    assert.match(lab, /externalStart/);
    assert.match(demo, /startDirectArticleFlow/);
  });
});
