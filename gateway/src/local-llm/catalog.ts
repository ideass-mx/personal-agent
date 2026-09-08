/**
 * Catálogo local mínimo — PHASE 61.
 * Solo Qwen3 4B (Instruct 2507) GGUF Q4_K_M para CPU.
 *
 * Fuente del peso: Qwen/Qwen3-4B-Instruct-2507 (Apache-2.0).
 * Empaquetado GGUF: bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF (comunidad,
 * compatible llama.cpp). SHA-256 = HF LFS oid del archivo Q4_K_M.
 */
import type { LocalModelCatalogEntry } from "./types.ts";

/** Modelo local por defecto del producto. */
export const DEFAULT_LOCAL_MODEL_ID = "qwen3-4b";
export const DEFAULT_LOCAL_VARIANT_ID = "q4_k_m";

/**
 * Qwen3-4B-Instruct-2507 Q4_K_M
 * https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF
 * File: Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf (~2.33 GiB)
 */
export const QWEN3_4B_ENTRY: LocalModelCatalogEntry = Object.freeze({
  id: DEFAULT_LOCAL_MODEL_ID,
  displayName: "Qwen3 4B",
  description:
    "Buen equilibrio entre calidad y velocidad para tareas generales en CPU.",
  tierLabel: "Equilibrado",
  license: "Apache-2.0 (pesos Qwen); GGUF vía bartowski",
  sourceRepo: "bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF",
  defaultVariantId: DEFAULT_LOCAL_VARIANT_ID,
  variants: Object.freeze([
    Object.freeze({
      id: DEFAULT_LOCAL_VARIANT_ID,
      quantization: "Q4_K_M",
      expectedBytes: 2_497_280_736,
      sha256:
        "2fde00ce69dd4899c70d020845e2638353015bba0fdf161b3eb965f2bca4464e",
      downloadUrl:
        "https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen_Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
      estimatedMemoryGb: 4.5,
      diskGb: 2.5,
    }),
  ]),
  capabilities: Object.freeze({
    streaming: true,
    // PHASE 61: no afirmar tool calling fiable aún (validar experimentalmente).
    toolCalling: false,
    structuredOutput: false,
    vision: false,
    contextWindow: 8192,
  }),
});

const CATALOG: readonly LocalModelCatalogEntry[] = Object.freeze([
  QWEN3_4B_ENTRY,
]);

export function listLocalModelCatalog(): LocalModelCatalogEntry[] {
  return CATALOG.map((e) => ({
    ...e,
    variants: [...e.variants],
    capabilities: { ...e.capabilities },
  }));
}

export function getLocalModelEntry(
  modelId: string,
): LocalModelCatalogEntry | null {
  const found = CATALOG.find((e) => e.id === modelId);
  return found
    ? {
        ...found,
        variants: [...found.variants],
        capabilities: { ...found.capabilities },
      }
    : null;
}

export function getLocalModelVariant(
  modelId: string,
  variantId: string,
): import("./types.ts").LocalModelVariant | null {
  const entry = getLocalModelEntry(modelId);
  if (!entry) return null;
  return entry.variants.find((v) => v.id === variantId) ?? null;
}
