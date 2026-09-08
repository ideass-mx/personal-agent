/**
 * Harness research.search() — comparación multi-provider (SPIKE 60.1-A).
 *
 * Uso:
 *   npm run research:search -- --provider agent-search-mcp "consulta"
 *   npm run research:benchmark
 *   npm run research:benchmark -- --runs 3 --provider agent-search-mcp
 *
 * Live Internet solo cuando el provider está disponible (agent-search-mcp
 * o BASE_URL locales). Sin inventar resultados.
 */
import {
  ALL_PROVIDERS,
  BENCHMARK_QUERIES,
  createAgentSearchMcpProvider,
  createSearchRouter,
  isLocalHttpSearchProvider,
  loadResearchSearchConfig,
  SearchError,
  type AgentSearchDiagnostics,
  type ResearchSearchConfig,
  type SearchProviderId,
  type SearchResponse,
  type SearchResult,
} from "../src/research/index.ts";

export type BenchmarkRow = {
  provider: SearchProviderId;
  query: string;
  run: number;
  success: boolean;
  latencyMs: number;
  resultCount: number;
  uniqueDomains: number;
  duplicateUrlCount: number;
  emptySnippetCount: number;
  invalidUrlCount: number;
  errorType?: string;
  sourceCount?: number;
  partialFailures?: number;
  failedSources?: string;
  status: "ok" | "UNAVAILABLE" | "error";
};

function parseArgs(argv: string[]): {
  provider?: SearchProviderId;
  benchmark: boolean;
  query?: string;
  limit: number;
  runs: number;
  json: boolean;
} {
  let provider: SearchProviderId | undefined;
  let benchmark = false;
  let limit = 10;
  let runs = 1;
  let json = false;
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--benchmark" || a === "-b") {
      benchmark = true;
      continue;
    }
    if (a === "--json") {
      json = true;
      continue;
    }
    if (a === "--provider" || a === "-p") {
      const v = argv[++i];
      if (!v) throw new Error("--provider requiere valor");
      const id = v.trim().toLowerCase();
      if (
        id !== "websurfx" &&
        id !== "librey" &&
        id !== "agent-search-mcp" &&
        id !== "electron-duckduckgo" &&
        id !== "personal-agent-search" &&
        id !== "web"
      ) {
        throw new Error(`Provider desconocido: ${v}`);
      }
      provider = id;
      continue;
    }
    if (a === "--limit" || a === "-n") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v < 1) throw new Error("--limit inválido");
      limit = Math.trunc(v);
      continue;
    }
    if (a === "--runs" || a === "-r") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v < 1 || v > 10) {
        throw new Error("--runs debe ser 1..10");
      }
      runs = Math.trunc(v);
      continue;
    }
    if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    }
    rest.push(a);
  }

  return {
    provider,
    benchmark,
    query: rest.length > 0 ? rest.join(" ") : undefined,
    limit,
    runs,
    json,
  };
}

function printHelp(): void {
  console.log(`research.search harness

Uso:
  npm run research:search -- "consulta"
  npm run research:search -- --provider agent-search-mcp "consulta"
  npm run research:benchmark -- --runs 3
  npm run research:benchmark -- --provider agent-search-mcp --runs 3 --json

Env (dev-only):
  SEARCH_PROVIDER=electron-duckduckgo|websurfx|librey|agent-search-mcp|personal-agent-search
  WEBSURFX_BASE_URL / LIBREY_BASE_URL
  AGENT_SEARCH_ENGINES=duckduckgo,bing,wikipedia,startpage,mojeek
  SEARCH_TIMEOUT_MS=15000
  LOG_LEVEL=silent   # silencia pino de agent-search-mcp
`);
}

function analyzeResults(results: SearchResult[]): {
  uniqueDomains: number;
  duplicateUrlCount: number;
  emptySnippetCount: number;
  invalidUrlCount: number;
} {
  const urls = new Set<string>();
  const domains = new Set<string>();
  let duplicateUrlCount = 0;
  let emptySnippetCount = 0;
  let invalidUrlCount = 0;
  for (const r of results) {
    if (urls.has(r.url)) duplicateUrlCount += 1;
    urls.add(r.url);
    if (r.domain) domains.add(r.domain);
    if (!r.snippet || r.snippet.trim() === "") emptySnippetCount += 1;
    try {
      const u = new URL(r.url);
      if (u.protocol !== "http:" && u.protocol !== "https:") invalidUrlCount += 1;
    } catch {
      invalidUrlCount += 1;
    }
  }
  return {
    uniqueDomains: domains.size,
    duplicateUrlCount,
    emptySnippetCount,
    invalidUrlCount,
  };
}

