/**
 * Cliente S3 mínimo inyectable (producción = AWS SDK; tests = fake).
 */
import type { Readable } from "node:stream";

export type S3PutParams = {
  Bucket: string;
  Key: string;
  Body: Uint8Array | Readable;
  ContentType?: string;
};

export type S3GetParams = {
  Bucket: string;
  Key: string;
  Range?: string;
};

export type S3HeadParams = {
  Bucket: string;
  Key: string;
};

export type S3DeleteParams = {
  Bucket: string;
  Key: string;
};

export type S3HeadResult = {
  ContentLength?: number;
  ContentType?: string;
  ETag?: string;
  LastModified?: Date;
};

export type S3GetResult = {
  Body?: Readable | AsyncIterable<Uint8Array> | Uint8Array | null;
  ContentLength?: number;
  ContentType?: string;
  ContentRange?: string;
};

export interface S3ClientLike {
  putObject(params: S3PutParams): Promise<void>;
  getObject(params: S3GetParams): Promise<S3GetResult>;
  headObject(params: S3HeadParams): Promise<S3HeadResult>;
  deleteObject(params: S3DeleteParams): Promise<void>;
}
