/**
 * Extracción orgánica genérica — resiliente a cambios de clases CSS.
 * Plan A: todos los &lt;a href&gt; → denylist de shell → dedupe.
 */
import { sanitizeDiagnosticUrl } from "../diagnostics.ts";
import type { ElectronSerpOrganicHit } from "../types.ts";
import type { PageExtract } from "./page-extract.ts";
import type {
  ChallengeInput,
  OrganicHit,
  SiteChallengeOptions,
  SiteOrganicOptions,
} from "./site-profile.ts";

/** Señales comunes de challenge / CDN / bot-check (cualquier motor). */
const GENERIC_CHALLENGE_PATTERNS: readonly RegExp[] = [
  /are you a robot/,
  /verify you are human/,
  /unusual traffic/,
  /access denied/,
  /please complete the (following challenge|security check)/,
  /cf-challenge/,
  /just a moment/,
  /attention required/,
  /challenge-platform/,
  /bot detection/,
  /\/cdn-cgi\/challenge/,
  /\/challenge\//,
  /select all squares containing/,
];

const DEFAULT_TITLE_DENY =
  /^(ios browser|android browser|duck\.ai|podcast|community|homepage|settings|sign in|log in|privacy|terms)$/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeShell(host: string): string {
  return host.replace(/^www\./, "").toLowerCase();
}

function isShellHost(hostname: string, shellHosts: readonly string[]): boolean {
  const h = normalizeShell(hostname);
  return shellHosts.some((d) => {
    const base = normalizeShell(d);
    return h === base || h.endsWith(`.${base}`);
  });
}

export function detectChallenge(
  input: ChallengeInput,
  options: SiteChallengeOptions = {},
): boolean {
  const t = `${input.title ?? ""}\n${input.bodyText ?? ""}\n${input.url ?? ""}`.toLowerCase();
  for (const re of GENERIC_CHALLENGE_PATTERNS) {
    if (re.test(t)) return true;
  }
  for (const re of options.extraPatterns ?? []) {
    if (re.test(t)) return true;
  }
  if (/captcha/.test(t)) {
    if (options.captchaAllowIf && options.captchaAllowIf.test(t)) return false;
    return true;
  }
  return false;
}

/**
 * Filtra candidatos orgánicos desde links genéricos.
 */
export function filterOrganicHits(
  links: readonly { href: string; text: string }[],
  limit: number,
  options: SiteOrganicOptions,
): OrganicHit[] {
  const out: OrganicHit[] = [];
  const seen = new Set<string>();
  const titleDeny = options.titleDeny ?? DEFAULT_TITLE_DENY;
  const dedupeKey =
    options.dedupeKey ??
    ((u: URL) => `${u.hostname}${u.pathname}`.toLowerCase());

  for (const link of links) {
    let u: URL;
    try {
      u = new URL(link.href);
    } catch {
      continue;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    if (isShellHost(u.hostname, options.shellHosts)) continue;
    if (options.rejectHref?.(u)) continue;

    const title = link.text.replace(/\s+/g, " ").trim();
    if (title.length < 3) continue;
    if (titleDeny.test(title)) continue;

    const key = dedupeKey(u);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      title: title.slice(0, 200),
      url: u.toString(),
      domain: hostOf(u.toString()),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function organicResultsDetected(
  hits: readonly OrganicHit[],
): boolean {
  return hits.length > 0;
}

export function analyzeSerpPage(
  extract: PageExtract,
  options: {
    organic: SiteOrganicOptions;
    challenge: SiteChallengeOptions;
    limit?: number;
  },
): {
  challenge: boolean;
  hits: ElectronSerpOrganicHit[];
  containsPostgresqlOrg: boolean;
  organicDetected: boolean;
  finalUrl: string | null;
  pageTitle: string | null;
} {
  const challenge = detectChallenge(
    {
      url: extract.url,
      title: extract.title,
      bodyText: extract.bodyText,
    },
    options.challenge,
  );
  const hits = filterOrganicHits(
    extract.links,
    options.limit ?? 12,
    options.organic,
  ).map((h) => ({
    title: h.title,
    url: sanitizeDiagnosticUrl(h.url) ?? h.url,
    domain: h.domain,
  }));
  const containsPostgresqlOrg = hits.some(
    (h) =>
      h.domain === "postgresql.org" || h.domain.endsWith(".postgresql.org"),
  );
  return {
    challenge,
    hits,
    containsPostgresqlOrg,
    organicDetected: !challenge && organicResultsDetected(hits),
    finalUrl: sanitizeDiagnosticUrl(extract.url),
    pageTitle: extract.title ? extract.title.slice(0, 200) : null,
  };
}
