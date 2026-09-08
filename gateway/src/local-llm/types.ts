/**
 * Tipos de Local LLM (PHASE 61).
 * Sin secretos; sin detalles de GGUF/threads en la UX.
 */

export type HardwareProfile = {
  cpu: {
    model?: string;
    architecture: string;
    cores: number;
    threads?: number;
  };
  memory: {
    totalGb: number;
    availableGb: number;
  };
  gpu?: {
    vendor?: string;
    model?: string;
    vramGb?: number;
  };
  storage: {
    freeGb: number;
  };
  os: {
    platform: string;
    version?: string;
    architecture: string;
  };
};

export type ModelSuitability =
  | "recommended"
  | "compatible"
  | "not_recommended";

export type ModelRecommendation = {
  modelId: string;
  variantId: string;
  quantization?: string;
  suitability: ModelSuitability;
  estimatedMemoryGb?: number;
  reason: string;
};

export type ModelCapabilities = {
  streaming: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  vision: boolean;
  contextWindow: number;
};

export type LocalModelVariant = {
  id: string;
  /** Cuantización interna (no mostrar en UX primaria). */
  quantization: string;
  /** Bytes esperados del archivo GGUF. */
  expectedBytes: number;
  /** SHA-256 hex del archivo (HF LFS oid). */
  sha256: string;
  /** URL HTTPS oficial/licenciada documentada. */
  downloadUrl: string;
  /** RAM estimada en ejecución CPU (GB). */
  estimatedMemoryGb: number;
  /** Espacio en disco requerido (GB). */
  diskGb: number;
};

export type LocalModelCatalogEntry = {
  id: string;
  displayName: string;
  description: string;
  /** Etiqueta corta UI: Equilibrado, etc. */
  tierLabel: string;
  license: string;
  sourceRepo: string;
  defaultVariantId: string;
  variants: readonly LocalModelVariant[];
  capabilities: ModelCapabilities;
};

export type LocalModelInstallState =
  | "not_installed"
  | "downloading"
  | "validating"
  | "installed"
  | "active"
  | "failed"
  | "insufficient_storage";

export type LocalModelStatus = {
  modelId: string;
  variantId: string;
  state: LocalModelInstallState;
  displayName: string;
  progress?: number;
  errorCode?: string;
  errorMessage?: string;
  path?: string;
};

export type LocalRuntimeState =
  | "COLD"
  | "STARTING"
  | "READY"
  | "BUSY"
  | "IDLE"
  | "STOPPING"
  | "STOPPED"
  | "CRASHED"
  | "FAILED";

export type LocalModelConfig = {
  provider: "local";
  modelId: string;
  variantId: string;
  runtime: string;
  contextLength?: number;
  threads?: number;
};

export type LocalGenerationRequest = {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens?: number;
  signal?: AbortSignal;
};

export type LocalGenerationEvent =
  | { type: "text_delta"; text: string }
  | { type: "done" };
