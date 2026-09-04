/**
 * Fase 7.5 — Identidad de versión/build del producto.
 * Fuente canónica: package.json raíz → version (SemVer).
 * No incluye secretos.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PRODUCT_ID = "personal-agent";
export const PRODUCT_DISPLAY_NAME = "Personal Agent";
export const PLATFORM_WIN = "windows";
export const ARCH_X64 = "x64";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

/** @typedef {'release' | 'dev'} ReleaseChannel */

/**
 * @typedef {object} ProductBuildInfo
 * @property {string} product
 * @property {string} version
 * @property {string} build
 * @property {string} commit
 * @property {string} commitFull
 * @property {string} platform
 * @property {string} architecture
 * @property {string} builtAt
 * @property {ReleaseChannel} channel
 * @property {string} installerBaseName
 */

export function getRepoRoot() {
  return repoRoot;
}

export function readCanonicalVersion(root = repoRoot) {
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const version = String(pkg.version || "").trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `Canonical version missing/invalid in root package.json (got ${JSON.stringify(pkg.version)})`,
    );
  }
  return version;
}

function utcStamp(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function resolveCommit(env = process.env) {
  const fromEnv = (env.GITHUB_SHA || env.PERSONAL_AGENT_COMMIT || "").trim();
  if (fromEnv) {
    return {
      commitFull: fromEnv,
      commit: fromEnv.slice(0, 7),
    };
  }
  try {
    const r = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (r.status === 0) {
      const full = String(r.stdout || "").trim();
      if (full) return { commitFull: full, commit: full.slice(0, 7) };
    }
  } catch {
    /* ignore */
  }
  return { commitFull: "unknown", commit: "unknown" };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {ReleaseChannel}
 */
export function resolveChannel(env = process.env) {
  if (env.PERSONAL_AGENT_RELEASE === "1" || env.PERSONAL_AGENT_RELEASE === "true") {
    return "release";
  }
  const ref = String(env.GITHUB_REF || "");
  if (env.GITHUB_REF_TYPE === "tag" || /^refs\/tags\/v\d+\.\d+\.\d+/.test(ref)) {
    return "release";
  }
  return "dev";
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {Date} [now]
 */
export function resolveBuildNumber(env = process.env, now = new Date()) {
  const explicit = String(env.PERSONAL_AGENT_BUILD || "").trim();
  if (explicit) return explicit;
  const day = utcStamp(now);
  const run = String(env.GITHUB_RUN_NUMBER || "").trim();
  if (run) return `${day}.${run}`;
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  return `${day}.${hh}${mm}${ss}`;
}

/**
 * Nombre base del instalador (sin .exe).
 * release: PersonalAgent-Setup-0.1.0-win-x64
 * dev:     PersonalAgent-Setup-0.1.0-dev.20260904.42-win-x64
 *
 * @param {{ version: string, build: string, channel: ReleaseChannel }} opts
 */
export function installerBaseName(opts) {
  const { version, build, channel } = opts;
  if (channel === "release") {
    return `PersonalAgent-Setup-${version}-win-x64`;
  }
  return `PersonalAgent-Setup-${version}-dev.${build}-win-x64`;
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   now?: Date,
 *   root?: string,
 *   platform?: string,
 *   architecture?: string,
 * }} [opts]
 * @returns {ProductBuildInfo}
 */
export function resolveProductBuildInfo(opts = {}) {
  const env = opts.env || process.env;
  const now = opts.now || new Date();
  const root = opts.root || repoRoot;
  const version = readCanonicalVersion(root);
  const build = resolveBuildNumber(env, now);
  const channel = resolveChannel(env);
  const { commit, commitFull } = resolveCommit(env);
  const platform = opts.platform || PLATFORM_WIN;
  const architecture = opts.architecture || ARCH_X64;
  const builtAt = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const base = installerBaseName({ version, build, channel });
  return {
    product: PRODUCT_ID,
    version,
    build,
    commit,
    commitFull,
    platform,
    architecture,
    builtAt,
    channel,
    installerBaseName: base,
  };
}

/** Payload seguro para empaquetar (sin secretos). */
export function toPublicBuildInfo(info) {
  return {
    product: info.product,
    version: info.version,
    build: info.build,
    commit: info.commit,
    commitFull: info.commitFull,
    platform: info.platform,
    architecture: info.architecture,
    builtAt: info.builtAt,
    channel: info.channel,
  };
}

const SECRET_KEY_RE =
  /(api[_-]?key|token|password|secret|credential|hub_token|anthropic)/i;

export function assertBuildInfoHasNoSecrets(obj) {
  const raw = JSON.stringify(obj);
  for (const banned of [
    "ANTHROPIC",
    "HUB_TOKEN",
    "sk-ant-",
    "Bearer ",
    ".env",
  ]) {
    if (raw.includes(banned)) {
      throw new Error(`build-info must not contain ${banned}`);
    }
  }
  const walk = (value, keyPath) => {
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (SECRET_KEY_RE.test(k)) {
          throw new Error(`build-info forbidden key: ${keyPath}.${k}`);
        }
        walk(v, `${keyPath}.${k}`);
      }
    }
  };
  walk(obj, "root");
}