function errorType(err: unknown): string {
  if (err instanceof SearchError) return err.code;
  if (err instanceof Error) return err.message.slice(0, 80);
  return "unknown";
}

function isUnavailable(err: unknown): boolean {
  return err instanceof SearchError && err.code === "provider_unavailable";
}

function formatResults(res: SearchResponse, latencyMs: number): string {
  const lines: string[] = [
    `Provider: ${res.provider}`,
    `Query: ${res.query}`,
    `Latency: ${latencyMs} ms`,
    `Results: ${res.results.length}`,
  ];
  res.results.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`   ${r.url}`);
    if (r.snippet) {
      const snip =
        r.snippet.length > 160 ? `${r.snippet.slice(0, 157)}...` : r.snippet;
      lines.push(`   ${snip}`);
    }
  });
  return lines.join("\n");
}

export async function runBenchmark(options?: {
  config?: ResearchSearchConfig;
  providers?: SearchProviderId[];
  queries?: readonly string[];
  limit?: number;
  runs?: number;
}): Promise<BenchmarkRow[]> {
  const config = options?.config ?? loadResearchSearchConfig();
  const providers = options?.providers ?? [...ALL_PROVIDERS];
  const queries = options?.queries ?? BENCHMARK_QUERIES;
  const limit = options?.limit ?? 10;
  const runs = options?.runs ?? 1;
  const rows: BenchmarkRow[] = [];

  for (const providerId of providers) {
    let providerUnavailable = false;
    for (const query of queries) {
      if (providerUnavailable) {
        for (let run = 1; run <= runs; run++) {
          rows.push({
            provider: providerId,
            query,
            run,
            success: false,
            latencyMs: 0,
            resultCount: 0,
            uniqueDomains: 0,
            duplicateUrlCount: 0,
            emptySnippetCount: 0,
            invalidUrlCount: 0,
            errorType: "provider_unavailable",
            status: "UNAVAILABLE",
          });
        }
        continue;
      }

      for (let run = 1; run <= runs; run++) {
        const started = Date.now();
        let lastDiag: AgentSearchDiagnostics | undefined;
        try {
          const providersMap =
            providerId === "agent-search-mcp"
              ? {
                  "agent-search-mcp": createAgentSearchMcpProvider({
                    timeoutMs: config.timeoutMs,
                    engines: config.agentSearchEngines,
                    onDiagnostics: (d) => {
                      lastDiag = d;
                    },
                  }),
                }
              : undefined;
          const router = createSearchRouter({
            config,
            providers: providersMap,
          });
          if (isLocalHttpSearchProvider(providerId)) {
            router.getProvider(providerId);
          }
          const res = await router.search({ query, limit }, providerId);
          const stats = analyzeResults(res.results);
          rows.push({
            provider: providerId,
            query,
            run,
            success: true,
            latencyMs: Date.now() - started,
            resultCount: res.results.length,
            ...stats,
            sourceCount: lastDiag?.sourceCount,
            partialFailures: lastDiag?.partialFailures.length,
            failedSources: lastDiag?.failedSources.join("|") || undefined,
            status: "ok",
          });
        } catch (err) {
          const unavailable = isUnavailable(err);
          if (unavailable && isLocalHttpSearchProvider(providerId)) {
            providerUnavailable = true;
          }
          rows.push({
            provider: providerId,
            query,
            run,
            success: false,
            latencyMs: Date.now() - started,
            resultCount: 0,
            uniqueDomains: 0,
            duplicateUrlCount: 0,
            emptySnippetCount: 0,
            invalidUrlCount: 0,
            errorType: errorType(err),
            status: unavailable ? "UNAVAILABLE" : "error",
          });
          if (providerUnavailable) {
            // Rellenar runs restantes de esta query; el bucle de queries
            // marcará el resto como UNAVAILABLE.
            for (let r = run + 1; r <= runs; r++) {
              rows.push({
                provider: providerId,
                query,
                run: r,
                success: false,
                latencyMs: 0,
                resultCount: 0,
                uniqueDomains: 0,
                duplicateUrlCount: 0,
                emptySnippetCount: 0,
                invalidUrlCount: 0,
                errorType: "provider_unavailable",
                status: "UNAVAILABLE",
              });
            }
            break;
          }
        }
      }
    }
  }
  return rows;
}

