/**
 * Adapters delgados sobre S3CompatibleObjectStorage.
 */
import type { CredentialManager } from "../credentials/types.ts";
import { createAwsS3ClientLike } from "./aws-s3-client.ts";
import type { S3ClientLike } from "./s3-client-like.ts";
import { S3CompatibleObjectStorage } from "./s3-compatible.ts";

export type CloudObjectStorageConfig = {
  readonly bucket: string;
  readonly region: string;
  readonly endpoint?: string;
  readonly prefix?: string;
  readonly forcePathStyle?: boolean;
  readonly credentialRef: string;
  readonly credentials: CredentialManager;
  readonly client?: S3ClientLike;
  readonly maxBytes?: number;
};

function buildCompatible(
  providerId: "s3" | "minio" | "wasabi",
  config: CloudObjectStorageConfig,
  defaults: { forcePathStyle?: boolean },
): S3CompatibleObjectStorage {
  const forcePathStyle = config.forcePathStyle ?? defaults.forcePathStyle ?? false;
  return new S3CompatibleObjectStorage({
    providerId,
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
    prefix: config.prefix,
    forcePathStyle,
    credentialRef: config.credentialRef,
    credentials: config.credentials,
    maxBytes: config.maxBytes,
    client: config.client,
    createClient: config.client
      ? undefined
      : (creds) =>
          createAwsS3ClientLike(
            {
              region: config.region,
              endpoint: config.endpoint,
              forcePathStyle,
            },
            creds,
          ),
  });
}

/** AWS S3 (endpoint opcional; path-style false por defecto). */
export function createS3ObjectStorage(
  config: CloudObjectStorageConfig,
): S3CompatibleObjectStorage {
  return buildCompatible("s3", config, { forcePathStyle: false });
}

/** MinIO — endpoint explícito recomendado; path-style true por defecto. */
export function createMinioObjectStorage(
  config: CloudObjectStorageConfig,
): S3CompatibleObjectStorage {
  return buildCompatible("minio", config, { forcePathStyle: true });
}

/** Wasabi — S3-compatible; endpoint/region configurables (sin hardcode). */
export function createWasabiObjectStorage(
  config: CloudObjectStorageConfig,
): S3CompatibleObjectStorage {
  return buildCompatible("wasabi", config, { forcePathStyle: false });
}

export type S3ObjectStorage = S3CompatibleObjectStorage;
export type MinioObjectStorage = S3CompatibleObjectStorage;
export type WasabiObjectStorage = S3CompatibleObjectStorage;
