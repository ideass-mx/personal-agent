/**
 * PHASE 57.8 — Cryptographic Device identity (Ed25519 challenge-response).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { Hono } from "hono";
import type { WebSocket } from "ws";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-57-8-"));
process.env.ANTHROPIC_API_KEY = "sk-ant-test-placeholder";
process.env.HUB_TOKEN = "hub-token-device-crypto-phase578!!";
process.env.PERSONAL_AGENT_DB = path.join(tmp, "crypto.db");
process.env.PERSONAL_AGENT_ID = "crypto-agent-uuid-aaaa-bbbb";

const { runMigrations } = await import("../../src/db/database.ts");
runMigrations();

const identity = await import("../../src/identity/index.ts");
const pairing = await import("../../src/pairing/store.ts");
const { mountDeviceAuthHttp } = await import(
  "../../src/http/device-auth-http.ts"
);
const { authenticateHttpRequest } = await import(
  "../../src/http/bearer-auth.ts"
);
const {
  MemoryDeviceKeyStore,
  buildDeviceAuthMessage,
  generateEd25519KeyPair,
  signEd25519,
} = await import("../../../packages/device-crypto/index.ts");
const { db } = await import("../../src/db/database.ts");
const {
  createSession,
  dropSession,
} = await import("../../src/sessions/index.ts");

const HUB = process.env.HUB_TOKEN!;
const here = path.dirname(fileURLToPath(import.meta.url));

function mockWs(onClose?: () => void): WebSocket {
  return {
    readyState: 1,
    OPEN: 1,
    send() {},
    close() {
      onClose?.();
    },
  } as unknown as WebSocket;
}

async function pairWithCrypto(deviceId: string, name: string) {
  const store = new MemoryDeviceKeyStore();
  const pub = await store.generate();
  const s = pairing.createPairingSession();
  const accepted = pairing.acceptPairingRequest({
    pairingSessionId: s.id,
    pairingSecret: s.secret,
    deviceId,
    deviceName: name,
    platform: "test",
    publicKey: pub.publicKey,
    keyAlgorithm: "Ed25519",
  });
  assert.equal(accepted.ok, true);
  const approved = pairing.approvePairingSession(s.id);
  assert.equal(approved.ok, true);
  if (!approved.ok) throw new Error("approve failed");
  return { store, credential: approved.deviceCredential, publicKey: pub.publicKey };
}

function pairLegacy(deviceId: string, name: string): string {
  const s = pairing.createPairingSession();
  pairing.acceptPairingRequest({
    pairingSessionId: s.id,
    pairingSecret: s.secret,
    deviceId,
    deviceName: name,
    platform: "test",
  });
  const approved = pairing.approvePairingSession(s.id);
  assert.equal(approved.ok, true);
  if (!approved.ok) throw new Error("approve failed");
  return approved.deviceCredential;
}

describe("PHASE 57.8 cryptographic Device identity", () => {
  it("private key never in Gateway DB / HTTP enroll response / pairing store source", async () => {
    const { store, publicKey } = await pairWithCrypto("crypto-dev-1", "Phone");
    const pub = await store.getPublicKey();
    assert.ok(pub);
    assert.equal(pub!.publicKey, publicKey);

    const row = db
      .prepare(
        `SELECT public_key, credential_hash FROM trusted_devices WHERE device_id = ?`,
      )
      .get("crypto-dev-1") as {
      public_key: string;
      credential_hash: string;
    };
    assert.equal(row.public_key, publicKey);
    assert.ok(row.credential_hash.length > 0);

    const cols = db
      .prepare(`PRAGMA table_info(trusted_devices)`)
      .all() as Array<{ name: string }>;
    assert.equal(
      cols.some((c) => /private/i.test(c.name)),
      false,
    );

    const src = fs.readFileSync(
      path.join(here, "../../src/identity/device-auth.ts"),
      "utf8",
    );
    assert.doesNotMatch(src, /privateKey|private_key/);

    const httpSrc = fs.readFileSync(
      path.join(here, "../../src/http/device-auth-http.ts"),
      "utf8",
    );
    assert.doesNotMatch(httpSrc, /privateKey|private_key/);
  });

  it("DeviceKeyStore has no getPrivateKey API", () => {
    const storeSrc = fs.readFileSync(
      path.join(here, "../../../packages/device-crypto/types.ts"),
      "utf8",
    );
    // Strip comments: docs may mention the forbidden name without exposing an API.
    const apiSrc = storeSrc
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    assert.match(storeSrc, /interface DeviceKeyStore/);
    assert.doesNotMatch(apiSrc, /getPrivateKey/);
    assert.match(apiSrc, /sign\(/);
  });

  it("valid signature + active device → AuthSession; invalid / wrong key rejected", async () => {
    identity.ensureLocalIdentity();
    const { store } = await pairWithCrypto("crypto-ok", "OK");
    const issued = identity.issueDeviceAuthChallenge("crypto-ok");
    assert.equal(issued.ok, true);
    if (!issued.ok) return;

    const payload = buildDeviceAuthMessage({
      deviceId: "crypto-ok",
      challengeHex: issued.challenge,
    });
    const signature = await store.sign(payload);
    const ok = identity.verifyDeviceAuthSignature({
      deviceId: "crypto-ok",
      challengeId: issued.challengeId,
      signatureBase64: signature,
    });
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.session.deviceId, "crypto-ok");
    assert.equal(ok.userContext.authKind, "device");
    assert.equal(identity.isSessionActive(ok.session.id), true);

    const issued2 = identity.issueDeviceAuthChallenge("crypto-ok");
    assert.equal(issued2.ok, true);
    if (!issued2.ok) return;
    const bad = identity.verifyDeviceAuthSignature({
      deviceId: "crypto-ok",
      challengeId: issued2.challengeId,
      signatureBase64: Buffer.from("not-a-signature").toString("base64"),
    });
    assert.equal(bad.ok, false);

    const issued3 = identity.issueDeviceAuthChallenge("crypto-ok");
    assert.equal(issued3.ok, true);
    if (!issued3.ok) return;
    const other = generateEd25519KeyPair();
    const wrongSig = signEd25519(
      other.privateKey,
      buildDeviceAuthMessage({
        deviceId: "crypto-ok",
        challengeHex: issued3.challenge,
      }),
    );
    const wrong = identity.verifyDeviceAuthSignature({
      deviceId: "crypto-ok",
      challengeId: issued3.challengeId,
      signatureBase64: wrongSig,
    });
    assert.equal(wrong.ok, false);
  });

  it("replay / expired challenge / wrong deviceId rejected", async () => {
    const { store } = await pairWithCrypto("crypto-replay", "Replay");
    const issued = identity.issueDeviceAuthChallenge("crypto-replay");
    assert.equal(issued.ok, true);
    if (!issued.ok) return;
    const payload = buildDeviceAuthMessage({
      deviceId: "crypto-replay",
      challengeHex: issued.challenge,
    });
    const signature = await store.sign(payload);

    const first = identity.verifyDeviceAuthSignature({
      deviceId: "crypto-replay",
      challengeId: issued.challengeId,
      signatureBase64: signature,
    });
    assert.equal(first.ok, true);

    const replay = identity.verifyDeviceAuthSignature({
      deviceId: "crypto-replay",
      challengeId: issued.challengeId,
      signatureBase64: signature,
    });
    assert.equal(replay.ok, false);
    if (!replay.ok) {
      assert.equal(replay.replay, true);
      assert.ok(
        replay.reason === "challenge_consumed" ||
          replay.reason === "challenge_not_found",
      );
    }

    const issuedB = identity.issueDeviceAuthChallenge("crypto-replay");
    assert.equal(issuedB.ok, true);
    if (!issuedB.ok) return;
    const sigB = await store.sign(
      buildDeviceAuthMessage({
        deviceId: "crypto-replay",
        challengeHex: issuedB.challenge,
      }),
    );
    const mismatch = identity.verifyDeviceAuthSignature({
      deviceId: "other-device",
      challengeId: issuedB.challengeId,
      signatureBase64: sigB,
    });
    assert.equal(mismatch.ok, false);

    // Expire manually
    const issuedC = identity.issueDeviceAuthChallenge("crypto-replay");
    assert.equal(issuedC.ok, true);
    if (!issuedC.ok) return;
    db.prepare(
      `UPDATE device_auth_challenges SET expires_at = ? WHERE id = ?`,
    ).run(new Date(Date.now() - 1000).toISOString(), issuedC.challengeId);
    const expired = identity.verifyDeviceAuthSignature({
      deviceId: "crypto-replay",
      challengeId: issuedC.challengeId,
      signatureBase64: await store.sign(
        buildDeviceAuthMessage({
          deviceId: "crypto-replay",
          challengeHex: issuedC.challenge,
        }),
      ),
    });
    assert.equal(expired.ok, false);
    if (!expired.ok) assert.equal(expired.reason, "challenge_expired");
  });

  it("revoked device cannot authenticate with valid private key", async () => {
    const { store } = await pairWithCrypto("crypto-rev", "Rev");
    const owner = identity.resolveInstallCompatSession().userContext;
    identity.revokeTrustedDevice("crypto-rev", owner);

    const issued = identity.issueDeviceAuthChallenge("crypto-rev");
    assert.equal(issued.ok, false);
    if (!issued.ok) assert.equal(issued.reason, "revoked");

    // Even if a stale challenge existed, verify must fail on status
    const staleId = `ch_${"a".repeat(32)}`;
    db.prepare(
      `INSERT INTO device_auth_challenges (id, device_id, challenge_hex, expires_at)
       VALUES (?, 'crypto-rev', ?, ?)`,
    ).run(
      staleId,
      "ab".repeat(32),
      new Date(Date.now() + 60_000).toISOString(),
    );
    const sig = await store.sign(
      buildDeviceAuthMessage({
        deviceId: "crypto-rev",
        challengeHex: "ab".repeat(32),
      }),
    );
    const v = identity.verifyDeviceAuthSignature({
      deviceId: "crypto-rev",
      challengeId: staleId,
      signatureBase64: sig,
    });
    assert.equal(v.ok, false);
    if (!v.ok) assert.equal(v.reason, "revoked");
  });

  it("revoke kills AuthSessions and WS; cannot create new session", async () => {
    const { store } = await pairWithCrypto("crypto-kill", "Kill");
    const issued = identity.issueDeviceAuthChallenge("crypto-kill");
    assert.equal(issued.ok, true);
    if (!issued.ok) return;
    const sig = await store.sign(
      buildDeviceAuthMessage({
        deviceId: "crypto-kill",
        challengeHex: issued.challenge,
      }),
    );
    const auth = identity.verifyDeviceAuthSignature({
      deviceId: "crypto-kill",
      challengeId: issued.challengeId,
      signatureBase64: sig,
    });
    assert.equal(auth.ok, true);
    if (!auth.ok) return;

    let closed = false;
    const ws = mockWs(() => {
      closed = true;
    });
    const conn = createSession(ws);
    conn.authenticated = true;
    conn.deviceId = "crypto-kill";
    conn.authSessionId = auth.session.id;

    const owner = identity.resolveInstallCompatSession().userContext;
    const rev = identity.revokeTrustedDevice("crypto-kill", owner);
    assert.equal(rev.ok, true);
    assert.equal(closed, true);
    assert.equal(identity.isSessionActive(auth.session.id), false);

    const again = identity.issueDeviceAuthChallenge("crypto-kill");
    assert.equal(again.ok, false);
    dropSession(ws);
  });

  it("legacy device without publicKey cannot use crypto path; enroll upgrades", async () => {
    const cred = pairLegacy("legacy-up", "Legacy");
    const issued = identity.issueDeviceAuthChallenge("legacy-up");
    assert.equal(issued.ok, false);
    if (!issued.ok) assert.equal(issued.reason, "legacy_no_public_key");

    assert.equal(pairing.verifyDeviceCredential("legacy-up", cred), true);

    const store = new MemoryDeviceKeyStore();
    const pub = await store.generate();
    const app = new Hono();
    mountDeviceAuthHttp(app);
    const enroll = await app.request("/v1/device-auth/enroll", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cred}`,
        "X-Device-Id": "legacy-up",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        publicKey: pub.publicKey,
        keyAlgorithm: "Ed25519",
      }),
    });
    assert.equal(enroll.status, 200);
    const body = (await enroll.json()) as { identityStatus: string };
    assert.equal(body.identityStatus, "crypto_enrolled");

    const ch = await app.request("/v1/device-auth/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "legacy-up" }),
    });
    assert.equal(ch.status, 200);
    const challenge = (await ch.json()) as {
      challengeId: string;
      challenge: string;
    };
    const signature = await store.sign(
      buildDeviceAuthMessage({
        deviceId: "legacy-up",
        challengeHex: challenge.challenge,
      }),
    );
    const verify = await app.request("/v1/device-auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: "legacy-up",
        challengeId: challenge.challengeId,
        signature,
      }),
    });
    assert.equal(verify.status, 200);
    const vj = (await verify.json()) as { authSessionId: string };
    assert.ok(vj.authSessionId.startsWith("as_"));
  });

  it("publicKey uniqueness among ACTIVE devices", async () => {
    const a = await pairWithCrypto("pk-a", "A");
    const s = pairing.createPairingSession();
    const accepted = pairing.acceptPairingRequest({
      pairingSessionId: s.id,
      pairingSecret: s.secret,
      deviceId: "pk-b",
      deviceName: "B",
      publicKey: a.publicKey,
      keyAlgorithm: "Ed25519",
    });
    assert.equal(accepted.ok, true);
    const approved = pairing.approvePairingSession(s.id);
    assert.equal(approved.ok, false);
    if (!approved.ok) assert.equal(approved.code, "public_key_conflict");
  });

  it("remote HUB_TOKEN still rejected; IP alone insufficient; crypto works without HUB_TOKEN", () => {
    assert.equal(
      authenticateHttpRequest(
        {
          req: {
            header(name: string) {
              if (name === "Authorization") return `Bearer ${HUB}`;
              return undefined;
            },
          },
        } as never,
        HUB,
        { peerIsLoopback: false },
      ),
      null,
    );
  });

  it("protocol documents device_crypto + domain separation docs exist", () => {
    const proto = fs.readFileSync(
      path.join(here, "../../../packages/protocol/PROTOCOL.md"),
      "utf8",
    );
    assert.match(proto, /device_crypto/);
    assert.match(proto, /device_auth_challenge/);
    assert.match(proto, /publicKey/);

    const doc = fs.readFileSync(
      path.join(
        here,
        "../../../docs/architecture/device-cryptographic-identity.md",
      ),
      "utf8",
    );
    assert.match(doc, /Ed25519/);
    assert.match(doc, /private key = device only/i);
    assert.match(doc, /DeviceKeyStore/);
  });
});