/**
 * Genera defines ISPP para Inno (AppVersion + OutputBaseFilename).
 * AppId permanece en personal-agent.iss (estable).
 */
export function renderInnoVersionDefines(info) {
  return [
    `; Generated by scripts/release/product-version.mjs — do not edit by hand.`,
    `#define MyAppVersion "${info.version}"`,
    `#define MyOutputBaseFilename "${info.installerBaseName}"`,
    `#define MyAppBuild "${info.build}"`,
    `#define MyAppCommit "${info.commit}"`,
    `#define MyAppChannel "${info.channel}"`,
    "",
  ].join("\n");
}

/**
 * Escribe build-info.json, VERSION y version.generated.iss.
 * @param {string} productOutRoot  e.g. dist/windows/PersonalAgent
 * @param {ProductBuildInfo} [info]
 */
export function writeProductVersionArtifacts(productOutRoot, info) {
  const resolved = info || resolveProductBuildInfo();
  const publicInfo = toPublicBuildInfo(resolved);
  assertBuildInfoHasNoSecrets(publicInfo);

  mkdirSync(productOutRoot, { recursive: true });
  mkdirSync(path.join(productOutRoot, "resources"), { recursive: true });
  writeFileSync(
    path.join(productOutRoot, "build-info.json"),
    `${JSON.stringify(publicInfo, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(productOutRoot, "VERSION"),
    `${resolved.version}\n`,
    "utf8",
  );

  const issDir = path.join(repoRoot, "installer", "windows");
  mkdirSync(issDir, { recursive: true });
  const generated = renderInnoVersionDefines(resolved);
  writeFileSync(path.join(issDir, "version.generated.iss"), generated, "utf8");
  writeFileSync(
    path.join(productOutRoot, "resources", "version.generated.iss"),
    generated,
    "utf8",
  );

  return resolved;
}

export function sha256File(filePath) {
  const buf = readFileSync(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Escribe sidecar .sha256 junto al instalador y copia a dist/releases/.
 * @param {string} setupExePath
 * @param {ProductBuildInfo} info
 */
export function finalizeInstallerArtifacts(setupExePath, info) {
  if (!existsSync(setupExePath)) {
    throw new Error(`installer missing: ${setupExePath}`);
  }
  const hash = sha256File(setupExePath);
  const base = path.basename(setupExePath);
  const shaPath = `${setupExePath}.sha256`;
  writeFileSync(shaPath, `${hash}  ${base}\n`, "utf8");

  const tagDir =
    info.channel === "release"
      ? `v${info.version}`
      : `dev-${info.version}-${info.build}`;
  const releaseDir = path.join(repoRoot, "dist", "releases", tagDir);
  mkdirSync(releaseDir, { recursive: true });
  const destExe = path.join(releaseDir, base);
  const destSha = path.join(releaseDir, `${base}.sha256`);
  writeFileSync(destExe, readFileSync(setupExePath));
  writeFileSync(destSha, `${hash}  ${base}\n`, "utf8");
  writeFileSync(
    path.join(releaseDir, "build-info.json"),
    `${JSON.stringify(toPublicBuildInfo(info), null, 2)}\n`,
    "utf8",
  );

  return { hash, shaPath, releaseDir, destExe, destSha };
}

export function expectedInstallerFileName(info) {
  return `${info.installerBaseName}.exe`;
}
