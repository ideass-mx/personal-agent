import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here =
  typeof __dirname === "string"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
const packagedMigrations = path.resolve(here, "../migrations");
const sourceMigrations = path.resolve(here, "../../db/migrations");

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] Falta ${name}. Copia .env.example a .env y complétalo.`);
    process.exit(1);
  }
  return value;
}

/**
 * Infraestructura del Gateway. No es AgentDefinition (sin prompt, modelo ni policy)
 * ni configuración del Local Node.
 */
export type GatewayConfig = {
  readonly anthropicApiKey: string;
  readonly hubToken: string;
  readonly port: number;
  readonly migrationsDir: string;
  readonly dbFile: string;
  /** Límite del proveedor LLM, no del Agent. */
  readonly maxTokens: number;
  readonly historyWindow: number;
};

export const config: GatewayConfig = {
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  /** Token de auth WS; env `HUB_TOKEN` se conserva por compatibilidad. */
  hubToken: required("HUB_TOKEN"),
  port: Number(process.env.HUB_PORT ?? 8787),

  migrationsDir: existsSync(packagedMigrations)
    ? packagedMigrations
    : sourceMigrations,

  dbFile: path.resolve(
    process.env.PERSONAL_AGENT_DB ||
      path.resolve(here, "../data/personal-agent.db"),
  ),

  maxTokens: 1024,
  historyWindow: 30,
};
