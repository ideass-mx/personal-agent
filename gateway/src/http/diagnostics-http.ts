import type { Hono } from "hono";
import { authenticateHttpRequest, httpErrorBody } from "./bearer-auth.ts";
import type { SqliteDiagnosticsStore } from "../diagnostics/store.ts";

export function mountDiagnosticsHttp(
  app: Hono,
  deps: { hubToken: string; diagnostics: SqliteDiagnosticsStore },
): void {
  app.get("/v1/diagnostics/recent", (c) => {
    const principal = authenticateHttpRequest(c, deps.hubToken);
    if (!principal) {
      return c.json(httpErrorBody("unauthorized", "No autorizado"), 401);
    }
    const limit = Number(c.req.query("limit") || 50);
    return c.json({
      ok: true,
      events: deps.diagnostics.recent(limit),
    });
  });

  app.get("/v1/diagnostics/:diagnosticId", (c) => {
    const principal = authenticateHttpRequest(c, deps.hubToken);
    if (!principal) {
      return c.json(httpErrorBody("unauthorized", "No autorizado"), 401);
    }
    const diagnosticId = String(c.req.param("diagnosticId") || "").trim();
    const events = deps.diagnostics.byDiagnosticId(diagnosticId);
    if (events.length === 0) {
      return c.json(
        httpErrorBody("diagnostic_not_found", "Diagnóstico no encontrado."),
        404,
      );
    }
    return c.json({ ok: true, diagnosticId, events });
  });
}

