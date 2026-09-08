/**
 * HardwareDetector — perfil de máquina sin acoplar al instalador.
 */
import fs from "node:fs";
import os from "node:os";
import type { HardwareProfile } from "./types.ts";

function bytesToGb(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.round((bytes / (1024 ** 3)) * 10) / 10;
}

function freeStorageGb(cwd = process.cwd()): number {
  try {
    const st = fs.statfsSync(cwd);
    return bytesToGb(Number(st.bavail) * Number(st.bsize));
  } catch {
    return 0;
  }
}

function cpuModel(): string | undefined {
  const cpus = os.cpus();
  const model = cpus[0]?.model?.trim();
  return model || undefined;
}

/**
 * Detección portable (Node). GPU es opcional; ausencia ≠ fallo.
 * No exige NVIDIA/CUDA.
 */
export function detectHardware(
  overrides?: Partial<HardwareProfile>,
): HardwareProfile {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const cores = os.cpus().length || 1;
  const base: HardwareProfile = {
    cpu: {
      model: cpuModel(),
      architecture: os.arch(),
      cores,
      threads: cores,
    },
    memory: {
      totalGb: bytesToGb(totalMem),
      availableGb: bytesToGb(freeMem),
    },
    storage: {
      freeGb: freeStorageGb(),
    },
    os: {
      platform: os.platform(),
      version: os.release(),
      architecture: os.arch(),
    },
  };
  if (!overrides) return base;
  return {
    ...base,
    ...overrides,
    cpu: { ...base.cpu, ...overrides.cpu },
    memory: { ...base.memory, ...overrides.memory },
    storage: { ...base.storage, ...overrides.storage },
    os: { ...base.os, ...overrides.os },
    gpu: overrides.gpu ?? base.gpu,
  };
}
