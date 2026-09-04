/**
 * PHASE 64.1 — detect PE / ELF / Mach-O for Windows packaging fail-closed.
 * Packaging tooling only. No product runtime imports.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";

/** @typedef {"PE"|"ELF"|"Mach-O"|"unknown"} BinaryFormat */
/** @typedef {"x64"|"arm64"|"ia32"|"unknown"} BinaryArch */

/**
 * Classify native binary format from magic bytes.
 * @param {Buffer} buf
 * @returns {{ format: BinaryFormat, architecture: BinaryArch, detail?: string }}
 */
export function detectBinaryFormat(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) {
    return { format: "unknown", architecture: "unknown", detail: "truncated" };
  }

  // ELF: 0x7F 'E' 'L' 'F'
  if (
    buf[0] === 0x7f &&
    buf[1] === 0x45 &&
    buf[2] === 0x4c &&
    buf[3] === 0x46
  ) {
    let architecture = "unknown";
    if (buf.length >= 19) {
      const machine = buf.readUInt16LE(18);
      if (machine === 0x3e) architecture = "x64";
      else if (machine === 0xb7) architecture = "arm64";
      else if (machine === 0x03) architecture = "ia32";
    }
    return { format: "ELF", architecture };
  }

  // Mach-O fat / thin magics (big or little endian)
  const machMags = [
    0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca,
  ];
  if (buf.length >= 4) {
    const be = buf.readUInt32BE(0);
    const le = buf.readUInt32LE(0);
    if (machMags.includes(be) || machMags.includes(le)) {
      let architecture = "unknown";
      // Thin little-endian 64-bit: MH_MAGIC_64 = 0xfeedfacf at LE → bytes cf fa ed fe
      if (le === 0xfeedfacf || be === 0xfeedfacf) {
        if (buf.length >= 8) {
          const cputype = buf.readUInt32LE(4);
          if (cputype === 0x01000007) architecture = "x64";
          if (cputype === 0x0100000c) architecture = "arm64";
        }
      }
      return { format: "Mach-O", architecture };
    }
  }

  // PE: MZ … PE\0\0
  if (buf[0] === 0x4d && buf[1] === 0x5a) {
    if (buf.length < 0x40) {
      return { format: "unknown", architecture: "unknown", detail: "MZ truncated" };
    }
    const peOff = buf.readUInt32LE(0x3c);
    if (peOff <= 0 || peOff + 6 > buf.length) {
      return { format: "unknown", architecture: "unknown", detail: "invalid PE offset" };
    }
    if (
      buf[peOff] !== 0x50 ||
      buf[peOff + 1] !== 0x45 ||
      buf[peOff + 2] !== 0x00 ||
      buf[peOff + 3] !== 0x00
    ) {
      return { format: "unknown", architecture: "unknown", detail: "MZ without PE signature" };
    }
    const machine = buf.readUInt16LE(peOff + 4);
    let architecture = "unknown";
    if (machine === 0x8664) architecture = "x64";
    else if (machine === 0xaa64) architecture = "arm64";
    else if (machine === 0x014c) architecture = "ia32";
    return { format: "PE", architecture };
  }

  return { format: "unknown", architecture: "unknown" };
}

/**
 * @param {string} dir
 * @param {string[]} acc
 */
function walkNodeFiles(dir, acc) {
  if (!existsSync(dir)) return;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "." || ent.name === "..") continue;
      walkNodeFiles(full, acc);
      continue;
    }
    if (ent.isFile() && ent.name.endsWith(".node")) {
      acc.push(full);
    }
  }
}

/**
 * Find all *.node under root (absolute paths).
 * @param {string} root
 * @returns {string[]}
 */
export function findNativeModules(root) {
  const acc = [];
  walkNodeFiles(root, acc);
  acc.sort();
  return acc;
}

/**
 * Validate all *.node under a Windows package root are PE.
 * @param {string} packageRoot absolute path to dist/windows/PersonalAgent
 * @param {{ target?: string, log?: (s: string) => void }} [opts]
 * @returns {{ ok: boolean, modules: object[], errors: string[] }}
 */
export function validateWindowsNativeModules(packageRoot, opts = {}) {
  const target = opts.target ?? "windows-x64";
  const log =
    opts.log ??
    ((s) => {
      process.stderr.write(`${s}\n`);
    });

  log(`[windows-packaging] target=${target}`);
  log(`[windows-packaging] scanning: ${packageRoot}`);

  if (!existsSync(packageRoot) || !statSync(packageRoot).isDirectory()) {
    const msg = `package root missing or not a directory: ${packageRoot}`;
    log(`[windows-packaging] ERROR: ${msg}`);
    return { ok: false, modules: [], errors: [msg] };
  }

  const paths = findNativeModules(packageRoot);
  log(`[windows-packaging] native modules found: ${paths.length}`);

  const modules = [];
  const errors = [];

  for (const filePath of paths) {
    const name = path.basename(filePath);
    let buf;
    try {
      buf = readFileSync(filePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${name}: unreadable (${message})`);
      modules.push({
        path: filePath,
        name,
        format: "unknown",
        architecture: "unknown",
        result: "FAIL",
      });
      log(`[windows-packaging] module=${name}`);
      log(`[windows-packaging] format=unknown`);
      log(`[windows-packaging] result=FAIL`);
      continue;
    }

    const detected = detectBinaryFormat(buf);
    let result = "PASS";
    if (detected.format !== "PE") {
      result = "FAIL";
      errors.push(
        `${name}: format=${detected.format} expected=PE (target=${target})`,
      );
    } else if (
      detected.architecture === "arm64" ||
      detected.architecture === "ia32"
    ) {
      result = "FAIL";
      errors.push(
        `${name}: architecture=${detected.architecture} expected=x64 (target=${target})`,
      );
    }

    modules.push({
      path: filePath,
      name,
      format: detected.format,
      architecture: detected.architecture,
      result,
      detail: detected.detail,
    });

    log(`[windows-packaging] module=${name}`);
    log(`[windows-packaging] format=${detected.format}`);
    log(`[windows-packaging] architecture=${detected.architecture}`);
    log(`[windows-packaging] result=${result}`);
    if (result === "FAIL") {
      log(`[windows-packaging] expected=PE/x64`);
      log(`[windows-packaging] ERROR: incompatible native module`);
    }
  }

  const ok = errors.length === 0;
  if (ok) {
    log(`[windows-packaging] validation=PASS`);
  } else {
    log(`[windows-packaging] validation=FAIL`);
    log(`[windows-packaging] package aborted`);
  }

  return { ok, modules, errors };
}

/**
 * Throw if validation fails (for package:windows fail-closed).
 * @param {string} packageRoot
 */
export function assertWindowsNativeModules(packageRoot) {
  const result = validateWindowsNativeModules(packageRoot);
  if (!result.ok) {
    const detail = result.errors.join("; ") || "native module validation failed";
    throw new Error(`[windows-packaging] incompatible native modules: ${detail}`);
  }
  return result;
}
