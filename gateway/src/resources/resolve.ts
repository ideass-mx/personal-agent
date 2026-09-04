/**
 * ResourceResolver — resolve(resource, policy) sin auto-persist ni auto-download.
 * Persistencia solo vía ArtifactManager → ObjectStorage.
 */
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import type { ArtifactManager } from "../artifacts/manager.ts";
import type { Artifact, ArtifactProvenance } from "../artifacts/types.ts";
import { toArtifactReference } from "../artifacts/types.ts";
import { redactForLog } from "../credentials/credential-redactor.ts";
import {
  mergeResourceResolutionPolicy,
  type ResourceResolutionPolicy,
} from "./policy.ts";
import { sanitizeResourceUri } from "./sanitize-uri.ts";
import { assertUrlSafeForFetch } from "./ssrf.ts";
import type { Resource } from "./types.ts";

export type ResolutionStatus =
  | "resolved"
  | "deferred"
  | "unsupported"
  | "blocked"
  | "failed";

export type ResourceResolutionResult = {
  readonly status: ResolutionStatus;
  readonly resource: Resource;
  readonly reason?: string;
  readonly declaredMimeType?: string;
  readonly detectedMimeType?: string;
  readonly bytes?: Uint8Array;
  readonly text?: string;
  readonly artifact?: Artifact;
  /** Cliente-safe; solo si persist produjo Artifact AVAILABLE. */
  readonly artifactReference?: import("../artifacts/types.ts").ArtifactReference;
  readonly externalReference?: {
    readonly uri: string;
    readonly mimeType?: string;
    readonly name?: string;
  };
};

export type ResourceResolverDeps = {
  readonly artifacts?: ArtifactManager;
  readonly fetchImpl?: typeof fetch;
};

function mimeAllowed(
  mime: string | undefined,
  policy: ResourceResolutionPolicy,
): { ok: true } | { ok: false; reason: string } {
  if (!mime) return { ok: true };
  const normalized = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (policy.blockedMimeTypes?.some((m) => m.toLowerCase() === normalized)) {
    return { ok: false, reason: `MIME bloqueado: ${normalized}` };
  }
  if (
    policy.allowedMimeTypes &&
    policy.allowedMimeTypes.length > 0 &&
    !policy.allowedMimeTypes.some((m) => m.toLowerCase() === normalized)
  ) {
    return { ok: false, reason: `MIME no permitido: ${normalized}` };
  }
  return { ok: true };
}

function embeddedBytes(resource: Resource): Uint8Array | undefined {
  if (resource.inlineBytes) return resource.inlineBytes;
  if (resource.inlineText != null) {
    return new TextEncoder().encode(resource.inlineText);
  }
  return undefined;
}

function provenanceFor(resource: Resource): ArtifactProvenance {
  return {
    sourceType: "imported",
    uri: sanitizeResourceUri(resource.uri),
  };
}

async function persistBytes(
  deps: ResourceResolverDeps,
  resource: Resource,
  bytes: Uint8Array,
  mimeType: string | undefined,
): Promise<Artifact> {
  if (!deps.artifacts) {
    throw new Error("ResourceResolver: ArtifactManager requerido para persist");
  }
  return deps.artifacts.createFromBytes({
    bytes,
    mimeType,
    name: resource.name,
    provenance: provenanceFor(resource),
  });
}

async function persistStream(
  deps: ResourceResolverDeps,
  resource: Resource,
  stream: Readable,
  mimeType: string | undefined,
): Promise<Artifact> {
  if (!deps.artifacts) {
    throw new Error("ResourceResolver: ArtifactManager requerido para persist");
  }
  return deps.artifacts.createFromStream({
    stream,
    mimeType,
    name: resource.name,
    provenance: provenanceFor(resource),
  });
}

function resolveFilePath(
  uri: string,
  root: string,
): { ok: true; path: string } | { ok: false; reason: string } {
  let pathname: string;
  try {
    const u = new URL(uri);
    if (u.protocol !== "file:") {
      return { ok: false, reason: "no es file://" };
    }
    pathname = decodeURIComponent(u.pathname);
    if (/^\/[A-Za-z]:\//.test(pathname)) {
      pathname = pathname.slice(1);
    }
  } catch {
    return { ok: false, reason: "file URI inválida" };
  }
  const rootResolved = path.resolve(root);
  const target = path.resolve(pathname);
  if (
    target !== rootResolved &&
    !target.startsWith(rootResolved + path.sep)
  ) {
    return { ok: false, reason: "file fuera de filesystemRoot" };
  }
  return { ok: true, path: target };
}

function limitReadable(stream: Readable, maxBytes: number): Readable {
  let counted = 0;
  return stream.pipe(
    new Transform({
      transform(chunk, _enc, cb) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        counted += buf.byteLength;
        if (counted > maxBytes) {
          cb(new Error(`supera maxBytes (${maxBytes})`));
          return;
        }
        cb(null, buf);
      },
    }),
  );
}

