/**
 * PHASE 60.9.6 — tipos del runtime Electron SERP (experimental).
 */

export const QUERY_60_9_6 = "PostgreSQL 17";

export type ElectronSerpEnvSnapshot = {
  readonly webdriver: boolean | null;
  readonly userAgent: string | null;
  readonly platform: string | null;
  readonly language: string | null;
  readonly languages: readonly string[];
  readonly deviceMemory: number | null;
  readonly hardwareConcurrency: number | null;
  readonly innerWidth: number | null;
  readonly innerHeight: number | null;
  readonly devicePixelRatio: number | null;
  readonly screenWidth: number | null;
  readonly screenHeight: number | null;
  readonly webglVendor: string | null;
  readonly webglRenderer: string | null;
};

export type ElectronSerpOrganicHit = {
  readonly title: string;
  readonly url: string;
  readonly domain: string;
};

export type ElectronSerpRunResult = {
  readonly method: "electron-background";
  readonly run: number;
  readonly query: string;
  readonly queryEntered: boolean;
  readonly querySubmitted: boolean;
  readonly navigation: boolean;
  readonly challenge: boolean;
  readonly organicResults: number;
  readonly containsPostgresqlOrg: boolean;
  readonly organicDomains: readonly string[];
  readonly finalUrl: string | null;
  readonly pageTitle: string | null;
  readonly env: ElectronSerpEnvSnapshot;
  readonly browserMeta: {
    readonly channel: string;
    readonly electronVersion: string | null;
    readonly chromeVersion: string | null;
    readonly userDataDir: string;
    readonly showWindow: false;
    readonly os: string;
    readonly arch: string;
  };
  readonly elapsedMs: number;
  readonly error: string | null;
};

export type ElectronSerpRuntimeOptions = {
  /** Perfil aislado (nunca el del usuario). Si se omite, se crea un temp. */
  readonly userDataDir?: string;
  /** Ancho/alto de BrowserWindow oculta (no spoofing de navigator). */
  readonly width?: number;
  readonly height?: number;
  readonly navigateTimeoutMs?: number;
  readonly searchTimeoutMs?: number;
};
