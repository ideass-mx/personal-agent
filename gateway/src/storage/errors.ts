/**
 * Errores de ObjectStorage sin filtrar secretos ni headers de auth.
 */
import { redactForLog, redactString } from "../credentials/credential-redactor.ts";

export class ObjectStorageError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(redactString(message));
    this.name = "ObjectStorageError";
    this.code = code;
  }
}

export function wrapStorageError(
  code: string,
  err: unknown,
  fallbackMessage: string,
): ObjectStorageError {
  const raw = err instanceof Error ? err.message : String(err);
  const safe = redactForLog(raw);
  // Evitar filtrar Authorization / AWS4 firmas.
  const msg =
    /authorization|credential|secret|accesskey|aws4-hmac/i.test(safe)
      ? fallbackMessage
      : `${fallbackMessage}: ${safe}`;
  return new ObjectStorageError(code, msg);
}
