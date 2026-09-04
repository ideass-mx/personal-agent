/**
 * Validate *.node under an existing Windows package tree (no re-package).
 * Usage: node scripts/validate-windows-natives.mjs [path]
 * Default: dist/windows/PersonalAgent
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertWindowsNativeModules } from "./windows-native-modules.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(
  process.argv[2] ?? path.join(repoRoot, "dist", "windows", "PersonalAgent"),
);

try {
  assertWindowsNativeModules(root);
  process.exit(0);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
