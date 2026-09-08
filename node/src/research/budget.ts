/**
 * Presupuesto interno de operaciones web por conversación (PHASE 60.3).
 * No se expone al usuario. Sin secretos.
 */
export type ResearchBudgetLimits = {
  readonly maxSearches: number;
  readonly maxFetches: number;
  readonly maxTotalWebOperations: number;
};

export type ResearchBudgetSnapshot = {
  readonly conversationId: string;
  readonly searches: number;
  readonly fetches: number;
  readonly total: number;
  readonly successfulSearches: number;
  readonly failedSearches: number;
  readonly successfulFetches: number;
  readonly failedFetches: number;
  readonly sourcesUsed: string[];
  readonly limits: ResearchBudgetLimits;
};

export const DEFAULT_RESEARCH_BUDGET_LIMITS: ResearchBudgetLimits = Object.freeze({
  maxSearches: 6,
  maxFetches: 8,
  maxTotalWebOperations: 12,
});

export type ResearchBudgetStore = {
  tryConsume(
    conversationId: string,
    kind: "search" | "fetch",
  ): { ok: true } | { ok: false; code: "web_research_limit_reached" };
  recordOutcome(
    conversationId: string,
    kind: "search" | "fetch",
    success: boolean,
    sources?: readonly string[],
  ): void;
  snapshot(conversationId: string): ResearchBudgetSnapshot;
  reset(conversationId?: string): void;
};

type Entry = {
  searches: number;
  fetches: number;
  successfulSearches: number;
  failedSearches: number;
  successfulFetches: number;
  failedFetches: number;
  sourcesUsed: Set<string>;
};

function emptyEntry(): Entry {
  return {
    searches: 0,
    fetches: 0,
    successfulSearches: 0,
    failedSearches: 0,
    successfulFetches: 0,
    failedFetches: 0,
    sourcesUsed: new Set(),
  };
}

export function createResearchBudgetStore(
  limits: ResearchBudgetLimits = DEFAULT_RESEARCH_BUDGET_LIMITS,
): ResearchBudgetStore {
  const byConversation = new Map<string, Entry>();

  function entry(id: string): Entry {
    let e = byConversation.get(id);
    if (!e) {
      e = emptyEntry();
      byConversation.set(id, e);
    }
    return e;
  }

  return {
    tryConsume(conversationId, kind) {
      const id = conversationId.trim() || "default";
      const e = entry(id);
      const total = e.searches + e.fetches;
      if (total >= limits.maxTotalWebOperations) {
        return { ok: false, code: "web_research_limit_reached" };
      }
      if (kind === "search" && e.searches >= limits.maxSearches) {
        return { ok: false, code: "web_research_limit_reached" };
      }
      if (kind === "fetch" && e.fetches >= limits.maxFetches) {
        return { ok: false, code: "web_research_limit_reached" };
      }
      if (kind === "search") e.searches += 1;
      else e.fetches += 1;
      return { ok: true };
    },
    recordOutcome(conversationId, kind, success, sources) {
      const id = conversationId.trim() || "default";
      const e = entry(id);
      if (kind === "search") {
        if (success) e.successfulSearches += 1;
        else e.failedSearches += 1;
      } else {
        if (success) e.successfulFetches += 1;
        else e.failedFetches += 1;
      }
      if (sources) {
        for (const s of sources) {
          const t = s.trim();
          if (t) e.sourcesUsed.add(t);
        }
      }
    },
    snapshot(conversationId) {
      const id = conversationId.trim() || "default";
      const e = entry(id);
      return {
        conversationId: id,
        searches: e.searches,
        fetches: e.fetches,
        total: e.searches + e.fetches,
        successfulSearches: e.successfulSearches,
        failedSearches: e.failedSearches,
        successfulFetches: e.successfulFetches,
        failedFetches: e.failedFetches,
        sourcesUsed: [...e.sourcesUsed],
        limits,
      };
    },
    reset(conversationId) {
      if (conversationId === undefined) {
        byConversation.clear();
        return;
      }
      byConversation.delete(conversationId.trim() || "default");
    },
  };
}

/** Store de proceso Node (compartido por tools research.*). */
export const defaultResearchBudgetStore = createResearchBudgetStore();
