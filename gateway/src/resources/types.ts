/**
 * Resource de plataforma — referencia, no Artifact.
 * Un Resource externo puede permanecer solo como URI.
 */
export type ResourceKind = "external" | "embedded" | "local_ref";

export type Resource = {
  readonly id: string;
  readonly kind: ResourceKind;
  readonly uri?: string;
  readonly mimeType?: string;
  readonly name?: string;
  readonly description?: string;
  readonly inlineText?: string;
  readonly inlineBytes?: Uint8Array;
};
