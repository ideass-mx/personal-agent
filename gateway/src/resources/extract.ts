/**
 * Extrae Resources desde NormalizedMcpResult.
 * NO persiste, NO descarga, NO crea Artifact.
 */
import { createHash } from "node:crypto";
import type { NormalizedMcpResult } from "../mcp-result/types.ts";
import type { Resource } from "./types.ts";

function resourceId(kind: string, uri: string): string {
  const h = createHash("sha256")
    .update(kind)
    .update("\0")
    .update(uri)
    .digest("hex")
    .slice(0, 32);
  return `res_${h}`;
}

function decodeBase64(blob: string): Uint8Array | undefined {
  try {
    return new Uint8Array(Buffer.from(blob, "base64"));
  } catch {
    return undefined;
  }
}

export function extractResources(result: NormalizedMcpResult): Resource[] {
  const out: Resource[] = [];
  for (const block of result.content) {
    if (block.type === "resource_link") {
      out.push({
        id: resourceId("external", block.uri),
        kind: "external",
        uri: block.uri,
        mimeType: block.mimeType,
        name: block.name,
        description: block.description,
      });
      continue;
    }
    if (block.type === "resource") {
      const r = block.resource;
      const bytes = r.blob ? decodeBase64(r.blob) : undefined;
      out.push({
        id: resourceId("embedded", r.uri),
        kind: "embedded",
        uri: r.uri,
        mimeType: r.mimeType,
        inlineText: r.text,
        inlineBytes: bytes,
      });
    }
  }
  return out;
}
