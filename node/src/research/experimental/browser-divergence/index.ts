/**
 * PHASE 60.9.5 — divergencia observable Manual vs Playwright (solo lectura).
 * Sin evasión / sin modificación de fingerprints.
 */
import { sanitizeUrl as sanitizeUrlBase } from "../browser-comparison/index.ts";

export const QUERY_60_9_5 = "PostgreSQL 17";

export type DiffKind = "SAME" | "DIFFERENT" | "UNKNOWN";
export type DivergenceCase = "A" | "B" | "C" | "D";

export type EnvSnapshot = {
  readonly userAgent: string | null;
  readonly appName: string | null;
  readonly appVersion: string | null;
  readonly platform: string | null;
  readonly language: string | null;
  readonly languages: readonly string[];
  readonly hardwareConcurrency: number | null;
  readonly deviceMemory: number | null;
  readonly maxTouchPoints: number | null;
  readonly cookieEnabled: boolean | null;
  readonly onLine: boolean | null;
  readonly webdriver: boolean | null;
  readonly innerWidth: number | null;
  readonly innerHeight: number | null;
  readonly outerWidth: number | null;
  readonly outerHeight: number | null;
  readonly devicePixelRatio: number | null;
  readonly screenWidth: number | null;
  readonly screenHeight: number | null;
  readonly screenAvailWidth: number | null;
  readonly screenAvailHeight: number | null;
  readonly colorDepth: number | null;
  readonly pixelDepth: number | null;
  readonly pluginsLength: number | null;
  readonly mimeTypesLength: number | null;
  readonly timezone: string | null;
  readonly permissions: Readonly<Record<string, string>>;
  readonly webglVendor: string | null;
  readonly webglRenderer: string | null;
  readonly localStorageKeys: readonly string[];
  readonly sessionStorageKeys: readonly string[];
  readonly cookieNames: readonly string[];
  readonly serviceWorkerScopes: readonly string[];
  readonly cacheStorageKeys: readonly string[];
  readonly url: string | null;
  readonly title: string | null;
};

export type NetworkEvent = {
  readonly kind: "request" | "response" | "redirect";
  readonly resourceType: string | null;
  readonly hostname: string | null;
  readonly pathname: string | null;
  readonly status: number | null;
  readonly timingMs: number | null;
};

export type ResourceTypeCounts = Readonly<Record<string, number>>;

export type PhaseOutcome = {
  readonly queryEntered: boolean | null;
  readonly querySubmitted: boolean | null;
  readonly navigationOccurred: boolean | null;
  readonly challengeDetected: boolean | null;
  readonly organicResultsDetected: boolean | null;
  readonly organicDomains: readonly string[];
  readonly resultCount: number | null;
  readonly finalUrl: string | null;
  readonly pageTitle: string | null;
  readonly httpStatus: number | null;
  readonly resourceCount: number | null;
  readonly resourceTypeCounts: ResourceTypeCounts;
  readonly redirectChain: readonly string[];
};

export type DivergenceRun = {
  readonly method: "manual" | "playwright";
  readonly run: number;
  readonly query: string;
  readonly browserMeta: {
    readonly channel: string;
    readonly browserVersion: string | null;
    readonly playwrightVersion: string | null;
    readonly os: string | null;
    readonly arch: string | null;
  };
  readonly t0: EnvSnapshot;
  readonly t1: EnvSnapshot;
  readonly t2: EnvSnapshot;
  readonly outcome: PhaseOutcome;
  readonly network: readonly NetworkEvent[];
  readonly elapsedMs: number | null;
  readonly notes?: string;
};

const SENSITIVE = /token|secret|api[_-]?key|session|credential|authorization|passwd|password/i;

export function sanitizeUrl(raw: string | null | undefined): string | null {
  return sanitizeUrlBase(raw);
}

export function redactSensitiveString(s: string): string {
  if (SENSITIVE.test(s)) return "[redacted]";
  return s;
}

