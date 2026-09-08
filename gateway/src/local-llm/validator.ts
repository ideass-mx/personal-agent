/**
 * Validación de integridad GGUF (tamaño + SHA-256).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { LocalModelError, userMessageForCode } from "./errors.ts";

export type ValidateModelFileInput = {
  filePath: string;
  expectedBytes: number;
  sha256: string;
  /** Tolerancia de tamaño (bytes). */
  sizeTolerance?: number;
};

export async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function validateModelFile(
  input: ValidateModelFileInput,
): Promise<void> {
  const { filePath, expectedBytes, sha256 } = input;
  const tolerance = input.sizeTolerance ?? 0;
  if (!fs.existsSync(filePath)) {
    throw new LocalModelError(
      "MODEL_VALIDATION_FAILED",
      userMessageForCode("MODEL_VALIDATION_FAILED"),
    );
  }
  const st = fs.statSync(filePath);
  if (Math.abs(st.size - expectedBytes) > tolerance) {
    throw new LocalModelError(
      "MODEL_VALIDATION_FAILED",
      userMessageForCode("MODEL_VALIDATION_FAILED"),
    );
  }
  // Magic GGUF
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    if (buf.toString("utf8") !== "GGUF") {
      throw new LocalModelError(
        "MODEL_VALIDATION_FAILED",
        userMessageForCode("MODEL_VALIDATION_FAILED"),
      );
    }
  } finally {
    fs.closeSync(fd);
  }
  const digest = await sha256File(filePath);
  if (digest.toLowerCase() !== sha256.toLowerCase()) {
    throw new LocalModelError(
      "MODEL_VALIDATION_FAILED",
      userMessageForCode("MODEL_VALIDATION_FAILED"),
    );
  }
}
