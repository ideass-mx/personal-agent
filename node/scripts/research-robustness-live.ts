/**
 * Checks de robustez / fallback (live). No forma parte de la suite CI.
 * LOG_LEVEL=silent npx tsx scripts/research-robustness-live.ts
 */
import {
  createAgentSearchMcpProvider,
  SearchError,
  type AgentSearchDiagnostics,
} from "../src/research/index.ts";

if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = "silent";

async function tryQ(
  label: string,
  query: string,
  engines?: readonly string[],
): Promise<void> {
  let diag: AgentSearchDiagnostics | undefined;
  const p = createAgentSearchMcpProvider({
    timeoutMs: 20_000,
    engines,
    onDiagnostics: (d) => {
      diag = d;
    },
  });
  const t0 = Date.now();
  try {
    const r = await p.search({ query, limit: 5 });
    console.log(
      JSON.stringify({
        label,
        ok: true,
        ms: Date.now() - t0,
        results: r.results.length,
        domains: [...new Set(r.results.map((x) => x.domain).filter(Boolean))],
        failed: diag?.failedSources ?? [],
        partial: diag?.partialFailures.length ?? 0,
        sample: r.results.slice(0, 2).map((x) => ({
          title: x.title,
          url: x.url,
        })),
      }),
    );
  } catch (e) {
    console.log(
      JSON.stringify({
        label,
        ok: false,
        ms: Date.now() - t0,
        error: e instanceof SearchError ? e.code : "unknown",
      }),
    );
  }
}

async function main(): Promise<void> {
  const cold = Date.now();
  await tryQ("cold-start", "TypeScript MCP server", [
    "duckduckgo",
    "wikipedia",
  ]);
  console.log(JSON.stringify({ label: "cold-start-wall", ms: Date.now() - cold }));

  await tryQ("warm", "TypeScript MCP server", ["duckduckgo", "wikipedia"]);
  await tryQ("empty", "   ");
  await tryQ("unicode", "café doctorado IA México 日本語", [
    "duckduckgo",
    "wikipedia",
  ]);
  await tryQ("long", "x".repeat(600));
  await tryQ("special", "C++ / C# && (Ed25519) site:android.com", [
    "duckduckgo",
    "wikipedia",
  ]);
  await tryQ("fallback-wiby-only", "TypeScript MCP", ["wiby"]);
  await tryQ("fallback-wiby-wiki", "TypeScript MCP server", [
    "wiby",
    "wikipedia",
  ]);
  await tryQ("mexico", "SECIHTI doctorado inteligencia artificial 2026", [
    "duckduckgo",
    "bing",
    "wikipedia",
  ]);
  await tryQ("news", "OpenAI latest news September 2026", [
    "duckduckgo",
    "wikipedia",
  ]);
}

void main();