export function normalizeNetworkEvent(raw: unknown): NetworkEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  let hostname: string | null = null;
  let pathname: string | null = null;
  if (typeof o.url === "string") {
    try {
      const u = new URL(o.url);
      hostname = u.hostname;
      pathname = SENSITIVE.test(u.pathname) ? "/[redacted]" : u.pathname;
    } catch {
      /* ignore */
    }
  }
  if (typeof o.hostname === "string") hostname = o.hostname;
  if (typeof o.pathname === "string") {
    pathname = SENSITIVE.test(o.pathname) ? "/[redacted]" : o.pathname;
  }
  const kind =
    o.kind === "request" || o.kind === "response" || o.kind === "redirect" ? o.kind : null;
  if (!kind) return null;
  return {
    kind,
    resourceType: typeof o.resourceType === "string" ? o.resourceType : null,
    hostname,
    pathname,
    status: typeof o.status === "number" ? o.status : null,
    timingMs: typeof o.timingMs === "number" ? o.timingMs : null,
  };
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((s) => s.slice(0, 120));
}

export function normalizeEnvSnapshot(raw: unknown): EnvSnapshot {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const permsRaw =
    o.permissions && typeof o.permissions === "object"
      ? (o.permissions as Record<string, unknown>)
      : {};
  const permissions: Record<string, string> = {};
  for (const [k, v] of Object.entries(permsRaw)) {
    if (typeof v === "string") permissions[k] = v.slice(0, 32);
  }
  const num = (k: string): number | null =>
    typeof o[k] === "number" && Number.isFinite(o[k] as number) ? (o[k] as number) : null;
  const str = (k: string): string | null =>
    typeof o[k] === "string" ? (o[k] as string).slice(0, 500) : null;
  const bool = (k: string): boolean | null =>
    typeof o[k] === "boolean" ? (o[k] as boolean) : null;

  return {
    userAgent: str("userAgent"),
    appName: str("appName"),
    appVersion: str("appVersion"),
    platform: str("platform"),
    language: str("language"),
    languages: asStringArray(o.languages),
    hardwareConcurrency: num("hardwareConcurrency"),
    deviceMemory: num("deviceMemory"),
    maxTouchPoints: num("maxTouchPoints"),
    cookieEnabled: bool("cookieEnabled"),
    onLine: bool("onLine"),
    webdriver: bool("webdriver"),
    innerWidth: num("innerWidth"),
    innerHeight: num("innerHeight"),
    outerWidth: num("outerWidth"),
    outerHeight: num("outerHeight"),
    devicePixelRatio: num("devicePixelRatio"),
    screenWidth: num("screenWidth"),
    screenHeight: num("screenHeight"),
    screenAvailWidth: num("screenAvailWidth"),
    screenAvailHeight: num("screenAvailHeight"),
    colorDepth: num("colorDepth"),
    pixelDepth: num("pixelDepth"),
    pluginsLength: num("pluginsLength"),
    mimeTypesLength: num("mimeTypesLength"),
    timezone: str("timezone"),
    permissions,
    webglVendor: str("webglVendor"),
    webglRenderer: str("webglRenderer"),
    localStorageKeys: asStringArray(o.localStorageKeys),
    sessionStorageKeys: asStringArray(o.sessionStorageKeys),
    cookieNames: asStringArray(o.cookieNames),
    serviceWorkerScopes: asStringArray(o.serviceWorkerScopes),
    cacheStorageKeys: asStringArray(o.cacheStorageKeys),
    url: sanitizeUrl(str("url")),
    title: str("title"),
  };
}

export function compareValue(a: unknown, b: unknown): DiffKind {
  if (a === null || a === undefined || b === null || b === undefined) {
    if (a === b) return "SAME";
    if (a === null || a === undefined || b === null || b === undefined) return "UNKNOWN";
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const sa = [...a].map(String).sort().join("\0");
    const sb = [...b].map(String).sort().join("\0");
    return sa === sb ? "SAME" : "DIFFERENT";
  }
  if (typeof a === "object" && typeof b === "object" && a && b) {
    return JSON.stringify(a) === JSON.stringify(b) ? "SAME" : "DIFFERENT";
  }
  return Object.is(a, b) ? "SAME" : "DIFFERENT";
}

