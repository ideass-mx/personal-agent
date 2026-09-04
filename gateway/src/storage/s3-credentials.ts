/**
 * Parseo de secreto S3 desde CredentialManager (JSON en memoria).
 * Nunca loguear el valor.
 */
export type S3AccessSecret = {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
};

export function parseS3AccessSecret(raw: string): S3AccessSecret {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ObjectStorage: formato de credencial S3 inválido");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("ObjectStorage: formato de credencial S3 inválido");
  }
  const o = parsed as Record<string, unknown>;
  const accessKeyId =
    typeof o.accessKeyId === "string"
      ? o.accessKeyId
      : typeof o.access_key_id === "string"
        ? o.access_key_id
        : "";
  const secretAccessKey =
    typeof o.secretAccessKey === "string"
      ? o.secretAccessKey
      : typeof o.secret_access_key === "string"
        ? o.secret_access_key
        : "";
  if (!accessKeyId.trim() || !secretAccessKey.trim()) {
    throw new Error("ObjectStorage: credencial S3 incompleta");
  }
  const sessionToken =
    typeof o.sessionToken === "string"
      ? o.sessionToken
      : typeof o.session_token === "string"
        ? o.session_token
        : undefined;
  return {
    accessKeyId: accessKeyId.trim(),
    secretAccessKey: secretAccessKey.trim(),
    sessionToken: sessionToken?.trim() || undefined,
  };
}
