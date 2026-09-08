/**
 * Persistencia ligera de modelos instalados + activo.
 */
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_LOCAL_MODEL_ID,
  DEFAULT_LOCAL_VARIANT_ID,
  getLocalModelEntry,
  getLocalModelVariant,
} from "./catalog.ts";
import { downloadModelFile } from "./downloader.ts";
import { LocalModelError, userMessageForCode } from "./errors.ts";
import { detectHardware } from "./hardware.ts";
import {
  ensureModelStorageDirs,
  filenameFromUrl,
  modelFilePath,
  resolveModelStorage,
  type ModelStoragePaths,
} from "./storage.ts";
import { validateModelFile } from "./validator.ts";
import type { LocalModelStatus } from "./types.ts";

type InstalledRecord = {
  modelId: string;
  variantId: string;
  path: string;
  sha256: string;
  installedAt: string;
};

type StateFile = {
  version: 1;
  active?: { modelId: string; variantId: string } | null;
  installed: InstalledRecord[];
};

function emptyState(): StateFile {
  return { version: 1, active: null, installed: [] };
}

function readState(paths: ModelStoragePaths): StateFile {
  if (!fs.existsSync(paths.stateFile)) return emptyState();
  try {
    const raw = JSON.parse(fs.readFileSync(paths.stateFile, "utf8")) as StateFile;
    if (!raw || raw.version !== 1 || !Array.isArray(raw.installed)) {
      return emptyState();
    }
    return raw;
  } catch {
    return emptyState();
  }
}

function writeState(paths: ModelStoragePaths, state: StateFile): void {
  ensureModelStorageDirs(paths);
  fs.writeFileSync(paths.stateFile, JSON.stringify(state, null, 2), "utf8");
}

export type LocalModelManager = {
  listStatus(): LocalModelStatus[];
  getActive(): { modelId: string; variantId: string; path: string } | null;
  isInstalled(modelId: string, variantId?: string): boolean;
  getModelPath(modelId: string, variantId?: string): string | null;
  setActive(modelId: string, variantId?: string): void;
  install(
    modelId?: string,
    variantId?: string,
    opts?: {
      signal?: AbortSignal;
      fetchImpl?: typeof fetch;
      onProgress?: (ratio: number) => void;
      /** Skip network; point to existing file (tests). */
      sourceFile?: string;
      skipHash?: boolean;
    },
  ): Promise<LocalModelStatus>;
  remove(modelId: string, variantId?: string): void;
};

