/**
 * Resuelve el directorio de ObjectStorage local (producto), no el workspace.
 */
import { config } from "../config.ts";

/** Usa config.objectsDir (PERSONAL_AGENT_OBJECTS_DIR o sibling de data/). */
export function resolveObjectsRoot(): string {
  return config.objectsDir;
}
