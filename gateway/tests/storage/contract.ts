/**
 * Contract tests compartidos para cualquier ObjectStorage.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Readable } from "node:stream";
import type { ObjectStorage } from "../../src/storage/types.ts";

export function describeStorageContract(
  name: string,
  createStorage: () => ObjectStorage | Promise<ObjectStorage>,
  providerId: string,
): void {
  describe(`ObjectStorage contract: ${name}`, () => {
    it("put / get / metadata / exists / delete", async () => {
      const storage = await createStorage();
      const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const bytes = new TextEncoder().encode(`hello-${name}`);
      const ref = await storage.put({
        bytes,
        mimeType: "text/plain",
        key: `k${suffix}`,
      });
      assert.equal(ref.provider, providerId);
      assert.equal(await storage.exists(ref), true);
      const meta = await storage.metadata(ref);
      assert.equal(meta.size, bytes.byteLength);
      assert.equal(meta.mimeType, "text/plain");
      const got = await storage.get(ref);
      assert.deepEqual(Buffer.from(got.bytes), Buffer.from(bytes));
      await storage.delete(ref);
      assert.equal(await storage.exists(ref), false);
      await storage.delete(ref); // idempotent
    });

    it("openReadStream + range", async () => {
      const storage = await createStorage();
      const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const bytes = new TextEncoder().encode("0123456789abcdef");
      const ref = await storage.put({
        bytes,
        mimeType: "application/octet-stream",
        key: `r${suffix}`,
      });
      const full = await storage.openReadStream(ref);
      const fullBuf = await readAll(full.stream);
      assert.equal(full.totalSize, bytes.byteLength);
      assert.deepEqual(fullBuf, Buffer.from(bytes));

      const ranged = await storage.openReadStream(ref, { start: 2, end: 5 });
      assert.equal(ranged.start, 2);
      assert.equal(ranged.end, 5);
      assert.equal(ranged.size, 4);
      const part = await readAll(ranged.stream);
      assert.deepEqual(part, Buffer.from("2345"));
      await storage.delete(ref);
    });
  });
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) {
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  }
  return Buffer.concat(chunks);
}
