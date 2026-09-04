/**
 * S3CompatibleObjectStorage — núcleo compartido AWS S3 / MinIO / Wasabi.
 * ArtifactManager no importa este módulo; solo ObjectStorage.
 */
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { CredentialManager } from "../credentials/types.ts";
import { ObjectStorageError, wrapStorageError } from "./errors.ts";
import type { S3ClientLike } from "./s3-client-like.ts";
import { parseS3AccessSecret } from "./s3-credentials.ts";
import {
  assertSafeObjectKey,
  DEFAULT_MAX_OBJECT_BYTES,
  type GetObjectResult,
  type ObjectMetadata,
  type ObjectReadStream,
  type ObjectReference,
  type ObjectStorage,
  type OpenReadStreamOptions,
  type PutObjectInput,
  type StorageProviderId,
} from "./types.ts";
import { assertPutPayload, readStreamLimited } from "./put-payload.ts";

export type S3CompatibleStorageOptions = {
  readonly providerId: Extract<StorageProviderId, "s3" | "minio" | "wasabi">;
  readonly bucket: string;
  readonly region: string;
  readonly endpoint?: string;
  readonly prefix?: string;
  readonly forcePathStyle?: boolean;
  readonly credentialRef: string;
  readonly credentials: CredentialManager;
  readonly maxBytes?: number;
  /** Inyectable para tests (sin red / sin SDK). */
  readonly client?: S3ClientLike;
  /** Factory lazy del cliente AWS (solo producción). */
  readonly createClient?: (creds: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  }) => Promise<S3ClientLike>;
};

function normalizePrefix(prefix: string | undefined): string {
  if (!prefix) return "";
  return prefix.replace(/^\/+|\/+$/g, "");
}

async function bodyToUint8Array(
  body: S3GetResultBody,
): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  if (body instanceof Uint8Array) return body;
  if (Buffer.isBuffer(body)) return new Uint8Array(body);
  if (body instanceof Readable || typeof (body as Readable).pipe === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return new Uint8Array(Buffer.concat(chunks));
  }
  if (Symbol.asyncIterator in Object(body)) {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return new Uint8Array(Buffer.concat(chunks));
  }
  throw new ObjectStorageError("invalid_body", "ObjectStorage.get: body inválido");
}

type S3GetResultBody = Awaited<
  ReturnType<S3ClientLike["getObject"]>
>["Body"];

function toReadable(body: S3GetResultBody): Readable {
  if (!body) return Readable.from([]);
  if (body instanceof Readable) return body;
  if (body instanceof Uint8Array || Buffer.isBuffer(body)) {
    return Readable.from([Buffer.from(body)]);
  }
  if (Symbol.asyncIterator in Object(body)) {
    return Readable.from(body as AsyncIterable<Uint8Array>);
  }
  throw new ObjectStorageError(
    "invalid_body",
    "ObjectStorage.openReadStream: body no es stream",
  );
}

export class S3CompatibleObjectStorage implements ObjectStorage {
  readonly providerId: Extract<StorageProviderId, "s3" | "minio" | "wasabi">;
  private readonly bucket: string;
  private readonly prefix: string;
  private readonly credentialRef: string;
  private readonly credentials: CredentialManager;
  private readonly maxBytes: number;
  private readonly injectedClient?: S3ClientLike;
  private readonly createClient?: S3CompatibleStorageOptions["createClient"];
  private cachedClient: S3ClientLike | null = null;

  constructor(options: S3CompatibleStorageOptions) {
    if (!options.bucket.trim()) {
      throw new ObjectStorageError("config", "ObjectStorage: bucket obligatorio");
    }
    if (!options.credentialRef.trim() && !options.client) {
      throw new ObjectStorageError(
        "config",
        "ObjectStorage: credentialRef obligatorio",
      );
    }
    this.providerId = options.providerId;
    this.bucket = options.bucket.trim();
    this.prefix = normalizePrefix(options.prefix);
    this.credentialRef = options.credentialRef.trim();
    this.credentials = options.credentials;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_OBJECT_BYTES;
    this.injectedClient = options.client;
    this.createClient = options.createClient;
  }

  private objectKey(logicalKey: string): string {
    const safe = assertSafeObjectKey(logicalKey);
    return this.prefix ? `${this.prefix}/${safe}` : safe;
  }

  private assertProvider(ref: ObjectReference): void {
    if (ref.provider !== this.providerId) {
      throw new ObjectStorageError(
        "provider_mismatch",
        `ObjectStorage: provider mismatch ${ref.provider} !== ${this.providerId}`,
      );
    }
    assertSafeObjectKey(ref.key);
  }

