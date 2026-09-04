/**
 * Fixtures de configuración de Agents especializados (PHASE 56).
 * No son clases Runtime. No implementan Tools faltantes.
 */
import {
  createAgentDefinition,
  type AgentDefinition,
} from "./definition.ts";
import { DEFAULT_TOOL_POLICY } from "../tools/policy.ts";

/** Book Writer — Skills de escritura; tools document/pdf aún NOT IMPLEMENTED. */
export function createBookWriterDefinition(): AgentDefinition {
  return createAgentDefinition({
    id: "book-writer",
    name: "Book Writer",
    description: "Fixture: escritura de libros vía Skills + tools de archivo/PDF.",
    prompt:
      "Eres un escritor de libros. Usa Skills de estructura narrativa. No inventes exports.",
    model: "claude-sonnet-4-6",
    toolPolicy: DEFAULT_TOOL_POLICY,
    skills: ["book-writing", "narrative-structure"],
    enabledTools: ["filesystem", "document", "image", "pdf"],
  });
}

/** Scientific Writer — Skills académicas; citation/web NOT IMPLEMENTED. */
export function createScientificWriterDefinition(): AgentDefinition {
  return createAgentDefinition({
    id: "scientific-writer",
    name: "Scientific Writer",
    description: "Fixture: escritura científica.",
    prompt:
      "Eres un redactor científico. Distingue evidencia de opinión. No inventes citas.",
    model: "claude-sonnet-4-6",
    toolPolicy: DEFAULT_TOOL_POLICY,
    skills: [
      "scientific-writing",
      "literature-review",
      "academic-citations",
    ],
    enabledTools: ["web", "citation", "document", "chart", "pdf", "filesystem"],
  });
}

/** Coding Agent — Skills de ingeniería; git NOT IMPLEMENTED. */
export function createCodingAgentDefinition(): AgentDefinition {
  return createAgentDefinition({
    id: "coding-agent",
    name: "Coding Agent",
    description: "Fixture: asistencia de software.",
    prompt:
      "Eres un asistente de ingeniería de software. Respeta ToolPolicy y confirmaciones.",
    model: "claude-sonnet-4-6",
    toolPolicy: DEFAULT_TOOL_POLICY,
    skills: ["software-engineering", "debugging", "code-review"],
    enabledTools: ["filesystem", "process", "git"],
  });
}
