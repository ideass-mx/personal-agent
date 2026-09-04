/**
 * Helpers put: bytes XOR stream.
 */
import type { Readable } from "node:stream";
import type { PutObjectInput } from "./types.ts";

export function assertPutPayload(input: PutObjectInput): {
  mode: "bytes" | "stream";
  bytes?: Uint8Array;
  stream?: Readable;
} {
  const hasBytes = input.bytes instanceof Uint8Array;
  const hasStream = input.stream != null;
  if (hasBytes === hasStream) {
    throw new Error(
      "ObjectStorage.put: proporcionar exactamente uno de bytes|stream",
    );
  }
  if (hasBytes) return { mode: "bytes", bytes: input.bytes };
  return { mode: "stream", stream: input.stream };
}

/** Cuenta bytes de un Readable y aborta si supera maxBytes. */
export async function readStreamLimited(
  stream: Readable,
  maxBytes: number,
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > maxBytes) {
      stream.destroy();
      throw new Error(`ObjectStorage.put: supera máximo ${maxBytes} bytes`);
    }
    chunks.push(buf);
  }
  return new Uint8Array(Buffer.concat(chunks));
}
