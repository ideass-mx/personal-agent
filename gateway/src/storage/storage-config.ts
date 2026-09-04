/**
 * Configuración de ObjectStorage (infra). Sin access keys plaintext.
 */
import type { CredentialManager } from "../credentials/types.ts";
import type { StorageProviderId } from "./types.ts";

export type LocalStorageResolvedConfig = {
  readonly provider: "local";
  readonly rootDir: string;
};

export type CloudStorageResolvedConfig = {
  readonly provider: "s3" | "minio" | "wasabi";
  readonly bucket: string;
  readonly region: string;
  readonly endpoint?: string;
  readonly prefix?: string;
  readonly forcePathStyle?: boolean;
  readonly credentialRef: string;
};

export type ResolvedStorageConfig =
  | LocalStorageResolvedConfig
  | CloudStorageResolvedConfig;

const PROVIDERS = new Set<StorageProviderId>([
  "local",
  "s3",
  "minio",
  "wasabi",
]);

export function parseStorageProviderId(
  raw: string | undefined,
): StorageProviderId {
  const v = (raw ?? "local").trim().toLowerCase();
  if (!PROVIDERS.has(v as StorageProviderId)) {
    throw new Error(`Unsupported object storage provider: ${raw}`);
  }
  return v as StorageProviderId;
}

/**
 * Lee env. DEFAULT = local.
 * No activa S3 por presencia de AWS_* en el entorno.
 */
export function resolveStorageConfigFromEnv(options: {
  readonly objectsRoot: string;
}): ResolvedStorageConfig {
  const provider = parseStorageProviderId(
    process.env.PERSONAL_AGENT_STORAGE_PROVIDER,
  );
  if (provider === "local") {
    return { provider: "local", rootDir: options.objectsRoot };
  }

  const bucket =
    process.env.PERSONAL_AGENT_STORAGE_BUCKET?.trim() ||
    process.env.PERSONAL_AGENT_S3_BUCKET?.trim() ||
    "";
  const region =
    process.env.PERSONAL_AGENT_STORAGE_REGION?.trim() ||
    process.env.PERSONAL_AGENT_S3_REGION?.trim() ||
    "us-east-1";
  const endpoint =
    process.env.PERSONAL_AGENT_STORAGE_ENDPOINT?.trim() || undefined;
  const prefix =
    process.env.PERSONAL_AGENT_STORAGE_PREFIX?.trim() || undefined;
  const credentialRef =
    process.env.PERSONAL_AGENT_STORAGE_CREDENTIAL_REF?.trim() || "";
  const forcePathStyleEnv =
    process.env.PERSONAL_AGENT_STORAGE_FORCE_PATH_STYLE?.trim();
  const forcePathStyle =
    forcePathStyleEnv === "1" || forcePathStyleEnv === "true"
      ? true
      : forcePathStyleEnv === "0" || forcePathStyleEnv === "false"
        ? false
        : provider === "minio"
          ? true
          : undefined;

  if (!bucket) {
    throw new Error(
      `ObjectStorage(${provider}): falta PERSONAL_AGENT_STORAGE_BUCKET`,
    );
  }
  if (!credentialRef) {
    throw new Error(
      `ObjectStorage(${provider}): falta PERSONAL_AGENT_STORAGE_CREDENTIAL_REF`,
    );
  }
  if ((provider === "minio" || provider === "wasabi") && !endpoint) {
    // Wasabi puede usar endpoint regional; MinIO casi siempre necesita endpoint.
    if (provider === "minio") {
      throw new Error(
        "ObjectStorage(minio): falta PERSONAL_AGENT_STORAGE_ENDPOINT",
      );
    }
  }

  return {
    provider,
    bucket,
    region,
    endpoint,
    prefix,
    forcePathStyle,
    credentialRef,
  };
}

export type CreateObjectStorageDeps = {
  readonly config: ResolvedStorageConfig;
  readonly credentials?: CredentialManager;
};
