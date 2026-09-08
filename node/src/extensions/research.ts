/**
 * Extensión `research`: search + fetch (PHASE 60.3 Web Intelligence).
 */
import { createResearchFetchTool } from "../tools/research-fetch.ts";
import { createResearchSearchTool } from "../tools/research-search.ts";
import type { ResearchBudgetStore } from "../research/budget.ts";
import type { AgentExtension } from "./types.ts";

export type ResearchExtensionOptions = {
  readonly budget?: ResearchBudgetStore;
};

export function createResearchExtension(
  options: ResearchExtensionOptions = {},
): AgentExtension {
  return {
    name: "research",
    version: "1.0.0",
    tools: [
      createResearchSearchTool({ budget: options.budget }),
      createResearchFetchTool({ budget: options.budget }),
    ],
  };
}