export type FieldComparison = {
  readonly field: string;
  readonly manual: unknown;
  readonly playwright: unknown;
  readonly difference: DiffKind;
  readonly potentialRelevance: "none" | "low" | "possible" | "outcome";
  readonly evidenceStrength: "weak" | "medium" | "strong";
};

const RELEVANCE: Record<string, { relevance: FieldComparison["potentialRelevance"]; strength: FieldComparison["evidenceStrength"] }> = {
  webdriver: { relevance: "possible", strength: "medium" },
  userAgent: { relevance: "possible", strength: "medium" },
  cookieNames: { relevance: "possible", strength: "weak" },
  webglVendor: { relevance: "possible", strength: "weak" },
  webglRenderer: { relevance: "possible", strength: "weak" },
  pluginsLength: { relevance: "low", strength: "weak" },
  mimeTypesLength: { relevance: "low", strength: "weak" },
  language: { relevance: "low", strength: "weak" },
  languages: { relevance: "low", strength: "weak" },
  timezone: { relevance: "low", strength: "weak" },
  innerWidth: { relevance: "low", strength: "weak" },
  innerHeight: { relevance: "low", strength: "weak" },
  devicePixelRatio: { relevance: "low", strength: "weak" },
  hardwareConcurrency: { relevance: "low", strength: "weak" },
  deviceMemory: { relevance: "low", strength: "weak" },
  platform: { relevance: "possible", strength: "weak" },
  serviceWorkerScopes: { relevance: "low", strength: "weak" },
  localStorageKeys: { relevance: "possible", strength: "weak" },
  sessionStorageKeys: { relevance: "possible", strength: "weak" },
  challengeDetected: { relevance: "outcome", strength: "strong" },
  organicResultsDetected: { relevance: "outcome", strength: "strong" },
};

export function compareSnapshots(
  manual: EnvSnapshot,
  playwright: EnvSnapshot,
): FieldComparison[] {
  const keys: (keyof EnvSnapshot)[] = [
    "userAgent",
    "platform",
    "language",
    "languages",
    "timezone",
    "webdriver",
    "hardwareConcurrency",
    "deviceMemory",
    "maxTouchPoints",
    "cookieEnabled",
    "pluginsLength",
    "mimeTypesLength",
    "innerWidth",
    "innerHeight",
    "devicePixelRatio",
    "screenWidth",
    "screenHeight",
    "webglVendor",
    "webglRenderer",
    "cookieNames",
    "localStorageKeys",
    "sessionStorageKeys",
    "serviceWorkerScopes",
    "cacheStorageKeys",
    "permissions",
  ];
  return keys.map((field) => {
    const difference = compareValue(manual[field], playwright[field]);
    const meta = RELEVANCE[field] ?? { relevance: "low" as const, strength: "weak" as const };
    return {
      field,
      manual: manual[field],
      playwright: playwright[field],
      difference,
      potentialRelevance: difference === "DIFFERENT" ? meta.relevance : "none",
      evidenceStrength: difference === "DIFFERENT" ? meta.strength : "weak",
    };
  });
}

export function firstDivergencePoint(comparisons: {
  t0: FieldComparison[];
  t1: FieldComparison[];
  t2: FieldComparison[];
}): "T0" | "T1" | "T2" | "NONE" {
  const relevant = (rows: FieldComparison[]) =>
    rows.some(
      (r) =>
        r.difference === "DIFFERENT" &&
        (r.potentialRelevance === "possible" || r.potentialRelevance === "outcome"),
    );
  const anyDiff = (rows: FieldComparison[]) => rows.some((r) => r.difference === "DIFFERENT");
  if (relevant(comparisons.t0) || anyDiff(comparisons.t0)) return "T0";
  if (relevant(comparisons.t1) || anyDiff(comparisons.t1)) return "T1";
  if (relevant(comparisons.t2) || anyDiff(comparisons.t2)) return "T2";
  return "NONE";
}

