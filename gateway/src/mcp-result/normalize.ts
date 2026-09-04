/**
 * Normaliza estructuras tipo CallToolResult MCP sin crear Artifacts.
 */
import type {
  McpContentBlock,
  NormalizedMcpResult,
} from "./types.ts";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function normalizeBlock(raw: unknown): McpContentBlock | undefined {
  const rec = asRecord(raw);
  if (!rec || typeof rec.type !== "string") return undefined;
  switch (rec.type) {
    case "text":
      if (typeof rec.text !== "string") return undefined;
      return { type: "text", text: rec.text };
    case "image":
      if (typeof rec.data !== "string" || typeof rec.mimeType !== "string") {
        return undefined;
      }
      return { type: "image", data: rec.data, mimeType: rec.mimeType };
    case "audio":
      if (typeof rec.data !== "string" || typeof rec.mimeType !== "string") {
        return undefined;
      }
      return { type: "audio", data: rec.data, mimeType: rec.mimeType };
    case "resource_link": {
      if (typeof rec.uri !== "string" || !rec.uri.trim()) return undefined;
      return {
        type: "resource_link",
        uri: rec.uri,
        name: typeof rec.name === "string" ? rec.name : undefined,
        mimeType: typeof rec.mimeType === "string" ? rec.mimeType : undefined,
        description:
          typeof rec.description === "string" ? rec.description : undefined,
      };
    }
    case "resource": {
      const resource = asRecord(rec.resource);
      if (!resource || typeof resource.uri !== "string") return undefined;
      return {
        type: "resource",
        resource: {
          uri: resource.uri,
          mimeType:
            typeof resource.mimeType === "string" ? resource.mimeType : undefined,
          text: typeof resource.text === "string" ? resource.text : undefined,
          blob: typeof resource.blob === "string" ? resource.blob : undefined,
        },
      };
    }
    default:
      return undefined;
  }
}

/**
 * Acepta:
 * - { content, structuredContent?, isError? }
 * - array de blocks (se trata como content)
 * - string → text block
 */
export function normalizeMcpResult(raw: unknown): NormalizedMcpResult {
  if (typeof raw === "string") {
    return { content: [{ type: "text", text: raw }] };
  }
  if (Array.isArray(raw)) {
    const content = raw
      .map(normalizeBlock)
      .filter((b): b is McpContentBlock => b !== undefined);
    return { content };
  }
  const rec = asRecord(raw);
  if (!rec) {
    return {
      content: [{ type: "text", text: String(raw) }],
      isError: true,
      metadata: { normalizeError: "invalid_shape" },
    };
  }

  const contentRaw = rec.content;
  let content: McpContentBlock[] = [];
  if (Array.isArray(contentRaw)) {
    content = contentRaw
      .map(normalizeBlock)
      .filter((b): b is McpContentBlock => b !== undefined);
  } else if (typeof contentRaw === "string") {
    content = [{ type: "text", text: contentRaw }];
  }

  const structuredContent =
    "structuredContent" in rec ? rec.structuredContent : undefined;
  const isError = rec.isError === true ? true : undefined;

  let metadata: Record<string, unknown> | undefined;
  if (asRecord(rec.metadata)) {
    metadata = { ...(rec.metadata as Record<string, unknown>) };
  }

  return {
    content,
    ...(structuredContent !== undefined ? { structuredContent } : {}),
    ...(isError ? { isError: true } : {}),
    ...(metadata ? { metadata } : {}),
  };
}
