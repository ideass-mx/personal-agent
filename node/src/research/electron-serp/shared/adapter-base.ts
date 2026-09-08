/**
 * Factory compartida de SerpAdapter Electron (cola / oneshot / reusable).
 */
import { ElectronSerpRuntime } from "../runtime.ts";
import type {
  ElectronSerpRunResult,
  ElectronSerpRuntimeOptions,
} from "../types.ts";
import type {
  BlockDetection,
  SerpAdapter,
  SerpFetchResponse,
  SerpSearchOutcome,
  SerpSearchQuery,
  SerpSource,
} from "./contract.ts";
import {
  EXTRACT_LINKS_EXPRESSION,
  pageExtractFromHtml,
  type PageExtract,
} from "./page-extract.ts";

export type ElectronSerpSessionMode = "oneshot" | "reusable";

export type ElectronSerpSearchFn = (
  query: string,
) => Promise<{
  extract: PageExtract;
  broken?: boolean;
  html?: string;
  latencyMs?: number;
}>;

export type ElectronSerpAdapterOptions = ElectronSerpRuntimeOptions & {
  readonly mode?: ElectronSerpSessionMode;
  readonly searchFn?: ElectronSerpSearchFn;
};

export type ElectronSerpAdapterExtras = {
  readonly mode: ElectronSerpSessionMode;
  warmUp(): Promise<void>;
  close(): Promise<void>;
  pendingCount(): number;
};

export type ElectronSerpEngineSpec = {
  readonly providerId: string;
  readonly name: string;
  readonly endpoint: string;
  readonly accessNotes: string;
  readonly buildRequestUrl: (query: string) => string;
  readonly fallbackPageUrl: (query: string) => string;
  readonly challengeBodyHint: string;
  readonly organicBodyHint: string;
  readonly detectBlock: (html: string, status: number) => BlockDetection;
  readonly interpret: (input: {
    extract: PageExtract;
    limit: number;
    html?: string;
    broken?: boolean;
  }) => SerpSearchOutcome;
  readonly runSearch: (
    runtime: ElectronSerpRuntime,
    query: string,
  ) => Promise<ElectronSerpRunResult>;
  readonly extendAdapter?: (
    base: SerpAdapter & ElectronSerpAdapterExtras,
    ctx: {
      ensureLaunch: () => Promise<void>;
      runtime: ElectronSerpRuntime | null;
      options: ElectronSerpAdapterOptions;
    },
  ) => SerpAdapter & ElectronSerpAdapterExtras;
};

function abortedOutcome(): SerpSearchOutcome {
  return {
    hits: [],
    health: "BROKEN",
    blocked: false,
    recovered: false,
    latencyMs: 0,
    fingerprint: "aborted",
    meanConfidence: 0,
    pageTitle: null,
    finalUrl: null,
  };
}

function brokenOutcome(started: number, fingerprint: string): SerpSearchOutcome {
  return {
    hits: [],
    health: "BROKEN",
    blocked: false,
    recovered: false,
    latencyMs: Date.now() - started,
    fingerprint,
    meanConfidence: 0,
    pageTitle: null,
    finalUrl: null,
  };
}

