/**
 * Storage factory — selecciona implementación ObjectStorage.
 * Local-first: provider=local no carga SDK cloud.
 */
import type { CredentialManager } from "../credentials/types.ts";
import { createLocalObjectStorage } from "./local.ts";
import {
  createMinioObjectStorage,
  createS3ObjectStorage,
  createWasabiObjectStorage,
} from "./providers.ts";
import type { S3ClientLike } from "./s3-client-like.ts";
import {
  parseStorageProviderId,
  resolveStorageConfigFromEnv,
  type ResolvedStorageConfig,
} from "./storage-config.ts";
import type { ObjectStorage } from "./types.ts";
import { resolveObjectsRoot } from "./resolve-root.ts";

export type CreateObjectStorageOptions = {
  readonly config?: ResolvedStorageConfig;
  readonly credentials?: CredentialManager;
  /** Solo tests cloud: cliente fake. */
  readonly client?: S3ClientLike;
  readonly objectsRoot?: string;
};

export function createObjectStorage(
  options: CreateObjectStorageOptions = {},
): ObjectStorage {
  const config =
    options.config ??
    resolveStorageConfigFromEnv({
      objectsRoot: options.objectsRoot ?? resolveObjectsRoot(),
    });

  if (config.provider === "local") {
    return createLocalObjectStorage({ rootDir: config.rootDir });
  }

  if (!options.credentials && !options.client) {
    throw new Error(
      `ObjectStorage(${config.provider}): CredentialManager requerido`,
    );
  }

  // Placeholder credentials si solo hay client inyectado (tests).
  const credentials =
    options.credentials ??
    ({
      async getSecret() {
        return null;
      },
    } as unknown as CredentialManager);

  const cloud = {
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
    prefix: config.prefix,
    forcePathStyle: config.forcePathStyle,
    credentialRef: config.credentialRef,
    credentials,
    client: options.client,
  };

  switch (config.provider) {
    case "s3":
      return createS3ObjectStorage(cloud);
    case "minio":
      return createMinioObjectStorage(cloud);
    case "wasabi":
      return createWasabiObjectStorage(cloud);
    default: {
      const _exhaustive: never = config;
      throw new Error(
        `Unsupported object storage provider: ${(_exhaustive as ResolvedStorageConfig).provider}`,
      );
    }
  }
}

export { parseStorageProviderId, resolveStorageConfigFromEnv };
