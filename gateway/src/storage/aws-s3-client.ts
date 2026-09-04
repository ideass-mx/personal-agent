/**
 * Adapter AWS SDK → S3ClientLike.
 * Import dinámico: LocalObjectStorage no carga este módulo.
 */
import type { S3ClientLike } from "./s3-client-like.ts";
import { wrapStorageError } from "./errors.ts";

export type AwsS3ClientFactoryOptions = {
  readonly region: string;
  readonly endpoint?: string;
  readonly forcePathStyle?: boolean;
};

export async function createAwsS3ClientLike(
  options: AwsS3ClientFactoryOptions,
  creds: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  },
): Promise<S3ClientLike> {
  try {
    const {
      S3Client,
      PutObjectCommand,
      GetObjectCommand,
      HeadObjectCommand,
      DeleteObjectCommand,
    } = await import("@aws-sdk/client-s3");

    const client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle ?? false,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      },
    });

    return {
      async putObject(params) {
        await client.send(new PutObjectCommand(params));
      },
      async getObject(params) {
        const out = await client.send(new GetObjectCommand(params));
        return {
          Body: out.Body as import("node:stream").Readable | undefined,
          ContentLength: out.ContentLength,
          ContentType: out.ContentType,
          ContentRange: out.ContentRange,
        };
      },
      async headObject(params) {
        const out = await client.send(new HeadObjectCommand(params));
        return {
          ContentLength: out.ContentLength,
          ContentType: out.ContentType,
          ETag: out.ETag,
          LastModified: out.LastModified,
        };
      },
      async deleteObject(params) {
        await client.send(new DeleteObjectCommand(params));
      },
    };
  } catch (err) {
    throw wrapStorageError(
      "sdk_init",
      err,
      "ObjectStorage: no se pudo inicializar cliente S3",
    );
  }
}
