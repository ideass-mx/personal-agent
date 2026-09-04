/**
 * ArtifactManager — orquesta metadata + ObjectStorage + lifecycle (PHASE 62).
 * Depende de la interfaz ObjectStorage, no de LocalObjectStorage.
 * No conoce MCP SDK, AgentRuntime, Android ni Credential Vault.
 */
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import type {
  ObjectReadStream,
  ObjectStorage,
  OpenReadStreamOptions,
} from "../storage/types.ts";
import type { Resource } from "../resources/types.ts";
import { sanitizeResourceUri } from "../resources/sanitize-uri.ts";
import type {
  Artifact,
  ArtifactProvenance,
  ArtifactReference,
} from "./types.ts";
import { toArtifactReference } from "./types.ts";
import {
  getArtifactRow,
  insertArtifactRow,
  markArtifactDeleted,
  updateArtifactStatus,
} from "./store.ts";

export type CreateArtifactFromBytesInput = {
  readonly bytes: Uint8Array;
  readonly mimeType?: string;
  readonly name?: string;
  readonly provenance?: ArtifactProvenance;
  readonly id?: string;
  readonly expiresAt?: string | null;
};

export type CreateArtifactFromStreamInput = {
  readonly stream: Readable;
  readonly mimeType?: string;
  readonly name?: string;
  readonly provenance?: ArtifactProvenance;
  readonly id?: string;
  readonly expiresAt?: string | null;
};

export type CreateArtifactFromResourceInput = {
  readonly resource: Resource;
  readonly bytes?: Uint8Array;
  readonly provenance?: ArtifactProvenance;
  readonly expiresAt?: string | null;
};

function isExpired(art: Artifact, now = Date.now()): boolean {
  if (!art.expiresAt) return false;
  const t = Date.parse(art.expiresAt);
  if (Number.isNaN(t)) return false;
  return t <= now;
}

function sanitizeProvenance(
  provenance: ArtifactProvenance | undefined,
): ArtifactProvenance | undefined {
  if (!provenance) return undefined;
  return {
    ...provenance,
    uri: sanitizeResourceUri(provenance.uri),
  };
}

export class ArtifactManager {
  constructor(private readonly storage: ObjectStorage) {}

  async createFromBytes(
    input: CreateArtifactFromBytesInput,
  ): Promise<Artifact> {
    if (!(input.bytes instanceof Uint8Array)) {
      throw new Error("ArtifactManager: bytes inválidos");
    }
    const id = (input.id?.trim() || randomUUID()).replace(/[^a-zA-Z0-9._-]/g, "");
    if (!id) throw new Error("ArtifactManager: id inválido");

    const ref = await this.storage.put({
      key: id,
      bytes: input.bytes,
      mimeType: input.mimeType,
    });

    try {
      return insertArtifactRow({
        id,
        name: input.name,
        mimeType: input.mimeType,
        size: input.bytes.byteLength,
        storageProvider: ref.provider,
        storageKey: ref.key,
        provenance: sanitizeProvenance(input.provenance),
        status: "AVAILABLE",
        expiresAt: input.expiresAt,
      });
    } catch (err) {
      try {
        await this.storage.delete(ref);
      } catch {
        /* ignore */
      }
      throw err;
    }
  }

  async createFromStream(
    input: CreateArtifactFromStreamInput,
  ): Promise<Artifact> {
    if (!input.stream) {
      throw new Error("ArtifactManager: stream inválido");
    }
    const id = (input.id?.trim() || randomUUID()).replace(/[^a-zA-Z0-9._-]/g, "");
    if (!id) throw new Error("ArtifactManager: id inválido");

    const ref = await this.storage.put({
      key: id,
      stream: input.stream,
      mimeType: input.mimeType,
    });

    try {
      const meta = await this.storage.metadata(ref);
      return insertArtifactRow({
        id,
        name: input.name,
        mimeType: input.mimeType ?? meta.mimeType,
        size: meta.size,
        storageProvider: ref.provider,
        storageKey: ref.key,
        provenance: sanitizeProvenance(input.provenance),
        status: "AVAILABLE",
        expiresAt: input.expiresAt,
      });
    } catch (err) {
      try {
        await this.storage.delete(ref);
      } catch {
        /* ignore */
      }
      throw err;
    }
  }

