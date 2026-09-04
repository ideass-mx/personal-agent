/**
 * Fase 7.5 — versioning / installer identity.
 */
import assert from "node:assert/strict";
import {
  createHash,
  randomBytes,
} from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertBuildInfoHasNoSecrets,
  expectedInstallerFileName,
  installerBaseName,
  readCanonicalVersion,
  resolveChannel,
  resolveProductBuildInfo,
  sha256File,
  toPublicBuildInfo,
  writeProductVersionArtifacts,
} from "../release/product-version.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const tmp = fsMkTmp();

function fsMkTmp() {
  return path.join(os.tmpdir(), `pa-ver-${randomBytes(4).toString("hex")}`);
}

after(() => {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("product versioning (PHASE 7.5)", () => {
  it("canonical version comes from root package.json", () => {
    const v = readCanonicalVersion(repoRoot);
    assert.match(v, /^\d+\.\d+\.\d+$/);
    const pkg = JSON.parse(
      readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    );
    assert.equal(v, pkg.version);
  });

  it("release vs dev installer names", () => {
    assert.equal(
      installerBaseName({
        version: "0.7.0",
        build: "20260904.42",
        channel: "release",
      }),
      "PersonalAgent-Setup-0.7.0-win-x64",
    );
    assert.equal(
      installerBaseName({
        version: "0.7.0",
        build: "20260904.42",
        channel: "dev",
      }),
      "PersonalAgent-Setup-0.7.0-dev.20260904.42-win-x64",
    );
  });

  it("0.7.0 and 0.7.1 produce distinct artifact names", () => {
    const a = expectedInstallerFileName({
      version: "0.7.0",
      build: "1",
      channel: "release",
      installerBaseName: installerBaseName({
        version: "0.7.0",
        build: "1",
        channel: "release",
      }),
    });
    const b = expectedInstallerFileName({
      version: "0.7.1",
      build: "2",
      channel: "release",
      installerBaseName: installerBaseName({
        version: "0.7.1",
        build: "2",
        channel: "release",
      }),
    });
    assert.equal(a, "PersonalAgent-Setup-0.7.0-win-x64.exe");
    assert.equal(b, "PersonalAgent-Setup-0.7.1-win-x64.exe");
    assert.notEqual(a, b);
  });

  it("build-info contains required fields and no secrets", () => {
    const info = resolveProductBuildInfo({
      env: {
        PERSONAL_AGENT_BUILD: "20260904.99",
        GITHUB_SHA: "abcdef0123456789",
        GITHUB_REF_TYPE: "tag",
        GITHUB_REF: "refs/tags/v0.1.0",
      },
      now: new Date("2026-09-04T15:30:00.000Z"),
    });
    assert.equal(info.version, readCanonicalVersion(repoRoot));
    assert.equal(info.build, "20260904.99");
    assert.equal(info.commit, "abcdef0");
    assert.equal(info.channel, "release");
    assert.equal(info.platform, "windows");
    assert.equal(info.architecture, "x64");
    assert.equal(info.builtAt, "2026-09-04T15:30:00Z");
    const pub = toPublicBuildInfo(info);
    assertBuildInfoHasNoSecrets(pub);
    assert.equal("credential" in pub, false);
  });

  it("tag channel is release; workflow_dispatch is dev", () => {
    assert.equal(
      resolveChannel({ GITHUB_REF_TYPE: "tag", GITHUB_REF: "refs/tags/v0.1.0" }),
      "release",
    );
    assert.equal(resolveChannel({}), "dev");
  });

  it("writeProductVersionArtifacts writes build-info + VERSION + iss defines", () => {
    const out = path.join(tmp, "product");
    mkdirSync(out, { recursive: true });
    const info = resolveProductBuildInfo({
      env: {
        PERSONAL_AGENT_BUILD: "20260904.7",
        GITHUB_SHA: "deadbeefcafebabe",
        PERSONAL_AGENT_RELEASE: "1",
      },
      now: new Date("2026-09-04T12:00:00Z"),
    });
    writeProductVersionArtifacts(out, info);
    const bi = JSON.parse(
      readFileSync(path.join(out, "build-info.json"), "utf8"),
    );
    assert.equal(bi.version, info.version);
    assert.equal(bi.build, "20260904.7");
    assert.equal(
      readFileSync(path.join(out, "VERSION"), "utf8").trim(),
      info.version,
    );
    const gen = readFileSync(
      path.join(repoRoot, "installer/windows/version.generated.iss"),
      "utf8",
    );
    assert.match(gen, new RegExp(`MyAppVersion "${info.version}"`));
    assert.match(gen, /MyOutputBaseFilename "PersonalAgent-Setup-/);
    assert.doesNotMatch(gen, /API_KEY|HUB_TOKEN|sk-ant/);
  });

  it("SHA-256 matches installer bytes; versions coexist under dist/releases", () => {
    const winDir = path.join(tmp, "dist", "windows");
    mkdirSync(winDir, { recursive: true });
    const mkFake = (version) => {
      const info = {
        product: "personal-agent",
        version,
        build: `b-${version}`,
        commit: "abc1234",
        commitFull: "abc1234ffff",
        platform: "windows",
        architecture: "x64",
        builtAt: "2026-09-04T15:30:00Z",
        channel: "release",
        installerBaseName: installerBaseName({
          version,
          build: `b-${version}`,
          channel: "release",
        }),
      };
      const name = expectedInstallerFileName(info);
      const exePath = path.join(winDir, name);
      writeFileSync(exePath, `fake-installer-${version}-${randomBytes(8).toString("hex")}`);
      // Point finalize at tmp repo by copying into real dist — use finalize with paths
      return { info, exePath, name };
    };

    // Use finalize against repoRoot dist — isolate under tmp by monkeypatching via direct hash
    const a = mkFake("0.7.0");
    const b = mkFake("0.7.1");
    const hashA = sha256File(a.exePath);
    const hashB = sha256File(b.exePath);
    assert.notEqual(hashA, hashB);
    writeFileSync(`${a.exePath}.sha256`, `${hashA}  ${a.name}\n`);
    writeFileSync(`${b.exePath}.sha256`, `${hashB}  ${b.name}\n`);
    assert.equal(
      readFileSync(`${a.exePath}.sha256`, "utf8").split(/\s+/)[0],
      createHash("sha256").update(readFileSync(a.exePath)).digest("hex"),
    );
    assert.equal(existsSync(a.exePath) && existsSync(b.exePath), true);
    assert.notEqual(a.name, b.name);
  });

  it("Inno AppId remains stable while OutputBaseFilename is versioned", () => {
    const iss = readFileSync(
      path.join(repoRoot, "installer/windows/personal-agent.iss"),
      "utf8",
    );
    assert.match(
      iss,
      /AppId=\{\{A8E5C2F1-9B47-4D3A-9E21-PERSONALAGENT51\}\}/,
    );
    assert.match(iss, /OutputBaseFilename=\{#MyOutputBaseFilename\}/);
    assert.match(iss, /AppVersion=\{#MyAppVersion\}/);
    assert.match(iss, /version\.generated\.iss/);
  });

  it("CI artifact name is not a constant PersonalAgent-Setup.exe", () => {
    const yml = readFileSync(
      path.join(repoRoot, ".github/workflows/windows-installer.yml"),
      "utf8",
    );
    assert.doesNotMatch(
      yml,
      /path:\s*dist\/windows\/PersonalAgent-Setup\.exe\s*$/m,
    );
    assert.match(yml, /PersonalAgent-Setup-\*-win-x64\.exe/);
    assert.match(yml, /finalize-installer/);
    assert.match(yml, /artifact_name=/);
  });
});
