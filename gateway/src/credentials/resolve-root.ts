/**
 * Root de SecretStore local (encrypted file). No es ObjectStorage ni workspace.
 */
import path from "node:path";
import { config } from "../config.ts";

export function resolveCredentialsRoot(): string {
  const fromEnv = process.env.PERSONAL_AGENT_CREDENTIALS_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(path.dirname(path.resolve(config.dbFile)), "..", "credentials");
}
