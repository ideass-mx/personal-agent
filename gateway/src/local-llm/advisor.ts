/**
 * ModelAdvisor — recomienda variante según HardwareProfile.
 */
import {
  DEFAULT_LOCAL_MODEL_ID,
  DEFAULT_LOCAL_VARIANT_ID,
  getLocalModelEntry,
  listLocalModelCatalog,
} from "./catalog.ts";
import type {
  HardwareProfile,
  ModelRecommendation,
  ModelSuitability,
} from "./types.ts";

function recommendForEntry(
  hardware: HardwareProfile,
  modelId: string,
): ModelRecommendation | null {
  const entry = getLocalModelEntry(modelId);
  if (!entry) return null;
  const variant =
    entry.variants.find((v) => v.id === entry.defaultVariantId) ??
    entry.variants[0];
  if (!variant) return null;

  const needRam = variant.estimatedMemoryGb;
  const total = hardware.memory.totalGb;
  const available = hardware.memory.availableGb;
  const freeDisk = hardware.storage.freeGb;

  let suitability: ModelSuitability = "recommended";
  let reason =
    "Buen equilibrio entre calidad y velocidad para tareas generales.";

  if (freeDisk > 0 && freeDisk < variant.diskGb + 0.5) {
    suitability = "not_recommended";
    reason =
      "No hay suficiente espacio en disco para descargar e instalar el modelo.";
  } else if (total < needRam + 1.5) {
    suitability = "not_recommended";
    reason =
      "Esta computadora tiene poca memoria para ejecutar el modelo con fluidez.";
  } else if (total < needRam + 4 || available < needRam) {
    suitability = "compatible";
    reason =
      "Puede funcionar más lentamente en esta computadora. Seguirá siendo usable.";
  } else {
    suitability = "recommended";
    reason =
      "Tu computadora está lista. Recomendamos este modelo para un buen equilibrio.";
  }

  return {
    modelId: entry.id,
    variantId: variant.id,
    quantization: variant.quantization,
    suitability,
    estimatedMemoryGb: variant.estimatedMemoryGb,
    reason,
  };
}

/** Recomendación primaria (Qwen3 4B) + lista del catálogo. */
export function adviseModels(hardware: HardwareProfile): {
  primary: ModelRecommendation;
  all: ModelRecommendation[];
} {
  const all = listLocalModelCatalog()
    .map((e) => recommendForEntry(hardware, e.id))
    .filter((r): r is ModelRecommendation => r !== null);
  const primary =
    all.find((r) => r.modelId === DEFAULT_LOCAL_MODEL_ID) ??
    all[0] ??
    ({
      modelId: DEFAULT_LOCAL_MODEL_ID,
      variantId: DEFAULT_LOCAL_VARIANT_ID,
      suitability: "compatible",
      reason: "Modelo local por defecto.",
    } satisfies ModelRecommendation);
  return { primary, all };
}

export function advisePrimaryModel(
  hardware: HardwareProfile,
): ModelRecommendation {
  return adviseModels(hardware).primary;
}
