# PHASE 58 — AUDIT

**Fecha:** 2026-09-04  
**Precedencia:** PHASE 57 Artifact / ObjectStorage

---

## 1. Estado actual

| Área | Hallazgo |
|------|----------|
| ArtifactManager | Existe; se crea en `index.ts` pero **no se pasa a HTTP** |
| ObjectStorage | `get()` → `Uint8Array` completo; **sin stream** |
| LocalObjectStorage | `fs.readFileSync`; max 25 MiB |
| HTTP auth | Workspace/Pairing: **solo** Bearer = `HUB_TOKEN` (install) |
| Device auth | Solo WS (`verifyDeviceCredential`) |
| `trusted_devices.permissions` | Escrito `["agent.connect"]`; **no enforced** |
| Download HTTP | **No existe** |
| Protocolo WS | Text-only; no blobs (no tocar) |

---

## 2. Auth patterns a reutilizar

- `workspace-http.ts`: `Bearer` + `timingSafeEqual` + envelope `{ error: { code, message } }`
- `pairing/store.ts`: `verifyDeviceCredential(deviceId, credential)`
- **Gap:** Android paired solo tiene device credential → artifact HTTP **debe** dual-auth (install **o** device), igual que WS

---

## 3. Contradicciones / decisiones

1. **Install-only HTTP rompería Android.** Resolución: dual-auth en `/artifacts/*` sin nuevo token type.
2. **Streaming vs `readBytes`.** Resolución: extender `ObjectStorage.openReadStream` (Node `Readable`); HTTP no llama `fs` ni `LocalObjectStorage`.
3. **permissions ACL completo.** No existe enforcement. PHASE 58: ACTIVE device o install = acceso (Single Node). ACL fino → futuro.
4. **Range.** Local `createReadStream({ start, end })` es limpio → implementar soporte básico opcional.

---

## 4. Clientes

| Cliente | Reutilizar |
|---------|------------|
| Android | Patrón `WorkspaceHttpClient` (Bearer HTTP); **no** HubClient WS |
| Desktop | Patrón `hubPairingFetch` + install bearer; nuevo helper binario |

---

## 5. Intactos

AgentRuntime, pairing flow, Tailscale, Node MCP, PROTOCOL.md WS, workspace/pairing route semantics (solo copiar auth).

```text
AUDIT STATUS: COMPLETE
```
