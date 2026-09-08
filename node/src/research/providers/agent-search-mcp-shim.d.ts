/**
 * Declaraciones mínimas para el deep-import experimental (SPIKE 60.1-A).
 * El paquete no publica types públicos para dist/tools/*.
 */
declare module "agent-search-mcp/dist/tools/free-search.js" {
  export function searchWithFallback(options: {
    query: string;
    count?: number;
    engines?: string[];
    language?: string;
    signal?: AbortSignal;
    waterfall?: boolean;
    providerMaxRetries?: number;
  }): Promise<{
    query?: string;
    engines?: string[];
    results?: Array<{
      title?: string;
      url?: string;
      snippet?: string;
      evidence?: { published_at?: string | null };
      sources?: string[];
    }>;
    partialFailures?: Array<{
      engine?: string;
      type?: string;
      message?: string;
    }>;
    cache_hit?: boolean;
    detected_language?: string;
    meta?: { total?: number };
  }>;
}