/**
 * Fetch con redirects manuales y revalidación SSRF en cada hop.
 */
export async function fetchWithSsrfGuards(
  initialUrl: string,
  policy: ResourceResolutionPolicy,
  fetchImpl: typeof fetch,
): Promise<
  | { ok: true; response: Response; finalUrl: string }
  | { ok: false; status: ResolutionStatus; reason: string }
> {
  let current = initialUrl;
  for (let hop = 0; hop <= policy.maxRedirects; hop++) {
    const safe = await assertUrlSafeForFetch(current);
    if (!safe.ok) {
      return { ok: false, status: "blocked", reason: safe.reason };
    }
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return { ok: false, status: "failed", reason: "URL inválida" };
    }
    const scheme = parsed.protocol.replace(":", "").toLowerCase();
    if (scheme === "http" && !policy.allowHttp) {
      return { ok: false, status: "blocked", reason: "http no permitido" };
    }
    if (scheme === "https" && !policy.allowHttps) {
      return { ok: false, status: "blocked", reason: "https no permitido" };
    }
    if (!policy.allowExternal) {
      return { ok: false, status: "blocked", reason: "allowExternal=false" };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), policy.timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        signal: ctrl.signal,
        headers: { Accept: "*/*" },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, status: "failed", reason: redactForLog(msg) };
    } finally {
      clearTimeout(timer);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const loc = response.headers.get("location");
      if (!loc) {
        return { ok: false, status: "failed", reason: "redirect sin Location" };
      }
      if (hop >= policy.maxRedirects) {
        return { ok: false, status: "blocked", reason: "demasiados redirects" };
      }
      current = new URL(loc, current).toString();
      continue;
    }

    if (!response.ok) {
      return {
        ok: false,
        status: "failed",
        reason: `HTTP ${response.status}`,
      };
    }
    return { ok: true, response, finalUrl: current };
  }
  return { ok: false, status: "blocked", reason: "demasiados redirects" };
}

export class ResourceResolver {
  constructor(private readonly deps: ResourceResolverDeps = {}) {}