  async createFromResource(
    input: CreateArtifactFromResourceInput,
  ): Promise<Artifact> {
    const { resource } = input;
    let bytes = input.bytes ?? resource.inlineBytes;
    if (!bytes && resource.inlineText != null) {
      bytes = new TextEncoder().encode(resource.inlineText);
    }
    if (!bytes) {
      throw new Error(
        "ArtifactManager: resource externo/sin payload — se requieren bytes (no auto-download)",
      );
    }
    const provenance: ArtifactProvenance = input.provenance ?? {
      sourceType: "imported",
      uri: resource.uri,
    };
    return this.createFromBytes({
      bytes,
      mimeType: resource.mimeType,
      name: resource.name,
      provenance,
      id: randomUUID(),
      expiresAt: input.expiresAt,
    });
  }

  /**
   * Metadata (incluye EXPIRED/DELETED). Aplica expiración lazy.
   */
  get(id: string): Artifact | undefined {
    const art = getArtifactRow(id);
    if (!art) return undefined;
    if (art.status === "AVAILABLE" && isExpired(art)) {
      try {
        updateArtifactStatus(art.id, "EXPIRED");
      } catch {
        /* ignore */
      }
      return { ...art, status: "EXPIRED" };
    }
    return art;
  }

  /** Referencia cliente-safe; null si no AVAILABLE. */
  getReference(artifactId: string): ArtifactReference | null {
    const art = this.get(artifactId);
    if (!art || !this.isAvailable(artifactId)) return null;
    return toArtifactReference(art);
  }

  isAvailable(artifactId: string): boolean {
    const art = this.get(artifactId);
    return art?.status === "AVAILABLE";
  }

  async readBytes(id: string): Promise<Uint8Array> {
    if (!this.isAvailable(id)) {
      throw new Error(`Artifact no disponible: ${id}`);
    }
    const art = getArtifactRow(id);
    if (!art) throw new Error(`Artifact no encontrado: ${id}`);
    const obj = await this.storage.get(art.storage);
    return obj.bytes;
  }

  async openReadStream(
    id: string,
    options?: OpenReadStreamOptions,
  ): Promise<{ artifact: Artifact; read: ObjectReadStream }> {
    if (!this.isAvailable(id)) {
      const art = this.get(id);
      if (art?.status === "EXPIRED") {
        throw new Error(`Artifact expired: ${id}`);
      }
      throw new Error(`Artifact no encontrado: ${id}`);
    }
    const art = getArtifactRow(id);
    if (!art) throw new Error(`Artifact no encontrado: ${id}`);
    const exists = await this.storage.exists(art.storage);
    if (!exists) {
      throw new Error(`Artifact object missing: ${id}`);
    }
    const read = await this.storage.openReadStream(art.storage, options);
    return { artifact: art, read };
  }

  /**
   * Borra bytes en ObjectStorage y marca metadata DELETED.
   */
  async delete(id: string): Promise<void> {
    const art = getArtifactRow(id);
    if (!art) return;
    if (art.status === "DELETED") return;
    try {
      await this.storage.delete(art.storage);
    } catch {
      /* object may already be gone */
    }
    markArtifactDeleted(id);
  }
}

export function createArtifactManager(storage: ObjectStorage): ArtifactManager {
  return new ArtifactManager(storage);
}

/** Extrae ArtifactReference[] de un ToolResult sin conocer storage. */
export function artifactsFromToolResult(result: {
  ok: boolean;
  artifacts?: readonly ArtifactReference[];
}): ArtifactReference[] {
  if (!result.ok || !result.artifacts) return [];
  return [...result.artifacts];
}
