/**
 * Catálogo local — Qwen3 en tres tamaños (CPU, Q4_K_M).
 *
 * Default de producto: Qwen3 4B Instruct 2507.
 * 1.7B / 0.6B: GGUF bartowski (comunidad), útiles en equipos modestos.
 *
 * SHA-256 = HF LFS oid del archivo Q4_K_M.
 */
import type { LocalModelCatalogEntry } from "./types.ts";

/** Modelo local por defecto del producto. */
export const DEFAULT_LOCAL_MODEL_ID = "qwen3-4b";
export const DEFAULT_LOCAL_VARIANT_ID = "q4_k_m";

/**
 * Qwen3-4B-Instruct-2507 Q4_K_M
 * https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF
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
    toolCalling: false,
    structuredOutput: false,
    vision: false,
    contextWindow: 8192,
  }),
});

/**
 * Qwen3-1.7B Q4_K_M
 * https://huggingface.co/bartowski/Qwen_Qwen3-1.7B-GGUF
 */
export const QWEN3_1_7B_ENTRY: LocalModelCatalogEntry = Object.freeze({
  id: "qwen3-1.7b",
  displayName: "Qwen3 1.7B",
  description: "Más rápido en CPU; buena opción cuando priorizas latencia.",
  tierLabel: "Rápido",
  license: "Apache-2.0 (pesos Qwen); GGUF vía bartowski",
  sourceRepo: "bartowski/Qwen_Qwen3-1.7B-GGUF",
  defaultVariantId: DEFAULT_LOCAL_VARIANT_ID,
  variants: Object.freeze([
    Object.freeze({
      id: DEFAULT_LOCAL_VARIANT_ID,
      quantization: "Q4_K_M",
      expectedBytes: 1_282_439_584,
      sha256:
        "72c5c3cb38fa32d5256e2fe30d03e7a64c6c79e668ad84057e3bd66e250b24fb",
      downloadUrl:
        "https://huggingface.co/bartowski/Qwen_Qwen3-1.7B-GGUF/resolve/main/Qwen_Qwen3-1.7B-Q4_K_M.gguf",
      estimatedMemoryGb: 2.5,
      diskGb: 1.3,
    }),
  ]),
  capabilities: Object.freeze({
    streaming: true,
    toolCalling: false,
    structuredOutput: false,
    vision: false,
    contextWindow: 8192,
  }),
});

/**
 * Qwen3-0.6B Q4_K_M
 * https://huggingface.co/bartowski/Qwen_Qwen3-0.6B-GGUF
 */
export const QWEN3_0_6B_ENTRY: LocalModelCatalogEntry = Object.freeze({
  id: "qwen3-0.6b",
  displayName: "Qwen3 0.6B",
  description: "El más ligero; útil en equipos con poca memoria.",
  tierLabel: "Ligero",
  license: "Apache-2.0 (pesos Qwen); GGUF vía bartowski",
  sourceRepo: "bartowski/Qwen_Qwen3-0.6B-GGUF",
  defaultVariantId: DEFAULT_LOCAL_VARIANT_ID,
  variants: Object.freeze([
    Object.freeze({
      id: DEFAULT_LOCAL_VARIANT_ID,
      quantization: "Q4_K_M",
      expectedBytes: 484_220_320,
      sha256:
        "9acfc1e001311f34b4252001b626f2e466d592a42065f66571bff3790d4e1b14",
      downloadUrl:
        "https://huggingface.co/bartowski/Qwen_Qwen3-0.6B-GGUF/resolve/main/Qwen_Qwen3-0.6B-Q4_K_M.gguf",
      estimatedMemoryGb: 1.2,
      diskGb: 0.5,
    }),
  ]),
  capabilities: Object.freeze({
    streaming: true,
    toolCalling: false,
    structuredOutput: false,
    vision: false,
    contextWindow: 8192,
  }),
});

const CATALOG: readonly LocalModelCatalogEntry[] = Object.freeze([
  QWEN3_4B_ENTRY,
  QWEN3_1_7B_ENTRY,
  QWEN3_0_6B_ENTRY,
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
