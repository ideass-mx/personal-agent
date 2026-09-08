/**
 * SerpAdapter DuckDuckGo vía Electron (camino productivo PHASE 60.12).
 */
import type { SerpAdapter } from "../shared/contract.ts";
import {
  createElectronSerpAdapterFromSpec,
  type ElectronSerpAdapterExtras,
  type ElectronSerpAdapterOptions,
  type ElectronSerpSessionMode,
} from "../shared/adapter-base.ts";
import { detectElectronBlock, interpretSerpExtract } from "./interpret.ts";
import { DDG_SITE_PROFILE } from "./page.ts";

export type {
  ElectronSerpAdapterOptions as ElectronSerpProviderOptions,
  ElectronSerpSessionMode,
};

export type ElectronDuckDuckGoSerpAdapter = SerpAdapter &
  ElectronSerpAdapterExtras;

export function createElectronDuckDuckGoSerpAdapter(
  options: ElectronSerpAdapterOptions = {},
): ElectronDuckDuckGoSerpAdapter {
  const p = DDG_SITE_PROFILE;
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
      detectBlock: detectElectronBlock,
      interpret: interpretSerpExtract,
      runSearch: p.runSearch,
    },
    options,
  );
}

export const createElectronSerpProvider = createElectronDuckDuckGoSerpAdapter;
