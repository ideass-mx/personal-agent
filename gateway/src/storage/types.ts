/**
 * ObjectStorage — abstracción de bytes. No conoce MCP, Runtime, Android ni secretos.
 */
import type { Readable } from "node:stream";

export type StorageProviderId = "local" | "s3" | "minio" | "wasabi";

export interface ObjectReference {
  readonly provider: string;
  readonly key: string;
}

export interface ObjectMetadata {
  readonly size: number;
  readonly mimeType?: string;
  /** Opcional (HeadObject / side meta). */
  readonly etag?: string;
  readonly lastModified?: string;
}

export interface PutObjectInput {
  /** Si se omite, el storage genera una key opaca. */
  readonly key?: string;
  /**
   * Bytes en memoria XOR `stream` (uno obligatorio).
   * Preferir `stream` para payloads grandes (PHASE 61).
   */
  readonly bytes?: Uint8Array;
  /** Lectura única hacia storage; no bufferizar el objeto completo en el caller. */
  readonly stream?: import("node:stream").Readable;
  readonly mimeType?: string;
}

export interface GetObjectResult {
  readonly bytes: Uint8Array;
  readonly mimeType?: string;
}

/** Opciones de lectura por streaming (Range HTTP futuro / parcial). */
export type OpenReadStreamOptions = {
  /** Byte offset inclusivo (default 0). */
  readonly start?: number;
  /** Byte offset inclusivo (default size-1). */
  readonly end?: number;
};

export type ObjectReadStream = {
  readonly stream: Readable;
  /** Bytes que entregará este stream (tras Range). */
  readonly size: number;
  /** Tamaño total del objeto en storage. */
  readonly totalSize: number;
  readonly mimeType?: string;
  readonly start: number;
  readonly end: number;
};

export interface ObjectStorage {
  put(input: PutObjectInput): Promise<ObjectReference>;
  get(ref: ObjectReference): Promise<GetObjectResult>;
  /**
   * Lectura por stream (no carga el objeto entero en RAM).
   * Obligatorio para delivery HTTP (PHASE 58).
   */
  openReadStream(
    ref: ObjectReference,
    options?: OpenReadStreamOptions,
  ): Promise<ObjectReadStream>;
  delete(ref: ObjectReference): Promise<void>;
  exists(ref: ObjectReference): Promise<boolean>;
  metadata(ref: ObjectReference): Promise<ObjectMetadata>;
}

/** Límite por defecto para LocalObjectStorage (25 MiB). */
export const DEFAULT_MAX_OBJECT_BYTES = 25 * 1024 * 1024;

export const OBJECT_KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export function assertSafeObjectKey(key: string): string {
  const k = key.trim();
  if (!OBJECT_KEY_RE.test(k)) {
    throw new Error(`ObjectStorage: key inválida: ${JSON.stringify(key)}`);
  }
  if (k.includes("..") || k.includes("/") || k.includes("\\")) {
    throw new Error(`ObjectStorage: key con path traversal rechazada`);
  }
  return k;
}
