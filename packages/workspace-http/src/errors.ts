export type WorkspaceHttpErrorKind =
  | "unauthorized"
  | "not_found"
  | "bad_request"
  | "conflict"
  | "gateway"
  | "network";

export class WorkspaceHttpError extends Error {
  readonly status: number;
  readonly kind: WorkspaceHttpErrorKind;
  readonly code: string | undefined;

  constructor(
    kind: WorkspaceHttpErrorKind,
    message: string,
    status: number,
    code?: string,
  ) {
    super(message);
    this.name = "WorkspaceHttpError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export function kindForStatus(status: number): WorkspaceHttpErrorKind {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 400 || status === 422) return "bad_request";
  if (status === 409) return "conflict";
  if (status >= 500) return "gateway";
  return "gateway";
}
