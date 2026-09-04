/**
 * Identidad de build del producto (Fase 7.5).
 * Lee build-info.json empaquetado; no es source of truth de SetupState.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ProductBuildInfo = {
  product: string;
  version: string;
  build: string;
  commit: string;
  commitFull?: string;
  platform: string;
  architecture: string;
  builtAt: string;
  channel?: string;
};

const FALLBACK: ProductBuildInfo = {
  product: "personal-agent",
  version: "0.1.0",
  build: "dev",
  commit: "unknown",
  platform: process.platform === "win32" ? "windows" : process.platform,
  architecture: process.arch === "x64" ? "x64" : process.arch,
  builtAt: "unknown",
  channel: "dev",
};

function tryRead(file: string): ProductBuildInfo | null {
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as ProductBuildInfo;
    if (!raw || typeof raw.version !== "string") return null;
    return {
      product: String(raw.product || FALLBACK.product),
      version: String(raw.version),
      build: String(raw.build || "unknown"),
      commit: String(raw.commit || "unknown"),
      commitFull: raw.commitFull ? String(raw.commitFull) : undefined,
      platform: String(raw.platform || FALLBACK.platform),
      architecture: String(raw.architecture || FALLBACK.architecture),
      builtAt: String(raw.builtAt || "unknown"),
      channel: raw.channel ? String(raw.channel) : undefined,
    };
  } catch {
    return null;
  }
}

function candidatePaths(): string[] {
  const out: string[] = [];
  const fromEnv = process.env.PERSONAL_AGENT_BUILD_INFO?.trim();
  if (fromEnv) out.push(path.resolve(fromEnv));
  const productRoot = process.env.PERSONAL_AGENT_PRODUCT_ROOT?.trim();
  if (productRoot) {
    out.push(path.join(path.resolve(productRoot), "build-info.json"));
  }
  // Packaged: gateway.cjs lives in <product>/gateway/
  const here =
    typeof __dirname === "string"
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));
  out.push(path.resolve(here, "..", "build-info.json"));
  out.push(path.resolve(here, "..", "..", "build-info.json"));
  out.push(path.resolve(process.cwd(), "build-info.json"));
  out.push(path.resolve(process.cwd(), "..", "build-info.json"));
  return out;
}

let cached: ProductBuildInfo | null = null;

export function loadProductBuildInfo(): ProductBuildInfo {
  if (cached) return cached;
  for (const p of candidatePaths()) {
    const info = tryRead(p);
    if (info) {
      cached = info;
      return info;
    }
  }
  // Dev: try root package.json version only
  try {
    const rootPkg = path.resolve(
      typeof __dirname === "string"
        ? __dirname
        : path.dirname(fileURLToPath(import.meta.url)),
      "../../package.json",
    );
    if (existsSync(rootPkg)) {
      const pkg = JSON.parse(readFileSync(rootPkg, "utf8")) as {
        version?: string;
        name?: string;
      };
      if (pkg.version) {
        cached = {
          ...FALLBACK,
          product: pkg.name || FALLBACK.product,
          version: pkg.version,
        };
        return cached;
      }
    }
  } catch {
    /* ignore */
  }
  cached = { ...FALLBACK };
  return cached;
}

/** For tests only. */
export function resetProductBuildInfoCache(): void {
  cached = null;
}

export function productVersionForHealth(): {
  product: string;
  version: string;
  build: string;
  commit: string;
  platform: string;
  architecture: string;
  builtAt: string;
  channel?: string;
} {
  const i = loadProductBuildInfo();
  return {
    product: i.product,
    version: i.version,
    build: i.build,
    commit: i.commit,
    platform: i.platform,
    architecture: i.architecture,
    builtAt: i.builtAt,
    ...(i.channel ? { channel: i.channel } : {}),
  };
}
