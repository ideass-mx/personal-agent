/**
 * Cliente S3 en memoria para contract/factory tests (sin red / sin cuenta AWS).
 */
import { Readable } from "node:stream";
import type {
  S3ClientLike,
  S3DeleteParams,
  S3GetParams,
  S3GetResult,
  S3HeadParams,
  S3HeadResult,
  S3PutParams,
} from "../../src/storage/s3-client-like.ts";

type Entry = {
  body: Uint8Array;
  contentType?: string;
};

export class FakeS3Client implements S3ClientLike {
  readonly objects = new Map<string, Entry>();

  private id(bucket: string, key: string): string {
    return `${bucket}::${key}`;
  }

  async putObject(params: S3PutParams): Promise<void> {
    let body: Uint8Array;
    if (params.Body instanceof Uint8Array) {
      body = Uint8Array.from(params.Body);
    } else if (Buffer.isBuffer(params.Body)) {
      body = new Uint8Array(params.Body);
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of params.Body as Readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      body = new Uint8Array(Buffer.concat(chunks));
    }
    this.objects.set(this.id(params.Bucket, params.Key), {
      body,
      contentType: params.ContentType,
    });
  }

  async getObject(params: S3GetParams): Promise<S3GetResult> {
    const entry = this.objects.get(this.id(params.Bucket, params.Key));
    if (!entry) {
      const err = new Error("NoSuchKey");
      (err as { name: string }).name = "NoSuchKey";
      throw err;
    }
    let start = 0;
    let end = entry.body.byteLength - 1;
    if (params.Range) {
      const m = /^bytes=(\d+)-(\d+)$/.exec(params.Range);
      if (!m) throw new Error("InvalidRange");
      start = Number(m[1]);
      end = Number(m[2]);
    }
    const slice = entry.body.subarray(start, end + 1);
    return {
      Body: Readable.from([Buffer.from(slice)]),
      ContentLength: slice.byteLength,
      ContentType: entry.contentType,
      ContentRange: `bytes ${start}-${end}/${entry.body.byteLength}`,
    };
  }

  async headObject(params: S3HeadParams): Promise<S3HeadResult> {
    const entry = this.objects.get(this.id(params.Bucket, params.Key));
    if (!entry) {
      const err = new Error("NotFound");
      (err as { name: string }).name = "NotFound";
      (err as unknown as { $metadata: { httpStatusCode: number } }).$metadata = {
        httpStatusCode: 404,
      };
      throw err;
    }
    return {
      ContentLength: entry.body.byteLength,
      ContentType: entry.contentType,
      ETag: `"${entry.body.byteLength}"`,
      LastModified: new Date("2026-01-01T00:00:00.000Z"),
    };
  }

  async deleteObject(params: S3DeleteParams): Promise<void> {
    this.objects.delete(this.id(params.Bucket, params.Key));
  }
}
