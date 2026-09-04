/**
 * LocalObjectStorage — backend por defecto (local-first).
 * No requiere red ni credenciales cloud.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
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
} from "./types.ts";
import { assertPutPayload } from "./put-payload.ts";

export type LocalObjectStorageOptions = {
  readonly rootDir: string;
  readonly providerId?: string;
  readonly maxBytes?: number;
};

type SideMeta = {
  mimeType?: string;
  size: number;
};

export class LocalObjectStorage implements ObjectStorage {
  readonly providerId: string;
  private readonly root: string;
  private readonly maxBytes: number;

  constructor(options: LocalObjectStorageOptions) {
    this.root = path.resolve(options.rootDir);
    this.providerId = options.providerId ?? "local";
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_OBJECT_BYTES;
    fs.mkdirSync(this.root, { recursive: true });
  }

  private objectDir(key: string): string {
    const safe = assertSafeObjectKey(key);
    const dir = path.join(this.root, "by-id", safe);
    const resolved = path.resolve(dir);
    const rootResolved = path.resolve(this.root);
    if (
      resolved !== rootResolved &&
      !resolved.startsWith(rootResolved + path.sep)
    ) {
      throw new Error("ObjectStorage: path fuera del root");
    }
    return resolved;
  }

  private objectPath(key: string): string {
    return path.join(this.objectDir(key), "object");
  }

  private metaPath(key: string): string {
    return path.join(this.objectDir(key), "meta.json");
  }

  async put(input: PutObjectInput): Promise<ObjectReference> {
    const payload = assertPutPayload(input);
    const key = assertSafeObjectKey(input.key?.trim() || randomUUID());
    const dir = this.objectDir(key);
    fs.mkdirSync(dir, { recursive: true });
    const file = this.objectPath(key);

    let size = 0;
    if (payload.mode === "bytes") {
      const bytes = payload.bytes!;
      if (bytes.byteLength > this.maxBytes) {
        throw new Error(
          `ObjectStorage.put: supera máximo ${this.maxBytes} bytes`,
        );
      }
      fs.writeFileSync(file, bytes);
      size = bytes.byteLength;
    } else {
      let counted = 0;
      const max = this.maxBytes;
      const counter = new Transform({
        transform(chunk, _enc, cb) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          counted += buf.byteLength;
          if (counted > max) {
            cb(new Error(`ObjectStorage.put: supera máximo ${max} bytes`));
            return;
          }
          cb(null, buf);
        },
      });
      const out = fs.createWriteStream(file);
      try {
        await pipeline(payload.stream!, counter, out);
        size = counted;
      } catch (err) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
        throw err;
      }
    }

    const meta: SideMeta = {
      size,
      mimeType: input.mimeType,
    };
    fs.writeFileSync(this.metaPath(key), JSON.stringify(meta), "utf8");
    return { provider: this.providerId, key };
  }

  async get(ref: ObjectReference): Promise<GetObjectResult> {
    this.assertProvider(ref);
    const file = this.objectPath(ref.key);
    if (!fs.existsSync(file)) {
      throw new Error(`ObjectStorage.get: no existe ${ref.key}`);
    }
    const bytes = new Uint8Array(fs.readFileSync(file));
    const meta = this.readSideMeta(ref.key);
    return { bytes, mimeType: meta?.mimeType };
  }

  async openReadStream(
    ref: ObjectReference,
    options?: OpenReadStreamOptions,
  ): Promise<ObjectReadStream> {
    this.assertProvider(ref);
    const file = this.objectPath(ref.key);
    if (!fs.existsSync(file)) {
      throw new Error(`ObjectStorage.openReadStream: no existe ${ref.key}`);
    }
    const st = fs.statSync(file);
    const totalSize = st.size;
    if (totalSize <= 0) {
      const empty = fs.createReadStream(file);
      return {
        stream: empty,
        size: 0,
        totalSize: 0,
        mimeType: this.readSideMeta(ref.key)?.mimeType,
        start: 0,
        end: -1,
      };
    }
    let start = options?.start ?? 0;
    let end = options?.end ?? totalSize - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      throw new Error("ObjectStorage.openReadStream: Range inválido");
    }
    if (start < 0 || end < start || start >= totalSize) {
      throw new RangeError("ObjectStorage.openReadStream: Range fuera de bounds");
    }
    if (end >= totalSize) end = totalSize - 1;
    const stream = fs.createReadStream(file, { start, end });
    const meta = this.readSideMeta(ref.key);
    return {
      stream,
      size: end - start + 1,
      totalSize,
      mimeType: meta?.mimeType,
      start,
      end,
    };
  }

  async delete(ref: ObjectReference): Promise<void> {
    this.assertProvider(ref);
    const dir = this.objectDir(ref.key);
    if (!fs.existsSync(dir)) return;
    fs.rmSync(dir, { recursive: true, force: true });
  }

  async exists(ref: ObjectReference): Promise<boolean> {
    this.assertProvider(ref);
    return fs.existsSync(this.objectPath(ref.key));
  }

  async metadata(ref: ObjectReference): Promise<ObjectMetadata> {
    this.assertProvider(ref);
    const file = this.objectPath(ref.key);
    if (!fs.existsSync(file)) {
      throw new Error(`ObjectStorage.metadata: no existe ${ref.key}`);
    }
    const st = fs.statSync(file);
    const meta = this.readSideMeta(ref.key);
    return { size: st.size, mimeType: meta?.mimeType };
  }

  private assertProvider(ref: ObjectReference): void {
    if (ref.provider !== this.providerId) {
      throw new Error(
        `ObjectStorage: provider mismatch ${ref.provider} !== ${this.providerId}`,
      );
    }
    assertSafeObjectKey(ref.key);
  }

  private readSideMeta(key: string): SideMeta | undefined {
    const p = this.metaPath(key);
    if (!fs.existsSync(p)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(p, "utf8")) as SideMeta;
    } catch {
      return undefined;
    }
  }
}

export function createLocalObjectStorage(
  options: LocalObjectStorageOptions,
): LocalObjectStorage {
  return new LocalObjectStorage(options);
}
