/**
 * HTTP delivery de Artifacts (PHASE 58 + 62 lifecycle).
 * Depende de ArtifactManager → ObjectStorage (nunca del backend concreto).
 */
import { Readable } from "node:stream";
import type { Context, Hono } from "hono";
import type { ArtifactManager } from "../artifacts/manager.ts";
import type { Artifact } from "../artifacts/types.ts";
import {
  authenticateHttpRequest,
  authorizeArtifactRead,
  httpErrorBody,
} from "./bearer-auth.ts";

export type ArtifactHttpDeps = {
  artifacts: ArtifactManager;
  hubToken: string;
};

/** IDs opacos seguros (uuid / art_… / alfanumérico). */
export const ARTIFACT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

const SAFE_MIME_RE = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i;

export function sanitizeContentType(mime: string | undefined): string {
  if (!mime || typeof mime !== "string") return "application/octet-stream";
  const trimmed = mime.trim().slice(0, 128);
  if (!SAFE_MIME_RE.test(trimmed)) return "application/octet-stream";
  if (/[\r\n\0]/.test(trimmed)) return "application/octet-stream";
  return trimmed;
}

export function sanitizeDownloadFilename(
  name: string | undefined,
  fallback = "download",
): string {
  let base = (name ?? fallback).trim() || fallback;
  base = base.replace(/[\r\n\0\t"]/g, "");
  base = base.replace(/[/\\]/g, "_");
  base = base.replace(/\.\.+/g, ".");
  base = base.slice(0, 180);
  if (!base || base === "." || base === "..") base = fallback;
  return base;
}

export function contentDispositionAttachment(filename: string): string {
  const safe = sanitizeDownloadFilename(filename);
  return `attachment; filename="${safe}"`;
}

export function parseBytesRange(
  header: string | undefined,
  totalSize: number,
):
  | { ok: true; start: number; end: number }
  | { ok: false; code: "invalid" | "unsatisfiable" } {
  if (!header || !header.trim()) {
    return { ok: true, start: 0, end: Math.max(0, totalSize - 1) };
  }
  const m = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!m) return { ok: false, code: "invalid" };
  if (totalSize <= 0) return { ok: false, code: "unsatisfiable" };
  let start = m[1] === "" ? NaN : Number(m[1]);
  let end = m[2] === "" ? NaN : Number(m[2]);
  if (m[1] === "" && m[2] !== "") {
    const suffix = Number(m[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) {
      return { ok: false, code: "invalid" };
    }
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else {
    if (!Number.isInteger(start) || start < 0) return { ok: false, code: "invalid" };
    if (m[2] === "") end = totalSize - 1;
    if (!Number.isInteger(end) || end < start) return { ok: false, code: "invalid" };
  }
  if (start >= totalSize) return { ok: false, code: "unsatisfiable" };
  if (end >= totalSize) end = totalSize - 1;
  return { ok: true, start, end };
}

function requireArtifactAuth(c: Context, hubToken: string) {
  const principal = authenticateHttpRequest(c, hubToken);
  if (!principal) {
    return {
      denied: c.json(
        httpErrorBody("unauthorized", "Token inválido o ausente."),
        401,
      ),
    };
  }
  if (!authorizeArtifactRead(principal)) {
    return {
      denied: c.json(
        httpErrorBody("forbidden", "Sin permiso para artifacts."),
        403,
      ),
    };
  }
  return { principal };
}

/**
 * DELETED / missing → 404; EXPIRED → 410; AVAILABLE → Artifact.
 * Errores JSON no incluyen ObjectReference ni paths.
 */
function resolveArtifactForDelivery(
  c: Context,
  artifacts: ArtifactManager,
  artifactId: string,
): Artifact | Response {
  if (!ARTIFACT_ID_RE.test(artifactId)) {
    return c.json(httpErrorBody("bad_request", "artifactId inválido."), 400);
  }
  const art = artifacts.get(artifactId);
  if (!art || art.status === "DELETED") {
    return c.json(httpErrorBody("not_found", "Artifact no encontrado."), 404);
  }
  if (art.status === "EXPIRED" || !artifacts.isAvailable(artifactId)) {
    return c.json(
      httpErrorBody("artifact_expired", "Artifact expirado."),
      410,
    );
  }
  return art;
}

function buildHeaders(
  art: Artifact,
  opts: {
    contentLength: number;
    partial?: { start: number; end: number; total: number };
  },
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": sanitizeContentType(art.mimeType),
    "Content-Length": String(opts.contentLength),
    "Content-Disposition": contentDispositionAttachment(
      art.name ?? `${art.id}.bin`,
    ),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (opts.partial) {
    headers["Content-Range"] =
      `bytes ${opts.partial.start}-${opts.partial.end}/${opts.partial.total}`;
  }
  return headers;
}

export function mountArtifactHttp(app: Hono, deps: ArtifactHttpDeps): void {
  const { artifacts, hubToken } = deps;

  const headOrGet = async (c: Context, method: "HEAD" | "GET") => {
    const auth = requireArtifactAuth(c, hubToken);
    if ("denied" in auth && auth.denied) return auth.denied;

    const artifactId = c.req.param("artifactId") ?? "";
    const artOrErr = resolveArtifactForDelivery(c, artifacts, artifactId);
    if (artOrErr instanceof Response) return artOrErr;
    const art = artOrErr;

    const rangeHeader = c.req.header("Range");
    const parsed = parseBytesRange(rangeHeader, art.size);
    if (!parsed.ok) {
      if (parsed.code === "unsatisfiable") {
        return c.body(null, 416, {
          "Content-Range": `bytes */${art.size}`,
          "Accept-Ranges": "bytes",
        });
      }
      return c.json(httpErrorBody("bad_request", "Range inválido."), 400);
    }

    const isPartial =
      Boolean(rangeHeader?.trim()) &&
      !(parsed.start === 0 && parsed.end === art.size - 1);

    if (method === "HEAD") {
      const length = parsed.end - parsed.start + 1;
      const headers = buildHeaders(art, {
        contentLength: length,
        partial: isPartial
          ? { start: parsed.start, end: parsed.end, total: art.size }
          : undefined,
      });
      process.stderr.write(
        `[gateway] artifact.access method=HEAD id=${art.id} result=ok\n`,
      );
      return c.body(null, isPartial ? 206 : 200, headers);
    }

    try {
      const { read } = await artifacts.openReadStream(art.id, {
        start: parsed.start,
        end: parsed.end,
      });
      const headers = buildHeaders(art, {
        contentLength: read.size,
        partial: isPartial
          ? { start: read.start, end: read.end, total: read.totalSize }
          : undefined,
      });
      process.stderr.write(
        `[gateway] artifact.access method=GET id=${art.id} size=${read.size} result=ok\n`,
      );
      const webStream = Readable.toWeb(read.stream) as ReadableStream;
      return new Response(webStream, {
        status: isPartial ? 206 : 200,
        headers,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/expired/i.test(message)) {
        return c.json(
          httpErrorBody("artifact_expired", "Artifact expirado."),
          410,
        );
      }
      if (/no encontrado|not found|missing|no disponible/i.test(message)) {
        process.stderr.write(
          `[gateway] artifact.access method=GET id=${artifactId} result=not_found\n`,
        );
        return c.json(httpErrorBody("not_found", "Artifact no encontrado."), 404);
      }
      process.stderr.write(
        `[gateway] artifact.access method=GET id=${artifactId} result=error\n`,
      );
      return c.json(httpErrorBody("internal", "Error leyendo Artifact."), 500);
    }
  };

  app.on("HEAD", "/artifacts/:artifactId", (c) => headOrGet(c, "HEAD"));
  app.get("/artifacts/:artifactId", (c) => headOrGet(c, "GET"));

  app.delete("/artifacts/:artifactId", async (c) => {
    const auth = requireArtifactAuth(c, hubToken);
    if ("denied" in auth && auth.denied) return auth.denied;

    const artifactId = c.req.param("artifactId") ?? "";
    if (!ARTIFACT_ID_RE.test(artifactId)) {
      return c.json(httpErrorBody("bad_request", "artifactId inválido."), 400);
    }
    const art = artifacts.get(artifactId);
    if (!art || art.status === "DELETED") {
      return c.json(httpErrorBody("not_found", "Artifact no encontrado."), 404);
    }
    await artifacts.delete(artifactId);
    process.stderr.write(
      `[gateway] artifact.access method=DELETE id=${artifactId} result=ok\n`,
    );
    return c.body(null, 204);
  });
}
