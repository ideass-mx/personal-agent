/**
 * SerpAdapter Brave Search Web vía Electron (PHASE 60.13).
 */
import type { SerpAdapter } from "../shared/contract.ts";
import {
  createElectronSerpAdapterFromSpec,
  type ElectronSerpAdapterExtras,
  type ElectronSerpAdapterOptions,
} from "../shared/adapter-base.ts";
import type { ElectronSerpRuntime } from "../runtime.ts";
import { detectBraveBlock, interpretBraveSerpExtract } from "./interpret.ts";
import { BRAVE_SITE_PROFILE } from "./page.ts";

export type ElectronBraveSerpProviderOptions = ElectronSerpAdapterOptions;

export type ElectronBraveSerpAdapter = SerpAdapter &
  ElectronSerpAdapterExtras & {
    snapshotDiagnostics(): Promise<{
      webdriver: boolean | null;
      userAgent: string | null;
      webglVendor: string | null;
      webglRenderer: string | null;
      viewport: { width: number | null; height: number | null };
      devicePixelRatio: number | null;
      languages: readonly string[];
    }>;
  };

export function createElectronBraveSerpAdapter(
  options: ElectronBraveSerpProviderOptions = {},
): ElectronBraveSerpAdapter {
  const p = BRAVE_SITE_PROFILE;
  return createElectronSerpAdapterFromSpec(
    {
      providerId: p.providerId,
      name: p.name,
      endpoint: p.endpoint,
      accessNotes: p.accessNotes,
      buildRequestUrl: p.buildRequestUrl,
      fallbackPageUrl: p.fallbackPageUrl,
      challengeBodyHint: p.challengeBodyHint,
      organicBodyHint: p.organicBodyHint ?? "organic serp",
      detectBlock: detectBraveBlock,
      interpret: interpretBraveSerpExtract,
      runSearch: p.runSearch,
      extendAdapter: (base, ctx) => {
        const adapter = base as ElectronBraveSerpAdapter;
        adapter.snapshotDiagnostics = async () => {
          if (ctx.options.searchFn) {
            return {
              webdriver: null,
              userAgent: null,
              webglVendor: null,
              webglRenderer: null,
              viewport: { width: null, height: null },
              devicePixelRatio: null,
              languages: [],
            };
          }
          await ctx.ensureLaunch();
          const runtime = ctx.runtime as ElectronSerpRuntime;
          const snap = await runtime.evaluate<{
            webdriver?: boolean | null;
            userAgent?: string | null;
            webglVendor?: string | null;
            webglRenderer?: string | null;
            innerWidth?: number | null;
            innerHeight?: number | null;
            devicePixelRatio?: number | null;
            languages?: string[] | null;
          }>(`(() => {
        let webglVendor = null, webglRenderer = null;
        try {
          const c = document.createElement("canvas");
          const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
          if (gl) {
            const dbg = gl.getExtension("WEBGL_debug_renderer_info");
            if (dbg) {
              webglVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
              webglRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
            }
          }
        } catch (_) {}
        return {
          webdriver: navigator.webdriver === true,
          userAgent: navigator.userAgent || null,
          webglVendor,
          webglRenderer,
          innerWidth: window.innerWidth || null,
          innerHeight: window.innerHeight || null,
          devicePixelRatio: window.devicePixelRatio || null,
          languages: Array.from(navigator.languages || [])
        };
      })()`);
          return {
            webdriver: snap?.webdriver ?? null,
            userAgent: snap?.userAgent ?? null,
            webglVendor: snap?.webglVendor ?? null,
            webglRenderer: snap?.webglRenderer ?? null,
            viewport: {
              width: snap?.innerWidth ?? null,
              height: snap?.innerHeight ?? null,
            },
            devicePixelRatio: snap?.devicePixelRatio ?? null,
            languages: Array.isArray(snap?.languages) ? snap.languages : [],
          };
        };
        return adapter;
      },
    },
    options,
  ) as ElectronBraveSerpAdapter;
}
