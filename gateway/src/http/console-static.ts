import { existsSync } from "node:fs";
import path from "node:path";

/** Resuelve el directorio estático de Agent Console (PHASE 50 / R-49-01). */
export function resolveConsoleStaticRoot(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string | null {
  const fromEnv = env.AGENT_CONSOLE_STATIC?.trim();
  if (fromEnv && existsSync(path.join(fromEnv, "index.html"))) {
    return path.resolve(fromEnv);
  }
  const candidates = [
    path.resolve(cwd, "web/dist"),
    path.resolve(cwd, "dist/web"),
    path.resolve(cwd, "console"),
    path.resolve(cwd, "../web/dist"),
    path.resolve(cwd, "../dist/web"),
    path.resolve(cwd, "../console"),
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, "index.html"))) return dir;
  }
  return null;
}
