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
  /**
   * Clave Anthropic de entorno (opcional en boot).
   * Efectiva en runtime: env → fichero persistido (setup) → este valor.
   */
  readonly anthropicApiKey: string;
  readonly hubToken: string;
  /** Persistent Agent identity (from Desktop). Optional for legacy .env boots. */
  readonly agentId: string | null;
  readonly port: number;
  /**
   * Bind address. Default loopback (PHASE 57.4).
   * Opt-in remote: HUB_HOST=0.0.0.0 (not recommended yet).
   */
  readonly bindHost: string;
  readonly migrationsDir: string;
  readonly dbFile: string;
  /**
   * Root de LocalObjectStorage (producto).
   * PERSONAL_AGENT_OBJECTS_DIR o sibling de data/: ../objects
   */
  readonly objectsDir: string;
  /** Límite del proveedor LLM, no del Agent. */
  readonly maxTokens: number;
  readonly historyWindow: number;
};

function resolveObjectsDir(dbFile: string): string {
  const fromEnv = process.env.PERSONAL_AGENT_OBJECTS_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(path.dirname(path.resolve(dbFile)), "..", "objects");
}

const dbFile = path.resolve(
  process.env.PERSONAL_AGENT_DB ||
    path.resolve(here, "../data/personal-agent.db"),
);

export const config: GatewayConfig = {
  // Opcional: Gateway puede llegar a AGENT_READY sin LLM (onboarding Web).
  anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || "",
  /**
   * Legacy install credential (env `HUB_TOKEN`).
   * Used for HTTP Bearer + WS authKind=install. Not Pairing Session / QR.
   */
  hubToken: required("HUB_TOKEN"),
  agentId:
    process.env.PERSONAL_AGENT_ID?.trim() ||
    process.env.PERSONAL_AGENT_HOST_ID?.trim() ||
    null,
  port: Number(process.env.HUB_PORT ?? 8787),
  bindHost: (process.env.HUB_HOST?.trim() || "127.0.0.1"),

  migrationsDir: existsSync(packagedMigrations)
    ? packagedMigrations
    : sourceMigrations,

  dbFile,

  objectsDir: resolveObjectsDir(dbFile),

  maxTokens: 1024,
  historyWindow: 30,
};
