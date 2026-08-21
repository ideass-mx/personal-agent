import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] Falta ${name}. Copia .env.example a .env y complétalo.`);
    process.exit(1);
  }
  return value;
}

export const config = {
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  /** Token de auth WS; env `HUB_TOKEN` se conserva por compatibilidad. */
  hubToken: required("HUB_TOKEN"),
  port: Number(process.env.HUB_PORT ?? 8787),

  /** Carpeta /db del monorepo (migraciones versionadas). */
  migrationsDir: path.resolve(here, "../../db/migrations"),

  /** Archivo SQLite en runtime (fuera de git): api/data/. */
  dbFile: path.resolve(here, "../data/personal-agent.db"),

  model: "claude-sonnet-4-6",
  maxTokens: 1024,

  /** Cuántos mensajes de historial se cargan como contexto. */
  historyWindow: 30,
} as const;
