/**
 * Smoke: menú «Nuevo proyecto» + convergencia Article Project.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { NEW_PROJECT_OPTIONS } from "../src/features/projects/mockProjects.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

describe("new project from Proyectos +", () => {
  it("offers four project types with article first", () => {
    assert.equal(NEW_PROJECT_OPTIONS.length, 4);
    assert.equal(NEW_PROJECT_OPTIONS[0]?.type, "scientific_article");
    assert.equal(NEW_PROJECT_OPTIONS[1]?.type, "research");
    assert.ok(
      NEW_PROJECT_OPTIONS.every((o) => o.title && o.description),
    );
  });

  it("Shell wires + menu without top-level Artículo científico nav", () => {
    const shell = fs.readFileSync(
      path.join(root, "src/components/Shell.tsx"),
      "utf8",
    );
    assert.match(shell, /NewProjectMenu/);
    assert.match(shell, /onNewProjectType/);
    assert.equal(
      /title=\{"Artículo científico"\}/.test(shell) ||
        /title="Artículo científico"/.test(shell),
      false,
    );
  });

  it("Experience Lab bridges Proyectos + into shared ConversationFirstDemo", () => {
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
    assert.match(lab, /onArticleProjectCreated/);
    assert.match(lab, /scientific_article/);
    assert.match(demo, /startDirectArticleFlow/);
    assert.match(demo, /externalStart/);
    assert.match(demo, /Vamos a crear tu artículo científico/);
    assert.match(demo, /onArticleProjectCreated/);
  });

  it("research create copy stays distinct from scientific article", () => {
    const screen = fs.readFileSync(
      path.join(root, "src/features/projects/ProjectsScreen.tsx"),
      "utf8",
    );
    assert.match(screen, /Nueva investigación/);
    assert.match(screen, /no es un artículo científico/);
    assert.match(screen, /Nuevo documento/);
    assert.match(screen, /¿Qué quieres trabajar\?/);
  });
});
