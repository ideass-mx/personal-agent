export {
  type StorageProviderId,
  type ObjectReference,
  type ObjectMetadata,
  type PutObjectInput,
  type GetObjectResult,
  type ObjectStorage,
  type OpenReadStreamOptions,
  type ObjectReadStream,
  DEFAULT_MAX_OBJECT_BYTES,
  OBJECT_KEY_RE,
  assertSafeObjectKey,
} from "./types.ts";
export {
  LocalObjectStorage,
  createLocalObjectStorage,
  type LocalObjectStorageOptions,
} from "./local.ts";
export { resolveObjectsRoot } from "./resolve-root.ts";
export {
  createObjectStorage,
  parseStorageProviderId,
  resolveStorageConfigFromEnv,
} from "./storage-factory.ts";
export type {
  ResolvedStorageConfig,
  LocalStorageResolvedConfig,
  CloudStorageResolvedConfig,
} from "./storage-config.ts";
export {
  createS3ObjectStorage,
  createMinioObjectStorage,
  createWasabiObjectStorage,
  type CloudObjectStorageConfig,
} from "./providers.ts";
export { S3CompatibleObjectStorage } from "./s3-compatible.ts";
export type { S3ClientLike } from "./s3-client-like.ts";
export { parseS3AccessSecret } from "./s3-credentials.ts";
export { ObjectStorageError } from "./errors.ts";
