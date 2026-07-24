import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.ts";

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

export const db = new Database(config.dbFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/** Aplica en orden las migraciones de /db/migrations que falten. */
export function runMigrations(): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name       TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  const applied = new Set(
    db.prepare("SELECT name FROM _migrations").all().map((r: any) => r.name),
  );

  const files = fs
    .readdirSync(config.migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(config.migrationsDir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
    })();
    console.log(`[memory] migración aplicada: ${file}`);
  }
}
