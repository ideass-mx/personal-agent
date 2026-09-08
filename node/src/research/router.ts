/**
 * SearchRouter — selecciona SearchProvider sin exponer la implementación.
 * research.search() → SearchRouter → SearchProvider
 *
 * Sin fallback complejo ni scoring en esta fase.
 */
import {
  isLocalHttpSearchProvider,
  loadResearchSearchConfig,
  requireProviderBaseUrl,
  type ResearchSearchConfig,
} from "./config.ts";
import { createAgentSearchMcpProvider } from "./providers/agent-search-mcp.ts";
import { createLibreyProvider } from "./providers/librey.ts";
import { createWebsurfxProvider } from "./providers/websurfx.ts";
import { createElectronDuckDuckGoSearchProvider } from "./providers/electron-serp.ts";
import { createPersonalAgentSearchProvider } from "./search/adapter.ts";
import type {
  SearchProvider,
  SearchProviderId,
  SearchRequest,
  SearchResponse,
} from "./types.ts";
import { SearchError } from "./types.ts";

export type SearchRouterOptions = {
  readonly config?: ResearchSearchConfig;
  /** Providers inyectados (tests). Si se omite, se construyen desde config. */
  readonly providers?: Partial<Record<SearchProviderId, SearchProvider>>;
};

export type SearchRouter = {
  readonly providerId: SearchProviderId;
  getProvider(id?: SearchProviderId): SearchProvider;
  search(
    request: SearchRequest,
    providerId?: SearchProviderId,
  ): Promise<SearchResponse>;
};

function buildProvider(
  id: SearchProviderId,
  config: ResearchSearchConfig,
): SearchProvider {
  if (id === "agent-search-mcp") {
    return createAgentSearchMcpProvider({
      timeoutMs: config.timeoutMs,
      engines: config.agentSearchEngines,
    });
  }
  if (id === "personal-agent-search") {
    return createPersonalAgentSearchProvider();
  }
  if (id === "electron-duckduckgo" || id === "web") {
    // PHASE 60.12 / 60.15 — Electron es General Web; "web" es etiqueta semántica.
    return createElectronDuckDuckGoSearchProvider({
      searchTimeoutMs: config.timeoutMs,
      idleTimeoutMs: config.electronSerpIdleTimeoutMs,
    });
  }

  const baseUrl = requireProviderBaseUrl(id, config);
  const common = { baseUrl, timeoutMs: config.timeoutMs };
  switch (id) {
    case "websurfx":
      return createWebsurfxProvider(common);
    case "librey":
      return createLibreyProvider(common);
    default: {
      const _exhaustive: never = id;
      throw new SearchError(
        "invalid_input",
        `Provider no soportado: ${_exhaustive}`,
      );
    }
  }
}

export function createSearchRouter(
  options: SearchRouterOptions = {},
): SearchRouter {
  const config = options.config ?? loadResearchSearchConfig();
  const cache = new Map<SearchProviderId, SearchProvider>();

  function getProvider(id?: SearchProviderId): SearchProvider {
    const providerId = id ?? config.provider;
    const injected = options.providers?.[providerId];
    if (injected) return injected;
    const cached = cache.get(providerId);
    if (cached) return cached;
    try {
      if (
        isLocalHttpSearchProvider(providerId) &&
        !options.providers?.[providerId]
      ) {
        // Fail early with clear UNAVAILABLE when local engines lack BASE_URL.
        requireProviderBaseUrl(providerId, config);
      }
      const created = buildProvider(providerId, config);
      cache.set(providerId, created);
      return created;
    } catch (err) {
      throw new SearchError(
        "provider_unavailable",
        err instanceof Error ? err.message : "Provider no disponible",
        { provider: providerId, cause: err },
      );
    }
  }

  return {
    providerId: config.provider,
    getProvider,
    async search(request, providerId) {
      const provider = getProvider(providerId);
      return provider.search(request);
    },
  };
}

/**
 * Entrypoint del contrato: research.search(request[, providerId])
 */
export async function researchSearch(
  request: SearchRequest,
  options?: SearchRouterOptions & { providerId?: SearchProviderId },
): Promise<SearchResponse> {
  const router = createSearchRouter(options);
  return router.search(request, options?.providerId);
}
