/**
 * Schemas de negocio para el LLM (PHASE 59 / E-29-01).
 * El wire MCP sigue usando envelope { requestId, context, input };
 * discovery sustituye el schema anunciado al modelo por estos.
 */
import type { JsonSchema } from "./types.ts";

export const BUSINESS_TOOL_INPUT_SCHEMAS: Readonly<
  Record<string, JsonSchema>
> = Object.freeze({
  "filesystem.search": {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Texto a buscar en el nombre o la ruta.",
      },
      path: {
        type: "string",
        description:
          "Carpeta raíz opcional (absoluta). Ej: C:\\\\Users\\\\Nombre. Si se omite, busca en unidades accesibles.",
      },
      fileTypes: {
        type: "array",
        items: { type: "string" },
        description: 'Extensiones (ej. ["pdf","docx","xlsx"]).',
      },
      content: {
        type: "string",
        description: "Fragmento a buscar dentro de archivos de texto.",
      },
      maxResults: { type: "integer", minimum: 1, maximum: 500 },
      maxDepth: { type: "integer", minimum: 0, maximum: 64 },
      timeoutMs: { type: "integer", minimum: 1000, maximum: 300000 },
      minSize: { type: "integer", minimum: 0 },
      maxSize: { type: "integer", minimum: 0 },
      modifiedAfter: { type: "string" },
      modifiedBefore: { type: "string" },
      includeContentSearch: { type: "boolean" },
    },
    additionalProperties: false,
  },
  "filesystem.list": {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          'Directorio absoluto. En Windows: C:\\\\Users\\\\Nombre o C:/Users/Nombre. También: Desktop, Documents, Downloads, ~.',
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
  "filesystem.read": {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Ruta absoluta del archivo a leer como texto.",
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
  "filesystem.write": {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  "filesystem.delete": {
    type: "object",
    properties: {
      path: { type: "string", description: "Archivo a eliminar (requiere confirmación)." },
    },
    required: ["path"],
    additionalProperties: false,
  },
  "process.execute": {
    type: "object",
    properties: {
      command: { type: "string" },
      args: { type: "array", items: { type: "string" } },
      cwd: { type: "string" },
      timeoutMs: { type: "integer" },
    },
    additionalProperties: false,
  },
});

/** Detecta el envelope MCP { requestId, context, input } anunciado por Node. */
export function looksLikeRemoteEnvelopeSchema(schema: unknown): boolean {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return false;
  }
  const props = (schema as { properties?: unknown }).properties;
  if (typeof props !== "object" || props === null || Array.isArray(props)) {
    return false;
  }
  const keys = Object.keys(props as Record<string, unknown>);
  return (
    keys.includes("requestId") &&
    keys.includes("context") &&
    keys.includes("input")
  );
}

export function resolveLlmInputSchema(
  toolName: string,
  discoveredSchema: unknown,
): unknown {
  const business = BUSINESS_TOOL_INPUT_SCHEMAS[toolName];
  if (business && looksLikeRemoteEnvelopeSchema(discoveredSchema)) {
    return business;
  }
  if (business && discoveredSchema === undefined) {
    return business;
  }
  return discoveredSchema;
}