export function classifyDivergence(input: {
  firstPoint: "T0" | "T1" | "T2" | "NONE";
  t0Diffs: FieldComparison[];
  possibleRelevantDiffs: FieldComparison[];
}): { caseId: DivergenceCase; label: string; causeIdentified: false } {
  const strongBefore = input.t0Diffs.filter(
    (d) => d.difference === "DIFFERENT" && d.potentialRelevance === "possible",
  );
  if (input.firstPoint === "T0" && strongBefore.length > 0) {
    return {
      caseId: "A",
      label: "Existe diferencia observable fuerte antes del submit",
      causeIdentified: false,
    };
  }
  if (input.firstPoint === "T1" || input.firstPoint === "T2") {
    return {
      caseId: "B",
      label:
        "No existen diferencias relevantes antes del submit, o aparecen durante/después de la navegación",
      causeIdentified: false,
    };
  }
  if (input.possibleRelevantDiffs.length > 0) {
    return {
      caseId: "C",
      label: "Existen diferencias, pero ninguna explica razonablemente el challenge",
      causeIdentified: false,
    };
  }
  return {
    caseId: "D",
    label: "No se encontró ninguna diferencia observable significativa",
    causeIdentified: false,
  };
}

/** Expression string for page.evaluate / CDP Runtime.evaluate — read-only. */
export const ENV_SNAPSHOT_JS = `(() => {
  const keysOf = (store) => {
    try { return Object.keys(store || {}); } catch { return []; }
  };
  const cookieNames = (() => {
    try {
      return document.cookie
        ? document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(Boolean)
        : [];
    } catch { return []; }
  })();
  let webglVendor = null, webglRenderer = null;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        webglVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
        webglRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      }
    }
  } catch {}
  const permissions = {};
  const nav = navigator;
  let timezone = null;
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
  let serviceWorkerScopes = [];
  try {
    // sync snapshot only; async registration list filled by host if needed
    serviceWorkerScopes = [];
  } catch {}
  return {
    userAgent: nav.userAgent || null,
    appName: nav.appName || null,
    appVersion: nav.appVersion || null,
    platform: nav.platform || null,
    language: nav.language || null,
    languages: Array.from(nav.languages || []),
    hardwareConcurrency: nav.hardwareConcurrency ?? null,
    deviceMemory: nav.deviceMemory ?? null,
    maxTouchPoints: nav.maxTouchPoints ?? null,
    cookieEnabled: nav.cookieEnabled ?? null,
    onLine: nav.onLine ?? null,
    webdriver: typeof nav.webdriver === 'boolean' ? nav.webdriver : (nav.webdriver == null ? null : !!nav.webdriver),
    innerWidth: window.innerWidth ?? null,
    innerHeight: window.innerHeight ?? null,
    outerWidth: window.outerWidth ?? null,
    outerHeight: window.outerHeight ?? null,
    devicePixelRatio: window.devicePixelRatio ?? null,
    screenWidth: screen.width ?? null,
    screenHeight: screen.height ?? null,
    screenAvailWidth: screen.availWidth ?? null,
    screenAvailHeight: screen.availHeight ?? null,
    colorDepth: screen.colorDepth ?? null,
    pixelDepth: screen.pixelDepth ?? null,
    pluginsLength: nav.plugins ? nav.plugins.length : null,
    mimeTypesLength: nav.mimeTypes ? nav.mimeTypes.length : null,
    timezone,
    permissions,
    webglVendor,
    webglRenderer,
    localStorageKeys: keysOf(window.localStorage),
    sessionStorageKeys: keysOf(window.sessionStorage),
    cookieNames,
    serviceWorkerScopes,
    cacheStorageKeys: [],
    url: location.href,
    title: document.title || null,
  };
})()`;

export function detectChallengeText(body: string, title: string, url: string): boolean {
  const t = `${title}\n${body}\n${url}`.toLowerCase();
  if (/bots use duckduckgo|please complete the following challenge|select all squares containing/.test(t)) {
    return true;
  }
  if (/are you a robot|verify you are human|\/assets\/anomaly\//.test(t)) return true;
  return false;
}

export function countResourceTypes(
  events: readonly NetworkEvent[],
): ResourceTypeCounts {
  const out: Record<string, number> = {};
  for (const e of events) {
    if (e.kind !== "request") continue;
    const k = e.resourceType || "other";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
