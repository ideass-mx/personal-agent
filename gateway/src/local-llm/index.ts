/**
 * Local LLM — PHASE 61 / 61.1 (Qwen3 4B + llama-server).
 */
export type {
  HardwareProfile,
  ModelRecommendation,
  ModelCapabilities,
  LocalModelCatalogEntry,
  LocalModelStatus,
  LocalModelConfig,
  LocalRuntimeState,
} from "./types.ts";
export {
  DEFAULT_LOCAL_MODEL_ID,
  DEFAULT_LOCAL_VARIANT_ID,
  QWEN3_4B_ENTRY,
  listLocalModelCatalog,
  getLocalModelEntry,
  getLocalModelVariant,
} from "./catalog.ts";
export { detectHardware } from "./hardware.ts";
export { adviseModels, advisePrimaryModel } from "./advisor.ts";
export {
  LocalModelError,
  userMessageForCode,
  type LocalModelErrorCode,
} from "./errors.ts";
export {
  resolveProductDataRoot,
  resolveModelStorage,
  ensureModelStorageDirs,
} from "./storage.ts";
export { createLocalModelManager, type LocalModelManager } from "./manager.ts";
export {
  createDefaultLocalRuntime,
  createFakeLocalRuntime,
  createHttpLocalRuntime,
  type LocalLLMRuntime,
} from "./runtime.ts";
export { createLocalProvider } from "./provider.ts";
export {
  resolveLlmSelection,
  readLlmPreference,
  writeLlmPreference,
  isLocalLlmConfigured,
  defaultLocalPreference,
  type LlmProviderKind,
  type EffectiveLlmSelection,
} from "./selection.ts";
export {
  resolveRuntimeManifest,
  listRuntimeManifests,
  LLAMA_SERVER_RUNTIME_ID,
  LLAMA_SERVER_VERSION,
  type RuntimeManifest,
} from "./runtime-manifest.ts";
export {
  createLocalRuntimeManager,
  getLocalLlmHealthTimeoutMs,
  type LocalRuntimeManager,
  type RuntimeHealth,
  type EnsureReadyOptions,
} from "./runtime-manager.ts";
export {
  classifyRuntimeFailure,
  sanitizeRuntimeLog,
  sanitizeRuntimeMetadata,
  type RuntimeStartupTrace,
} from "./runtime-diagnostics.ts";
export {
  beginModelInstall,
  clearModelInstallProgress,
  completeModelInstall,
  failModelInstall,
  formatInstallDurationSummary,
  getModelInstallSnapshot,
  setModelInstallPhase,
  updateModelDownloadProgress,
  type ModelInstallPhase,
  type ModelInstallSnapshot,
} from "./install-progress.ts";
export {
  createManagedLlamaServerRuntime,
  createManagedLlamaServerRuntimeWithManager,
} from "./runtime-managed.ts";
export {
  installLlamaServerRuntime,
  validateInstalledRuntime,
} from "./runtime-installer.ts";
export {
  runRuntimePreflight,
  assertRuntimePreflight,
  isDllNotFoundExit,
  WIN_STATUS_DLL_NOT_FOUND,
  type RuntimePreflightResult,
} from "./runtime-preflight.ts";
export {
  ensureWindowsVc140Sidecars,
  WIN_VC140_SIDE_BY_SIDE_DLLS,
  listMissingWindowsVc140Sidecars,
} from "./runtime-sidecars.ts";
