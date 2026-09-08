/**
 * Helpers de test: servidor HTTP fake para adapters research.*.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

export type FakeHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
) => void | Promise<void>;

export type FakeServer = {
  readonly baseUrl: string;
  readonly port: number;
  close(): Promise<void>;
};

export async function startFakeServer(handler: FakeHandler): Promise<FakeServer> {
  const server = http.createServer((req, res) => {
    const host = req.headers.host ?? "127.0.0.1";
    const url = new URL(req.url ?? "/", `http://${host}`);
    void Promise.resolve(handler(req, res, url)).catch(() => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("handler error");
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const addr = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    port: addr.port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

export function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Length", Buffer.byteLength(text));
  res.end(text);
}

export function sendRaw(
  res: http.ServerResponse,
  status: number,
  body: string,
  contentType = "text/plain",
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", contentType);
  res.end(body);
}