function summarize(rows: BenchmarkRow[]): void {
  const byProvider = new Map<string, BenchmarkRow[]>();
  for (const r of rows) {
    const list = byProvider.get(r.provider) ?? [];
    list.push(r);
    byProvider.set(r.provider, list);
  }
  console.log("\n# Stability summary");
  console.log("provider\tsuccessRate\tminMs\tavgMs\tmaxMs\tnote");
  for (const [provider, list] of byProvider) {
    const unavailable = list.every((r) => r.status === "UNAVAILABLE");
    if (unavailable) {
      console.log(`${provider}\tUNAVAILABLE\t-\t-\t-\tall missing BASE_URL`);
      continue;
    }
    const ok = list.filter((r) => r.success);
    const rate = `${ok.length}/${list.length}`;
    if (ok.length === 0) {
      console.log(`${provider}\t${rate}\t-\t-\t-\tno successes`);
      continue;
    }
    const lat = ok.map((r) => r.latencyMs);
    const min = Math.min(...lat);
    const max = Math.max(...lat);
    const avg = Math.round(lat.reduce((a, b) => a + b, 0) / lat.length);
    console.log(`${provider}\t${rate}\t${min}\t${avg}\t${max}\t`);
  }
}

function printBenchmarkTable(rows: BenchmarkRow[]): void {
  console.log(
    [
      "provider",
      "query",
      "run",
      "status",
      "success",
      "latencyMs",
      "results",
      "uniqueDomains",
      "dupUrls",
      "emptySnippets",
      "partialFailures",
      "failedSources",
      "error",
    ].join("\t"),
  );
  for (const r of rows) {
    const q = r.query.length > 36 ? `${r.query.slice(0, 33)}...` : r.query;
    console.log(
      [
        r.provider,
        JSON.stringify(q),
        r.run,
        r.status,
        r.success,
        r.latencyMs,
        r.resultCount,
        r.uniqueDomains,
        r.duplicateUrlCount,
        r.emptySnippetCount,
        r.partialFailures ?? "",
        r.failedSources ?? "",
        r.errorType ?? "",
      ].join("\t"),
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = loadResearchSearchConfig();
  if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = "silent";

  if (args.benchmark) {
    const rows = await runBenchmark({
      config,
      providers: args.provider ? [args.provider] : [...ALL_PROVIDERS],
      limit: args.limit,
      runs: args.runs,
    });
    if (args.json) {
      console.log(JSON.stringify({ rows }, null, 2));
    } else {
      printBenchmarkTable(rows);
      summarize(rows);
    }
    const hardFail = rows.some(
      (r) => r.status === "error" && r.provider === "agent-search-mcp",
    );
    process.exitCode = hardFail ? 1 : 0;
    return;
  }

  const query = args.query;
  if (!query) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  try {
    let lastDiag: AgentSearchDiagnostics | undefined;
    const providers =
      (args.provider ?? config.provider) === "agent-search-mcp"
        ? {
            "agent-search-mcp": createAgentSearchMcpProvider({
              timeoutMs: config.timeoutMs,
              engines: config.agentSearchEngines,
              onDiagnostics: (d) => {
                lastDiag = d;
              },
            }),
          }
        : undefined;
    const router = createSearchRouter({ config, providers });
    const started = Date.now();
    const response = await router.search(
      { query, limit: args.limit },
      args.provider,
    );
    console.log(formatResults(response, Date.now() - started));
    if (lastDiag) {
      console.log(
        `Diagnostics: engines=${lastDiag.engines.join(",")} partialFailures=${lastDiag.partialFailures.length} failed=[${lastDiag.failedSources.join("|")}]`,
      );
    }
  } catch (err) {
    const code = errorType(err);
    const provider = args.provider ?? config.provider;
    const label = isUnavailable(err) ? "UNAVAILABLE" : "FAIL";
    console.error(`${label} provider=${provider} error=${code}`);
    process.exitCode = 1;
  }
}

void main();