export function createLocalModelManager(
  storage: ModelStoragePaths = resolveModelStorage(),
): LocalModelManager {
  const paths = ensureModelStorageDirs(storage);

  function listStatus(): LocalModelStatus[] {
    const state = readState(paths);
    const entry = getLocalModelEntry(DEFAULT_LOCAL_MODEL_ID)!;
    const variantId = entry.defaultVariantId;
    const rec = state.installed.find(
      (i) => i.modelId === entry.id && i.variantId === variantId,
    );
    const active =
      state.active?.modelId === entry.id &&
      state.active?.variantId === variantId;
    let modelState: LocalModelStatus["state"] = "not_installed";
    if (rec && active) modelState = "active";
    else if (rec) modelState = "installed";
    return [
      {
        modelId: entry.id,
        variantId,
        state: modelState,
        displayName: entry.displayName,
        path: rec?.path,
      },
    ];
  }

  function getActive() {
    const state = readState(paths);
    if (!state.active) {
      // Auto-activate unique installed default.
      const only = state.installed.find(
        (i) => i.modelId === DEFAULT_LOCAL_MODEL_ID,
      );
      if (only && fs.existsSync(only.path)) {
        return {
          modelId: only.modelId,
          variantId: only.variantId,
          path: only.path,
        };
      }
      return null;
    }
    const rec = state.installed.find(
      (i) =>
        i.modelId === state.active!.modelId &&
        i.variantId === state.active!.variantId,
    );
    if (!rec || !fs.existsSync(rec.path)) return null;
    return { modelId: rec.modelId, variantId: rec.variantId, path: rec.path };
  }

  function isInstalled(modelId: string, variantId?: string): boolean {
    const state = readState(paths);
    const vid =
      variantId ??
      getLocalModelEntry(modelId)?.defaultVariantId ??
      DEFAULT_LOCAL_VARIANT_ID;
    return state.installed.some(
      (i) =>
        i.modelId === modelId &&
        i.variantId === vid &&
        fs.existsSync(i.path),
    );
  }

  function getModelPath(modelId: string, variantId?: string): string | null {
    const state = readState(paths);
    const vid =
      variantId ??
      getLocalModelEntry(modelId)?.defaultVariantId ??
      DEFAULT_LOCAL_VARIANT_ID;
    const rec = state.installed.find(
      (i) => i.modelId === modelId && i.variantId === vid,
    );
    if (!rec || !fs.existsSync(rec.path)) return null;
    return rec.path;
  }

  function setActive(modelId: string, variantId?: string): void {
    const vid =
      variantId ??
      getLocalModelEntry(modelId)?.defaultVariantId ??
      DEFAULT_LOCAL_VARIANT_ID;
    if (!isInstalled(modelId, vid)) {
      throw new LocalModelError(
        "MODEL_NOT_INSTALLED",
        userMessageForCode("MODEL_NOT_INSTALLED"),
      );
    }
    const state = readState(paths);
    state.active = { modelId, variantId: vid };
    writeState(paths, state);
  }

  async function install(
    modelId = DEFAULT_LOCAL_MODEL_ID,
    variantId?: string,
    opts?: {
      signal?: AbortSignal;
      fetchImpl?: typeof fetch;
      onProgress?: (ratio: number) => void;
      sourceFile?: string;
      skipHash?: boolean;
    },
  ): Promise<LocalModelStatus> {
    const entry = getLocalModelEntry(modelId);
    if (!entry) {
      throw new LocalModelError(
        "MODEL_NOT_INSTALLED",
        userMessageForCode("MODEL_NOT_INSTALLED"),
      );
    }
    const vid = variantId ?? entry.defaultVariantId;
    const variant = getLocalModelVariant(modelId, vid);
    if (!variant) {
      throw new LocalModelError(
        "MODEL_NOT_INSTALLED",
        userMessageForCode("MODEL_NOT_INSTALLED"),
      );
    }

    const hw = detectHardware();
    if (hw.storage.freeGb > 0 && hw.storage.freeGb < variant.diskGb + 0.5) {
      throw new LocalModelError(
        "MODEL_INSUFFICIENT_STORAGE",
        userMessageForCode("MODEL_INSUFFICIENT_STORAGE"),
      );
    }

    const filename = filenameFromUrl(variant.downloadUrl);
    const dest = modelFilePath(modelId, vid, filename, paths);

    if (opts?.sourceFile) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(opts.sourceFile, dest);
    } else {
      await downloadModelFile({
        url: variant.downloadUrl,
        destPath: dest,
        expectedBytes: variant.expectedBytes,
        signal: opts?.signal,
        fetchImpl: opts?.fetchImpl,
        onProgress: (p) => {
          if (p.ratio !== undefined) opts?.onProgress?.(p.ratio);
        },
      });
    }

    if (!opts?.skipHash) {
      await validateModelFile({
        filePath: dest,
        expectedBytes: variant.expectedBytes,
        sha256: variant.sha256,
      });
    } else {
      // Tests: only check file exists + optional GGUF magic if large enough
      if (!fs.existsSync(dest)) {
        throw new LocalModelError(
          "MODEL_VALIDATION_FAILED",
          userMessageForCode("MODEL_VALIDATION_FAILED"),
        );
      }
    }

    const state = readState(paths);
    state.installed = state.installed.filter(
      (i) => !(i.modelId === modelId && i.variantId === vid),
    );
    state.installed.push({
      modelId,
      variantId: vid,
      path: dest,
      sha256: variant.sha256,
      installedAt: new Date().toISOString(),
    });
    state.active = { modelId, variantId: vid };
    writeState(paths, state);

    return {
      modelId,
      variantId: vid,
      state: "active",
      displayName: entry.displayName,
      path: dest,
    };
  }

  function remove(modelId: string, variantId?: string): void {
    const vid =
      variantId ??
      getLocalModelEntry(modelId)?.defaultVariantId ??
      DEFAULT_LOCAL_VARIANT_ID;
    const state = readState(paths);
    const rec = state.installed.find(
      (i) => i.modelId === modelId && i.variantId === vid,
    );
    if (rec) {
      try {
        fs.unlinkSync(rec.path);
      } catch {
        /* ignore */
      }
    }
    state.installed = state.installed.filter(
      (i) => !(i.modelId === modelId && i.variantId === vid),
    );
    if (
      state.active?.modelId === modelId &&
      state.active?.variantId === vid
    ) {
      state.active = null;
    }
    writeState(paths, state);
  }

  return {
    listStatus,
    getActive,
    isInstalled,
    getModelPath,
    setActive,
    install,
    remove,
  };
}
