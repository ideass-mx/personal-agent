/**
 * Clasificación companion (espejo UI) — alineada con la taxonomía final.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyMemoryText } from "../src/features/companion/policies/classifyMemory.ts";

describe("companion memory classify", () => {
  it("maps canonical utterances", () => {
    const prefer = classifyMemoryText("I prefer concise answers.");
    assert.equal(prefer.kind, "memory");
    if (prefer.kind === "memory") assert.equal(prefer.category, "PREFERENCES");

    const interest = classifyMemoryText("I'm interested in AI.");
    assert.equal(interest.kind, "memory");
    if (interest.kind === "memory") assert.equal(interest.category, "INTERESTS");

    const goal = classifyMemoryText("I want to publish a book.");
    assert.equal(goal.kind, "memory");
    if (goal.kind === "memory") assert.equal(goal.category, "GOALS");

    const work = classifyMemoryText("I'm building an AI agent.");
    assert.equal(work.kind, "memory");
    if (work.kind === "memory") {
      assert.equal(work.category, "WORK_AND_PROJECTS");
    }

    const people = classifyMemoryText("Pedro is my business partner.");
    assert.equal(people.kind, "memory");
    if (people.kind === "memory") {
      assert.equal(people.category, "PEOPLE_AND_RELATIONSHIPS");
    }

    const habit = classifyMemoryText("I usually work late.");
    assert.equal(habit.kind, "memory");
    if (habit.kind === "memory") assert.equal(habit.category, "HABITS");

    const important = classifyMemoryText("CFE is paid monthly.");
    assert.equal(important.kind, "memory");
    if (important.kind === "memory") {
      assert.equal(important.category, "IMPORTANT_INFORMATION");
    }
  });

  it("rejects non-memory", () => {
    assert.equal(classifyMemoryText("I'm tired today.").kind, "ephemeral");
    assert.equal(
      classifyMemoryText("This paper uses difference-in-differences.").kind,
      "project_knowledge",
    );
    assert.equal(
      classifyMemoryText("Ask me before making payments.").kind,
      "agent_rule",
    );
  });
});