export function createElectronSerpAdapterFromSpec(
  spec: ElectronSerpEngineSpec,
  options: ElectronSerpAdapterOptions = {},
): SerpAdapter & ElectronSerpAdapterExtras {
  const mode: ElectronSerpSessionMode = options.mode ?? "oneshot";
  const runtime = options.searchFn ? null : new ElectronSerpRuntime(options);
  let launched = false;
  let queue: Promise<unknown> = Promise.resolve();
  let pending = 0;

  const source: SerpSource = {
    id: spec.providerId,
    name: spec.name,
    endpoint: spec.endpoint,
    enabled: true,
    accessNotes: spec.accessNotes,
  };

  async function ensureLaunch(): Promise<void> {
    if (options.searchFn) return;
    if (!runtime) throw new Error("runtime missing");
    if (!launched) {
      await runtime.launch();
      launched = true;
    }
  }

  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    pending += 1;
    const run = queue.then(fn, fn).finally(() => {
      pending -= 1;
    });
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function liveSearch(query: string, limit: number) {
    await ensureLaunch();
    const started = Date.now();
    try {
      const raw = await spec.runSearch(runtime!, query);
      const latencyMs = Date.now() - started;
      const broken =
        !!raw.error ||
        (!raw.navigation && !raw.querySubmitted) ||
        (!raw.queryEntered && !raw.querySubmitted);

      let extract: PageExtract = {
        title: raw.pageTitle ?? "",
        url: raw.finalUrl ?? spec.endpoint,
        bodyText: raw.challenge
          ? spec.challengeBodyHint
          : raw.containsPostgresqlOrg || raw.organicResults > 0
            ? spec.organicBodyHint
            : "",
        links: raw.organicDomains.map((d) => ({
          href: `https://${d}/`,
          text: d === "postgresql.org" ? "PostgreSQL" : d,
        })),
      };

      try {
        const rich = await runtime!.evaluate<PageExtract>(
          EXTRACT_LINKS_EXPRESSION,
        );
        if (rich && Array.isArray(rich.links)) extract = rich;
      } catch {
        /* keep fallback */
      }

      if (raw.challenge) {
        extract = {
          ...extract,
          bodyText: extract.bodyText || spec.challengeBodyHint,
        };
      }

      const outcome = spec.interpret({
        extract,
        limit,
        broken: broken && !raw.challenge,
      });

      if (raw.challenge && outcome.health !== "BLOCKED") {
        return {
          ...outcome,
          hits: [],
          health: "BLOCKED" as const,
          blocked: true,
          latencyMs,
        };
      }

      return { ...outcome, latencyMs };
    } finally {
      if (mode === "oneshot" && runtime && launched) {
        await runtime.close();
        launched = false;
      }
    }
  }

  const base: SerpAdapter & ElectronSerpAdapterExtras = {
    id: spec.providerId,
    name: source.name,
    mode,
    getSource: () => source,
    buildRequest(query) {
      return {
        method: "GET",
        url: spec.buildRequestUrl(query.query),
        headers: {},
      };
    },
    detectBlock(response: SerpFetchResponse): BlockDetection {
      return spec.detectBlock(response.html, response.status);
    },
    pendingCount: () => pending,
    async warmUp() {
      if (mode !== "reusable") return;
      await enqueue(async () => {
        await ensureLaunch();
      });
    },
    async close() {
      await enqueue(async () => {
        if (runtime && launched) {
          await runtime.close();
          launched = false;
        }
      });
    },
    async search(query: SerpSearchQuery) {
      if (query.signal?.aborted) return abortedOutcome();

      return enqueue(async () => {
        const limit = query.limit ?? 10;
        const started = Date.now();

        if (query.htmlOverride !== undefined) {
          const extract = pageExtractFromHtml(
            query.htmlOverride,
            spec.fallbackPageUrl(query.query),
          );
          const status = query.httpStatusOverride ?? 200;
          const block = spec.detectBlock(query.htmlOverride, status);
          if (block.blocked || status === 403 || status === 429) {
            const outcome = spec.interpret({
              extract: {
                ...extract,
                bodyText: `${extract.bodyText}\n${spec.challengeBodyHint}`,
              },
              limit,
              html: query.htmlOverride,
            });
            return {
              ...outcome,
              health: "BLOCKED",
              blocked: true,
              hits: [],
              latencyMs: Date.now() - started,
              html: query.htmlOverride,
            };
          }
          const outcome = spec.interpret({
            extract,
            limit,
            html: query.htmlOverride,
          });
          return {
            ...outcome,
            latencyMs: Date.now() - started,
            html: query.htmlOverride,
          };
        }

        if (options.searchFn) {
          const fake = await options.searchFn(query.query);
          const outcome = spec.interpret({
            extract: fake.extract,
            limit,
            html: fake.html,
            broken: fake.broken,
          });
          return {
            ...outcome,
            latencyMs: fake.latencyMs ?? Date.now() - started,
            html: fake.html,
          };
        }

        try {
          const withTimeout = async <T,>(
            p: Promise<T>,
            ms: number,
          ): Promise<T> => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
              return await Promise.race([
                p,
                new Promise<T>((_, rej) => {
                  timer = setTimeout(
                    () => rej(new Error("overall request timeout")),
                    ms,
                  );
                }),
              ]);
            } finally {
              if (timer) clearTimeout(timer);
            }
          };

          const overallMs =
            (options.searchTimeoutMs ?? 45_000) +
            (options.navigateTimeoutMs ?? 45_000) +
            10_000;
          return await withTimeout(liveSearch(query.query, limit), overallMs);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return brokenOutcome(
            started,
            msg.includes("timeout") ? "timeout" : "error",
          );
        }
      });
    },
  };

  if (spec.extendAdapter) {
    return spec.extendAdapter(base, { ensureLaunch, runtime, options });
  }
  return base;
}