  async resolve(
    resource: Resource,
    policyOverrides?: Partial<ResourceResolutionPolicy>,
  ): Promise<ResourceResolutionResult> {
    const policy = mergeResourceResolutionPolicy(policyOverrides);
    const declaredMimeType = resource.mimeType;
    const mimeCheck = mimeAllowed(declaredMimeType, policy);
    if (!mimeCheck.ok) {
      return {
        status: "blocked",
        resource,
        reason: mimeCheck.reason,
        declaredMimeType,
      };
    }

    const hasEmbedded = Boolean(embeddedBytes(resource));
    if (resource.kind === "embedded" || hasEmbedded) {
      const bytes = embeddedBytes(resource);
      if (!bytes) {
        return {
          status: "failed",
          resource,
          reason: "embedded sin payload",
          declaredMimeType,
        };
      }
      if (bytes.byteLength > policy.maxBytes) {
        return {
          status: "blocked",
          resource,
          reason: `supera maxBytes (${policy.maxBytes})`,
          declaredMimeType,
        };
      }
      if (!policy.persist) {
        return {
          status: "resolved",
          resource,
          declaredMimeType,
          detectedMimeType: declaredMimeType,
          bytes,
          text: resource.inlineText,
        };
      }
      try {
        const artifact = await persistBytes(
          this.deps,
          resource,
          bytes,
          declaredMimeType,
        );
        return {
          status: "resolved",
          resource,
          declaredMimeType,
          detectedMimeType: declaredMimeType,
          artifact,
          artifactReference: toArtifactReference(artifact),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          status: "failed",
          resource,
          reason: redactForLog(msg),
          declaredMimeType,
        };
      }
    }

    const uri = resource.uri?.trim();
    if (!uri) {
      return {
        status: "unsupported",
        resource,
        reason: "Resource sin URI ni payload",
        declaredMimeType,
      };
    }

    let scheme: string;
    try {
      scheme = new URL(uri).protocol.replace(":", "").toLowerCase();
    } catch {
      return {
        status: "unsupported",
        resource,
        reason: "URI inválida",
        declaredMimeType,
      };
    }

    if (!policy.persist && (scheme === "http" || scheme === "https")) {
      return {
        status: "deferred",
        resource,
        declaredMimeType,
        externalReference: {
          uri: sanitizeResourceUri(uri) ?? uri,
          mimeType: declaredMimeType,
          name: resource.name,
        },
      };
    }

    if (scheme === "file") {
      if (!policy.allowFile) {
        return {
          status: "blocked",
          resource,
          reason: "allowFile=false",
          declaredMimeType,
        };
      }
      if (!policy.filesystemRoot) {
        return {
          status: "blocked",
          resource,
          reason: "filesystemRoot requerido",
          declaredMimeType,
        };
      }
      const resolved = resolveFilePath(uri, policy.filesystemRoot);
      if (!resolved.ok) {
        return {
          status: "blocked",
          resource,
          reason: resolved.reason,
          declaredMimeType,
        };
      }
      try {
        const st = fs.statSync(resolved.path);
        if (!st.isFile()) {
          return {
            status: "blocked",
            resource,
            reason: "no es archivo",
            declaredMimeType,
          };
        }
        if (st.size > policy.maxBytes) {
          return {
            status: "blocked",
            resource,
            reason: `supera maxBytes (${policy.maxBytes})`,
            declaredMimeType,
          };
        }
        if (!policy.persist) {
          const bytes = new Uint8Array(fs.readFileSync(resolved.path));
          return {
            status: "resolved",
            resource,
            declaredMimeType,
            detectedMimeType: declaredMimeType,
            bytes,
          };
        }
        const stream = fs.createReadStream(resolved.path);
        const artifact = await persistStream(
          this.deps,
          resource,
          stream,
          declaredMimeType,
        );
        return {
          status: "resolved",
          resource,
          declaredMimeType,
          detectedMimeType: declaredMimeType,
          artifact,
          artifactReference: toArtifactReference(artifact),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          status: "failed",
          resource,
          reason: redactForLog(msg),
          declaredMimeType,
        };
      }
    }

    if (scheme === "http" || scheme === "https") {
      if (!policy.allowExternal) {
        return {
          status: "blocked",
          resource,
          reason: "allowExternal=false",
          declaredMimeType,
        };
      }
      if (scheme === "http" && !policy.allowHttp) {
        return {
          status: "blocked",
          resource,
          reason: "allowHttp=false",
          declaredMimeType,
        };
      }
      if (scheme === "https" && !policy.allowHttps) {
        return {
          status: "blocked",
          resource,
          reason: "allowHttps=false",
          declaredMimeType,
        };
      }

      const fetchImpl = this.deps.fetchImpl ?? globalThis.fetch;
      const fetched = await fetchWithSsrfGuards(uri, policy, fetchImpl);
      if (!fetched.ok) {
        return {
          status: fetched.status,
          resource,
          reason: fetched.reason,
          declaredMimeType,
        };
      }

      const headerLen = fetched.response.headers.get("content-length");
      if (headerLen) {
        const n = Number(headerLen);
        if (Number.isFinite(n) && n > policy.maxBytes) {
          return {
            status: "blocked",
            resource,
            reason: `Content-Length supera maxBytes (${policy.maxBytes})`,
            declaredMimeType,
          };
        }
      }

      const contentType =
        fetched.response.headers.get("content-type")?.split(";")[0]?.trim() ||
        declaredMimeType;
      const ctCheck = mimeAllowed(contentType, policy);
      if (!ctCheck.ok) {
        return {
          status: "blocked",
          resource,
          reason: ctCheck.reason,
          declaredMimeType,
          detectedMimeType: contentType,
        };
      }

      if (!fetched.response.body) {
        return {
          status: "failed",
          resource,
          reason: "respuesta sin body",
          declaredMimeType,
        };
      }

      const nodeStream = Readable.fromWeb(
        fetched.response.body as import("node:stream/web").ReadableStream,
      );
      const limited = limitReadable(nodeStream, policy.maxBytes);
      try {
        const artifact = await persistStream(
          this.deps,
          {
            ...resource,
            uri: sanitizeResourceUri(fetched.finalUrl) ?? resource.uri,
          },
          limited,
          contentType,
        );
        return {
          status: "resolved",
          resource,
          declaredMimeType,
          detectedMimeType: contentType,
          artifact,
          artifactReference: toArtifactReference(artifact),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const blocked = /supera max/i.test(msg);
        return {
          status: blocked ? "blocked" : "failed",
          resource,
          reason: redactForLog(msg),
          declaredMimeType,
          detectedMimeType: contentType,
        };
      }
    }

    // resource_link / external without http(s) scheme
    if (resource.kind === "external" && !policy.persist) {
      return {
        status: "deferred",
        resource,
        declaredMimeType,
        externalReference: {
          uri: sanitizeResourceUri(uri) ?? uri,
          mimeType: declaredMimeType,
          name: resource.name,
        },
      };
    }

    return {
      status: "unsupported",
      resource,
      reason: `scheme no soportado: ${scheme}`,
      declaredMimeType,
    };
  }
}

export function createResourceResolver(
  deps?: ResourceResolverDeps,
): ResourceResolver {
  return new ResourceResolver(deps);
}
