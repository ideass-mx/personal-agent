/**
 * Resuelve AGENT_FILESYSTEM_ROOT para el boot Single Node.
 * Una sola fuente: process.env (tras dotenv / Shell). No duplica policy.
 */
export function resolveAgentFilesystemRoot(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const raw = env.AGENT_FILESYSTEM_ROOT;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
