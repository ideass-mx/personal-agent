/**
 * Artifact — recurso que Personal Agent administra/persiste.
 * No almacena secretos. Bytes viven en ObjectStorage.
 */
import type { ObjectReference } from "../storage/types.ts";

export type ArtifactSourceType =
  | "mcp"
  | "native"
  | "generated"
  | "imported";

export type ArtifactStatus = "AVAILABLE" | "EXPIRED" | "DELETED";

export type ArtifactProvenance = {
  readonly sourceType: ArtifactSourceType;
  readonly serverId?: string;
  readonly toolName?: string;
  readonly uri?: string;
};

export type Artifact = {
  readonly id: string;
  readonly name?: string;
  readonly mimeType?: string;
  readonly size: number;
  readonly storage: ObjectReference;
  readonly provenance?: ArtifactProvenance;
  readonly status: ArtifactStatus;
  readonly expiresAt?: string;
  readonly createdAt: string;
  readonly updatedAt?: string;
};

/**
 * Referencia cliente — NO es ObjectReference.
 * Sin provider, key, path, bucket ni credenciales.
 */
export type ArtifactReference = {
  readonly artifactId: string;
  /** Ruta canónica relativa: /artifacts/:artifactId */
  readonly url: string;
  readonly mimeType: string;
  readonly filename?: string;
  readonly size?: number;
  readonly expiresAt?: string | null;
};

export function artifactDeliveryUrl(artifactId: string): string {
  return `/artifacts/${artifactId}`;
}

export function toArtifactReference(art: Artifact): ArtifactReference {
  return {
    artifactId: art.id,
    url: artifactDeliveryUrl(art.id),
    mimeType: art.mimeType?.trim() || "application/octet-stream",
    filename: art.name,
    size: art.size,
    expiresAt: art.expiresAt ?? null,
  };
}

export function isArtifactStatus(value: string): value is ArtifactStatus {
  return (
    value === "AVAILABLE" || value === "EXPIRED" || value === "DELETED"
  );
}
