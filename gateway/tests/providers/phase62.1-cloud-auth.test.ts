/**
 * PHASE 62.1 — Cloud Auth contract tests (mock transport, no product cloud server).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { MemoryDeviceKeyStore } from "../../../packages/device-crypto/index.ts";
import {
  CLOUD_AUTH_AUDIENCE,
  buildCloudAuthMessage,
} from "../../../packages/device-crypto/index.ts";
import { MemorySecretStore } from "../../src/credentials/index.ts";
import {
  CloudAuthError,
  createCloudAuthClient,
  createCloudSessionStore,
  createMockCloudAuthTransport,
  createPersonalAgentCloudProvider,
} from "../../src/providers/cloud-auth/index.ts";
import { AgentDiagnosticError } from "../../src/diagnostics/error.ts";
import type { LLMProvider } from "../../src/providers/types.ts";
import { redactForLog, redactString } from "../../src/credentials/credential-redactor.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-cloud-auth-621-"));
process.env.HUB_TOKEN = "z".repeat(32);
process.env.PERSONAL_AGENT_DB = path.join(tmp, "data", "t.db");
process.env.PERSONAL_AGENT_OBJECTS_DIR = path.join(tmp, "objects");
process.env.PERSONAL_AGENT_CREDENTIALS_DIR = path.join(tmp, "credentials");
process.env.PERSONAL_AGENT_DATA_DIR = path.join(tmp, "product");
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

async function freshDevice() {
  const store = new MemoryDeviceKeyStore();
  const pub = await store.generate();
  const deviceId = `desktop-test-${Math.random().toString(16).slice(2)}`;
  return { store, pub, deviceId };
}

describe("PHASE 62.1 Cloud Auth — challenge / signature / session", () => {
  it("A — challenge generated, expires, single-use", async () => {
    const { store, pub, deviceId } = await freshDevice();
    const keys = new Map([[deviceId, pub.publicKey]]);
    const transport = createMockCloudAuthTransport({
      devicePublicKeys: keys,
      challengeTtlMs: 40,
    });
    const ch = await transport.requestChallenge({ deviceId });
    assert.ok(ch.challengeId);
    assert.ok(ch.challenge);
    assert.ok(Date.parse(ch.expiresAt) > Date.now() - 1000);

    await new Promise((r) => setTimeout(r, 50));
    const ts = new Date().toISOString();
    const msg = buildCloudAuthMessage({
      deviceId,
      challengeHex: ch.challenge,
      timestampIso: ts,
    });
    const sig = await store.sign(msg);
    await assert.rejects(
      () =>
        transport.verify({
          body: {
            deviceId,
            challengeId: ch.challengeId,
            signature: sig,
            timestamp: ts,
            algorithm: "Ed25519",
            audience: CLOUD_AUTH_AUDIENCE,
            publicKey: pub.publicKey,
          },
        }),
      (err: unknown) =>
        err instanceof CloudAuthError &&
        err.code === "CLOUD_AUTH_CHALLENGE_FAILED",
    );
  });

  it("B — valid Ed25519 → success; invalid / wrong audience / wrong device rejected", async () => {
    const { store, pub, deviceId } = await freshDevice();
    const keys = new Map([[deviceId, pub.publicKey]]);
    const transport = createMockCloudAuthTransport({ devicePublicKeys: keys });

    const sessionStore = createCloudSessionStore(new MemorySecretStore());
    const client = createCloudAuthClient({
      transport,
      sessionStore,
      deviceKeyStore: store,
      deviceId,
      log: () => {},
    });
    const status = await client.authenticate();
    assert.equal(status.connected, true);
    assert.equal(status.sessionActive, true);

    const ch = await transport.requestChallenge({ deviceId });
    await assert.rejects(
      () =>
        transport.verify({
          body: {
            deviceId,
            challengeId: ch.challengeId,
            signature: "AAAA",
            timestamp: new Date().toISOString(),
            algorithm: "Ed25519",
            audience: CLOUD_AUTH_AUDIENCE,
            publicKey: pub.publicKey,
          },
        }),
      (err: unknown) =>
        err instanceof CloudAuthError &&
        err.code === "CLOUD_AUTH_SIGNATURE_INVALID",
    );

    const ch2 = await transport.requestChallenge({ deviceId });
    const ts = new Date().toISOString();
    const msg = buildCloudAuthMessage({
      deviceId,
      challengeHex: ch2.challenge,
      timestampIso: ts,
      audience: "other-service",
    });
    const sig = await store.sign(msg);
    await assert.rejects(
      () =>
        transport.verify({
          body: {
            deviceId,
            challengeId: ch2.challengeId,
            signature: sig,
            timestamp: ts,
            algorithm: "Ed25519",
            audience: "other-service" as typeof CLOUD_AUTH_AUDIENCE,
            publicKey: pub.publicKey,
          },
        }),
      (err: unknown) =>
        err instanceof CloudAuthError && err.code === "CLOUD_AUTH_FORBIDDEN",
    );

    const other = await freshDevice();
    const ch3 = await transport.requestChallenge({ deviceId });
    await assert.rejects(
      () =>
        transport.verify({
          body: {
            deviceId: other.deviceId,
            challengeId: ch3.challengeId,
            signature: "x",
            timestamp: new Date().toISOString(),
            algorithm: "Ed25519",
            audience: CLOUD_AUTH_AUDIENCE,
          },
        }),
      (err: unknown) =>
        err instanceof CloudAuthError &&
        (err.code === "CLOUD_AUTH_CHALLENGE_FAILED" ||
          err.code === "CLOUD_AUTH_FORBIDDEN"),
    );
  });

  it("C — session create / refresh / revoke / device revoke", async () => {
    const { store, pub, deviceId } = await freshDevice();
    const transport = createMockCloudAuthTransport({
      devicePublicKeys: new Map([[deviceId, pub.publicKey]]),
      sessionTtlMs: 60_000,
    });
    const sessionStore = createCloudSessionStore(new MemorySecretStore());
    const client = createCloudAuthClient({
      transport,
      sessionStore,
      deviceKeyStore: store,
      deviceId,
      log: () => {},
    });
    await client.authenticate();
    const token1 = await client.ensureAccessToken();
    assert.ok(token1.startsWith("at_"));
    const token2 = await client.refresh();
    assert.ok(token2.startsWith("at_"));
    assert.notEqual(token1, token2);

    transport.markDeviceRevoked(deviceId);
    await assert.rejects(
      () => client.refresh(),
      (err: unknown) =>
        err instanceof CloudAuthError &&
        err.code === "CLOUD_AUTH_DEVICE_REVOKED",
    );
  });

  it("D — same challenge cannot be reused (replay)", async () => {
    const { store, pub, deviceId } = await freshDevice();
    const transport = createMockCloudAuthTransport({
      devicePublicKeys: new Map([[deviceId, pub.publicKey]]),
    });
    const ch = await transport.requestChallenge({ deviceId });
    const ts = new Date().toISOString();
    const msg = buildCloudAuthMessage({
      deviceId,
      challengeHex: ch.challenge,
      timestampIso: ts,
    });
    const sig = await store.sign(msg);
    const body = {
      deviceId,
      challengeId: ch.challengeId,
      signature: sig,
      timestamp: ts,
      algorithm: "Ed25519" as const,
      audience: CLOUD_AUTH_AUDIENCE,
      publicKey: pub.publicKey,
    };
    await transport.verify({ body });
    await assert.rejects(
      () => transport.verify({ body }),
      (err: unknown) =>
        err instanceof CloudAuthError &&
        err.code === "CLOUD_AUTH_CHALLENGE_FAILED",
    );
  });

  it("E — disconnect removes local session", async () => {
    const { store, pub, deviceId } = await freshDevice();
    const transport = createMockCloudAuthTransport({
      devicePublicKeys: new Map([[deviceId, pub.publicKey]]),
    });
    const secrets = new MemorySecretStore();
    const sessionStore = createCloudSessionStore(secrets);
    const client = createCloudAuthClient({
      transport,
      sessionStore,
      deviceKeyStore: store,
      deviceId,
      log: () => {},
    });
    await client.authenticate();
    assert.ok(await sessionStore.load());
    await client.disconnect();
    assert.equal(await sessionStore.load(), null);
    assert.equal(client.getLifecycle(), "NO_SESSION");
  });

  it("F/G — 401 → refresh → retry once; second 401 → SESSION_EXPIRED", async () => {
    const { store, pub, deviceId } = await freshDevice();
    const transport = createMockCloudAuthTransport({
      devicePublicKeys: new Map([[deviceId, pub.publicKey]]),
    });
    const sessionStore = createCloudSessionStore(new MemorySecretStore());
    const client = createCloudAuthClient({
      transport,
      sessionStore,
      deviceKeyStore: store,
      deviceId,
      log: () => {},
    });
    await client.authenticate();

    let calls = 0;
    const createInner = (accessToken: string): LLMProvider => ({
      id: "mock-inner",
      async *stream() {
        calls += 1;
        void accessToken;
        if (calls === 1) {
          throw new AgentDiagnosticError({
            message: "provider_http_401",
            component: "LLM_PROVIDER",
            stage: "LLM_REQUEST",
            errorCode: "LLM_AUTH_FAILED",
            httpStatus: 401,
          });
        }
        yield { type: "text_delta", text: "OK" };
        yield { type: "done" };
      },
    });

    const provider = createPersonalAgentCloudProvider({
      baseUrl: "https://cloud.test.example",
      model: "pa-cloud-default",
      auth: client,
      createInner,
    });
    let text = "";
    for await (const ev of provider.stream({
      messages: [{ role: "user", content: "hi" }],
    })) {
      if (ev.type === "text_delta") text += ev.text;
    }
    assert.equal(text, "OK");
    assert.equal(calls, 2);

    calls = 0;
    const createInnerFail = (): LLMProvider => ({
      id: "mock-inner-fail",
      async *stream() {
        calls += 1;
        throw new AgentDiagnosticError({
          message: "provider_http_401",
          component: "LLM_PROVIDER",
          stage: "LLM_REQUEST",
          errorCode: "LLM_AUTH_FAILED",
          httpStatus: 401,
        });
      },
    });
    const provider2 = createPersonalAgentCloudProvider({
      baseUrl: "https://cloud.test.example",
      model: "m",
      auth: client,
      createInner: createInnerFail,
    });
    await assert.rejects(
      async () => {
        for await (const _ of provider2.stream({
          messages: [{ role: "user", content: "x" }],
        })) {
          /* drain */
        }
      },
      (err: unknown) =>
        err instanceof AgentDiagnosticError &&
        (err.metadata as { cloudAuthCode?: string })?.cloudAuthCode ===
          "CLOUD_AUTH_SESSION_EXPIRED",
    );
    assert.equal(calls, 2);
  });

  it("H — Cloud failure does not invoke LocalProvider", async () => {
    let localCalled = false;
    const localStub: LLMProvider = {
      id: "local",
      async *stream() {
        localCalled = true;
        yield { type: "done" };
      },
    };
    void localStub;
    const { store, deviceId } = await freshDevice();
    const sessionStore = createCloudSessionStore(new MemorySecretStore());
    const client = createCloudAuthClient({
      transport: null,
      sessionStore,
      deviceKeyStore: store,
      deviceId,
      log: () => {},
    });
    const cloud = createPersonalAgentCloudProvider({
      baseUrl: "https://cloud.test.example",
      model: "m",
      auth: client,
    });
    await assert.rejects(async () => {
      for await (const _ of cloud.stream({
        messages: [{ role: "user", content: "x" }],
      })) {
        /* */
      }
    });
    assert.equal(localCalled, false);
  });
});

describe("PHASE 62.1 security — no secrets in redaction / diagnostics strings", () => {
  it("redacts Bearer, API keys, session tokens, private keys", () => {
    const samples = [
      "Authorization: Bearer at_supersecret_token_value",
      "PERSONAL_AGENT_CLOUD_SESSION_TOKEN=devtokensecret",
      "apiKey=sk-abcdefghijklmnopqrstuvwxyz",
      "access_token=abc&refresh_token=def",
      "https://api.example/?api_key=sekrit&token=t2",
      "privateKey=pkcs8material",
    ];
    for (const s of samples) {
      const out = redactString(s);
      assert.equal(out.includes("supersecret"), false);
      assert.equal(out.includes("devtokensecret"), false);
      assert.equal(out.includes("sekrit"), false);
      assert.equal(out.includes("pkcs8material"), false);
      assert.equal(out.includes("abcdefghijklmnopqrstuvwxyz"), false);
    }
    const log = redactForLog({
      Authorization: "Bearer xyz",
      accessToken: "tok",
      signature: "sigbytes",
    });
    assert.equal(log.includes("xyz"), false);
    assert.equal(log.includes("tok"), false);
    assert.equal(log.includes("sigbytes"), false);
  });
});
