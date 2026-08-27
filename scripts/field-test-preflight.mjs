#!/usr/bin/env node
/**
 * Preflight no productivo para field test (PHASE 44).
 * Verifica health Gateway sin imprimir secretos.
 *
 * Uso:
 *   HUB_URL=http://127.0.0.1:8787 HUB_TOKEN=*** node scripts/field-test-preflight.mjs
 */
const baseUrl = (process.env.HUB_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const token = process.env.HUB_TOKEN ?? "";

async function get(path, auth = false) {
  const headers = auth && token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${baseUrl}${path}`, { headers });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, body };
}

async function main() {
  console.log("[field-test-preflight] HUB_URL:", baseUrl);
  if (!token) {
    console.warn("[field-test-preflight] WARN: HUB_TOKEN no definido — solo GET /health público");
  }

  const health = await get("/health");
  if (health.status !== 200) {
    console.error("[field-test-preflight] FAIL: /health", health.status, health.body);
    process.exit(1);
  }
  console.log("[field-test-preflight] OK: /health", JSON.stringify(health.body));

  if (token) {
    const workspaces = await get("/workspaces", true);
    if (workspaces.status === 401) {
      console.error("[field-test-preflight] FAIL: token rechazado (401)");
      process.exit(1);
    }
    console.log(
      "[field-test-preflight] OK: auth Bearer (status",
      workspaces.status + ")",
    );
  }

  console.log("[field-test-preflight] PASS — listo para field test Android");
}

main().catch((err) => {
  console.error("[field-test-preflight] ERROR:", err.message);
  process.exit(1);
});