  private async client(): Promise<S3ClientLike> {
    if (this.injectedClient) return this.injectedClient;
    if (this.cachedClient) return this.cachedClient;
    if (!this.createClient) {
      throw new ObjectStorageError(
        "config",
        "ObjectStorage: sin cliente S3 configurado",
      );
    }
    const secret = await this.credentials.getSecret(this.credentialRef, {
      integrationId: "object-storage",
      reason: "s3_client",
    });
    if (!secret) {
      throw new ObjectStorageError(
        "credentials",
        "ObjectStorage: credencial no disponible",
      );
    }
    const parsed = parseS3AccessSecret(secret);
    this.cachedClient = await this.createClient({
      accessKeyId: parsed.accessKeyId,
      secretAccessKey: parsed.secretAccessKey,
      sessionToken: parsed.sessionToken,
    });
    return this.cachedClient;
  }

  async put(input: PutObjectInput): Promise<ObjectReference> {
    const payload = assertPutPayload(input);
    const key = assertSafeObjectKey(input.key?.trim() || randomUUID());
    try {
      let body: Uint8Array;
      if (payload.mode === "bytes") {
        body = payload.bytes!;
        if (body.byteLength > this.maxBytes) {
          throw new ObjectStorageError(
            "too_large",
            `ObjectStorage.put: supera máximo ${this.maxBytes} bytes`,
          );
        }
      } else {
        // Límite duro vía conteo de stream (no Buffer ilimitado).
        body = await readStreamLimited(payload.stream!, this.maxBytes);
      }
      const c = await this.client();
      await c.putObject({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        Body: body,
        ContentType: input.mimeType,
      });
    } catch (err) {
      if (err instanceof ObjectStorageError) throw err;
      throw wrapStorageError("put_failed", err, "ObjectStorage.put falló");
    }
    return { provider: this.providerId, key };
  }

  async get(ref: ObjectReference): Promise<GetObjectResult> {
    this.assertProvider(ref);
    try {
      const c = await this.client();
      const out = await c.getObject({
        Bucket: this.bucket,
        Key: this.objectKey(ref.key),
      });
      const bytes = await bodyToUint8Array(out.Body);
      return { bytes, mimeType: out.ContentType };
    } catch (err) {
      if (err instanceof ObjectStorageError) throw err;
      if (err instanceof RangeError) throw err;
      throw wrapStorageError("not_found", err, `ObjectStorage.get: no existe ${ref.key}`);
    }
  }

  async openReadStream(
    ref: ObjectReference,
    options?: OpenReadStreamOptions,
  ): Promise<ObjectReadStream> {
    this.assertProvider(ref);
    const head = await this.metadata(ref);
    const totalSize = head.size;
    if (totalSize <= 0) {
      return {
        stream: Readable.from([]),
        size: 0,
        totalSize: 0,
        mimeType: head.mimeType,
        start: 0,
        end: -1,
      };
    }
    let start = options?.start ?? 0;
    let end = options?.end ?? totalSize - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      throw new ObjectStorageError("range", "ObjectStorage.openReadStream: Range inválido");
    }
    if (start < 0 || end < start || start >= totalSize) {
      throw new RangeError("ObjectStorage.openReadStream: Range fuera de bounds");
    }
    if (end >= totalSize) end = totalSize - 1;
    try {
      const c = await this.client();
      const out = await c.getObject({
        Bucket: this.bucket,
        Key: this.objectKey(ref.key),
        Range: `bytes=${start}-${end}`,
      });
      return {
        stream: toReadable(out.Body),
        size: end - start + 1,
        totalSize,
        mimeType: out.ContentType ?? head.mimeType,
        start,
        end,
      };
    } catch (err) {
      if (err instanceof ObjectStorageError || err instanceof RangeError) throw err;
      throw wrapStorageError(
        "stream_failed",
        err,
        "ObjectStorage.openReadStream falló",
      );
    }
  }

  async delete(ref: ObjectReference): Promise<void> {
    this.assertProvider(ref);
    try {
      const c = await this.client();
      await c.deleteObject({
        Bucket: this.bucket,
        Key: this.objectKey(ref.key),
      });
    } catch (err) {
      // Idempotente: objeto ausente no es error fatal.
      if (isNotFound(err)) return;
      throw wrapStorageError("delete_failed", err, "ObjectStorage.delete falló");
    }
  }

  async exists(ref: ObjectReference): Promise<boolean> {
    this.assertProvider(ref);
    try {
      await this.metadata(ref);
      return true;
    } catch {
      return false;
    }
  }

  async metadata(ref: ObjectReference): Promise<ObjectMetadata> {
    this.assertProvider(ref);
    try {
      const c = await this.client();
      const out = await c.headObject({
        Bucket: this.bucket,
        Key: this.objectKey(ref.key),
      });
      const size = out.ContentLength ?? 0;
      return {
        size,
        mimeType: out.ContentType,
        etag: out.ETag,
        lastModified: out.LastModified?.toISOString(),
      };
    } catch (err) {
      throw wrapStorageError(
        "not_found",
        err,
        `ObjectStorage.metadata: no existe ${ref.key}`,
      );
    }
  }
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  if (e.name === "NotFound" || e.name === "NoSuchKey") return true;
  if (e.$metadata?.httpStatusCode === 404) return true;
  return false;
}
