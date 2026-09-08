/**
 * Fingerprint ligero de página (diagnóstico).
 */
import { createHash } from "node:crypto";

export function pageFingerprint(text: string): string {
  return createHash("sha256")
    .update(text.slice(0, 50_000), "utf8")
    .digest("hex")
    .slice(0, 16);
}
