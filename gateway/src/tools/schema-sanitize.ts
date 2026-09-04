/**
 * Sanitiza inputSchema de MCP tools/list para el LLM.
 * No ejecuta código; solo clona un subconjunto acotado de JSON Schema.
 */
import type { JsonSchema } from "./types.ts";

/** Fallback seguro cuando falta o no se puede sanear el schema. */
export const GENERIC_INPUT_SCHEMA: JsonSchema = Object.freeze({
  type: "object",
  additionalProperties: true,
});

/** Marca explícita en el schema cuando se usó el fallback. */
export const SCHEMA_FALLBACK_KEY = "x-mxideass-schemaFallback";

const MAX_DEPTH = 8;
const MAX_KEYS_PER_OBJECT = 64;
const MAX_ENUM = 64;
const MAX_ARRAY_ITEMS_META = 32;
const MAX_STRING_LEN = 2_048;
const MAX_TOTAL_KEYS = 256;

const ALLOWED_KEYS = new Set([
  "type",
  "description",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "default",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "uniqueItems",
  "pattern",
  "format",
  "title",
  "anyOf",
  "oneOf",
  "allOf",
  "$comment",
]);

export type SanitizeInputSchemaResult = {
  schema: JsonSchema;
  /** true si se usó GENERIC_INPUT_SCHEMA (falta o inválido). */
  usedFallback: boolean;
  reason?: string;
};

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LEN) return value;
  return value.slice(0, MAX_STRING_LEN);
}

function sanitizeValue(
  value: unknown,
  depth: number,
  counter: { keys: number },
): unknown {
  if (depth > MAX_DEPTH) return undefined;
  if (value === null) return null;
  const t = typeof value;
  if (t === "boolean" || t === "number") {
    if (t === "number" && !Number.isFinite(value)) return undefined;
    return value;
  }
  if (t === "string") return truncateString(value as string);
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (let i = 0; i < value.length && i < MAX_ARRAY_ITEMS_META; i++) {
      const item = sanitizeValue(value[i], depth + 1, counter);
      if (item !== undefined) out.push(item);
    }
    return out;
  }
  if (t !== "object") return undefined;

  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (keys.length > MAX_KEYS_PER_OBJECT) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (!ALLOWED_KEYS.has(key) && !key.startsWith("x-")) continue;
    if (counter.keys >= MAX_TOTAL_KEYS) break;
    counter.keys += 1;
    const child = rec[key];
    if (key === "enum" && Array.isArray(child)) {
      out.enum = child
        .slice(0, MAX_ENUM)
        .map((v) => sanitizeValue(v, depth + 1, counter))
        .filter((v) => v !== undefined);
      continue;
    }
    if (key === "required" && Array.isArray(child)) {
      out.required = child
        .filter((v): v is string => typeof v === "string")
        .slice(0, MAX_KEYS_PER_OBJECT)
        .map(truncateString);
      continue;
    }
    if (key === "properties" && typeof child === "object" && child !== null) {
      const props = child as Record<string, unknown>;
      const propKeys = Object.keys(props).slice(0, MAX_KEYS_PER_OBJECT);
      const cleaned: Record<string, unknown> = {};
      for (const pk of propKeys) {
        if (typeof pk !== "string" || !pk.trim()) continue;
        const pv = sanitizeValue(props[pk], depth + 1, counter);
        if (pv !== undefined && typeof pv === "object" && pv !== null) {
          cleaned[truncateString(pk)] = pv;
        }
      }
      out.properties = cleaned;
      continue;
    }
    if (
      (key === "anyOf" || key === "oneOf" || key === "allOf") &&
      Array.isArray(child)
    ) {
      out[key] = child
        .slice(0, 8)
        .map((v) => sanitizeValue(v, depth + 1, counter))
        .filter((v) => v !== undefined);
      continue;
    }
    const cleaned = sanitizeValue(child, depth + 1, counter);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  return out;
}

/**
 * Valida y acota un inputSchema MCP.
 * Si falta o no es un objeto schema usable → fallback genérico marcado.
 */
export function sanitizeDiscoveredInputSchema(
  schema: unknown,
): SanitizeInputSchemaResult {
  if (schema === undefined || schema === null) {
    return {
      schema: {
        ...GENERIC_INPUT_SCHEMA,
        [SCHEMA_FALLBACK_KEY]: true,
      },
      usedFallback: true,
      reason: "missing",
    };
  }
  if (typeof schema !== "object" || Array.isArray(schema)) {
    return {
      schema: {
        ...GENERIC_INPUT_SCHEMA,
        [SCHEMA_FALLBACK_KEY]: true,
      },
      usedFallback: true,
      reason: "invalid_type",
    };
  }

  const counter = { keys: 0 };
  const cleaned = sanitizeValue(schema, 0, counter);
  if (
    cleaned === undefined ||
    typeof cleaned !== "object" ||
    cleaned === null ||
    Array.isArray(cleaned)
  ) {
    return {
      schema: {
        ...GENERIC_INPUT_SCHEMA,
        [SCHEMA_FALLBACK_KEY]: true,
      },
      usedFallback: true,
      reason: "sanitize_failed",
    };
  }

  const obj = cleaned as JsonSchema;
  // Exigir al menos type object o properties para ser útil al LLM.
  const type = obj.type;
  const hasProps =
    typeof obj.properties === "object" && obj.properties !== null;
  if (type !== undefined && type !== "object" && !hasProps) {
    // Permitir schemas no-object si están bien formados (raro en tools).
    return { schema: obj, usedFallback: false };
  }
  if (type === undefined && !hasProps && obj.additionalProperties === undefined) {
    return {
      schema: {
        ...GENERIC_INPUT_SCHEMA,
        [SCHEMA_FALLBACK_KEY]: true,
      },
      usedFallback: true,
      reason: "empty_schema",
    };
  }

  return { schema: obj, usedFallback: false };
}

export function isSchemaFallback(schema: JsonSchema): boolean {
  return schema[SCHEMA_FALLBACK_KEY] === true;
}
