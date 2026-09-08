/**
 * Perfil de sitio SERP — solo lo que difiere entre motores.
 * La extracción de links es siempre genérica (DOM / &lt;a href&gt;).
 */
import type { ElectronSerpRuntime } from "../runtime.ts";
import type { ElectronSerpRunResult } from "../types.ts";

export type OrganicHit = {
  readonly title: string;
  readonly url: string;
  readonly domain: string;
};

export type ChallengeInput = {
  readonly url?: string | null;
  readonly title?: string | null;
  readonly bodyText?: string | null;
};

export type SiteOrganicOptions = {
  /** Hosts del motor / shell a excluir (brave.com, duckduckgo.com, …). */
  readonly shellHosts: readonly string[];
  /** Títulos de UI típicos a descartar. */
  readonly titleDeny?: RegExp;
  /** Rechaza URLs internas de tracking del motor. */
  readonly rejectHref?: (url: URL) => boolean;
  /** Clave de dedupe; default host+pathname. */
  readonly dedupeKey?: (url: URL) => string;
};

export type SiteChallengeOptions = {
  /** Patrones extra además de los genéricos anti-bot. */
  readonly extraPatterns?: readonly RegExp[];
  /**
   * Si `captcha` aparece pero el texto también matchea esto,
   * no se trata como challenge (p. ej. SERP DDG con results).
   */
  readonly captchaAllowIf?: RegExp;
};

export type ElectronSerpSiteProfile = {
  readonly providerId: string;
  readonly name: string;
  readonly endpoint: string;
  readonly accessNotes: string;
  readonly serpUrlTest: RegExp;
  readonly challengeBodyHint: string;
  readonly organicBodyHint?: string;
  readonly organic: SiteOrganicOptions;
  readonly challenge: SiteChallengeOptions;
  readonly buildRequestUrl: (query: string) => string;
  readonly fallbackPageUrl: (query: string) => string;
  readonly runSearch: (
    runtime: ElectronSerpRuntime,
    query: string,
  ) => Promise<ElectronSerpRunResult>;
};
