/**
 * Descarga HTTPS de modelos (sin ejecutar el archivo).
 */
import fs from "node:fs";
import path from "node:path";
import { LocalModelError, userMessageForCode } from "./errors.ts";
import { ensureModelStorageDirs, resolveModelStorage } from "./storage.ts";

export type DownloadProgress = {
  bytesReceived: number;
  bytesTotal?: number;
  ratio?: number;
};

export type DownloadModelInput = {
  url: string;
  destPath: string;
  expectedBytes?: number;
  signal?: AbortSignal;
  onProgress?: (p: DownloadProgress) => void;
  /** Inyectable en tests. */
  fetchImpl?: typeof fetch;
};

export async function downloadModelFile(
  input: DownloadModelInput,
): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const paths = ensureModelStorageDirs(resolveModelStorage());
  const tmpName = `${path.basename(input.destPath)}.partial`;
  const tmpPath = path.join(paths.downloadsDir, tmpName);
  fs.mkdirSync(path.dirname(input.destPath), { recursive: true });

  let res: Response;
  try {
    res = await fetchImpl(input.url, {
      redirect: "follow",
      signal: input.signal,
      headers: { "User-Agent": "PersonalAgent/1.0" },
    });
  } catch (err) {
    throw new LocalModelError(
      "MODEL_DOWNLOAD_FAILED",
      userMessageForCode("MODEL_DOWNLOAD_FAILED"),
      err,
    );
  }
  if (!res.ok || !res.body) {
    throw new LocalModelError(
      "MODEL_DOWNLOAD_FAILED",
      userMessageForCode("MODEL_DOWNLOAD_FAILED"),
    );
  }

  const totalHeader = res.headers.get("content-length");
  const bytesTotal =
    input.expectedBytes ??
    (totalHeader ? Number(totalHeader) : undefined);
  const file = fs.createWriteStream(tmpPath);
  let received = 0;

  try {
    const reader = res.body.getReader();
    for (;;) {
      if (input.signal?.aborted) {
        throw new LocalModelError(
          "MODEL_CANCELLED",
          userMessageForCode("MODEL_CANCELLED"),
        );
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      await new Promise<void>((resolve, reject) => {
        file.write(Buffer.from(value), (err) => (err ? reject(err) : resolve()));
      });
      input.onProgress?.({
        bytesReceived: received,
        bytesTotal,
        ratio:
          bytesTotal && bytesTotal > 0
            ? Math.min(1, received / bytesTotal)
            : undefined,
      });
    }
    await new Promise<void>((resolve, reject) => {
      file.end(() => resolve());
      file.on("error", reject);
    });
  } catch (err) {
    try {
      file.close();
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    if (err instanceof LocalModelError) throw err;
    throw new LocalModelError(
      "MODEL_DOWNLOAD_FAILED",
      userMessageForCode("MODEL_DOWNLOAD_FAILED"),
      err,
    );
  }

  fs.renameSync(tmpPath, input.destPath);
}
