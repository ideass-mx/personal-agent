# PHASE 56.1 — RESULT

**Fecha:** 2026-09-04  
**Estado:** PASS

Hardening P1 previo a PHASE 57 — Artifact System. Sin Artifact System, sin multi-MCP, sin memoria vectorial.

---

## A — Lifecycle / Health

### Cambios
- Estado dinámico del Node: `STARTING | READY | DEGRADED | DISCONNECTED | STOPPING`
- `attachLocalNode` expone `status`, `getHealth()`, `ready` (solo si `READY`)
- `onDisconnected` cableado en `gateway/src/index.ts` (crash → `DISCONNECTED`; tools fail-closed)
- Shutdown normal → `STOPPING` **sin** invocar `onDisconnected` como crash
- `/health` usa `getNodeHealth()` (no snapshot de boot): `agentReady`, `agentTools`, `nodeStatus`
- Desktop: `probeHealth` lee `nodeStatus`; `mapAgentState` → UI `DEGRADED` si Node `DISCONNECTED`/`DEGRADED`; UI `STOPPED` si proceso detenido

### Archivos
- `gateway/src/runtime/node-lifecycle.ts` (nuevo)
- `gateway/src/runtime/attach-node.ts`
- `gateway/src/index.ts`
- `gateway/src/http/server.ts`
- `desktop/lib/agent-process.cjs`
- `desktop/lib/states.cjs`
- `desktop/main.js`
- Tests arquitectura phase26 / phase34 / extension-independence actualizados

### Tests
- `gateway/tests/runtime/phase56-1-lifecycle-health.test.ts`
  - READY tras attach
  - disconnect → DISCONNECTED + fail-closed tools
  - shutdown normal ≠ crash
- Desktop: `mapAgentState DEGRADED when Node DISCONNECTED`

---

## B — Tool Schema

### Cambios
- `sanitizeDiscoveredInputSchema`: valida/acota JSON Schema (profundidad, keys, enum, nested, arrays)
- Discovery propaga schema sanado a `RemoteAgentTool` → `toLLMToolDescriptor` → LLM
- Fallback explícito: `GENERIC_INPUT_SCHEMA` + `x-mxideass-schemaFallback: true`

### Archivos
- `gateway/src/tools/schema-sanitize.ts` (nuevo)
- `gateway/src/tools/discover.ts`
- `gateway/tests/architecture/phase29-e2e-tool-execution.test.ts` (assert actualizado)

### Tests
- `gateway/tests/tools/phase56-1-schema-plumbing.test.ts`
  - simple, multi-props, required, enum, nested, array
  - missing / invalid → fallback
  - descriptor conserva schema tras discovery

---

## C — Policy / Fixtures

### Cambios
- Tests de honesty (sin fake tools, sin nuevos permisos)
- Confirma: `enabledTools` ∩ `toolPolicy` ∩ registry no inventa `document.*` / `pdf.*` / `git.*`
- Skills no añaden tools; policy deny-by-default

### Archivos
- `gateway/tests/agents/phase56-1-fixtures-honesty.test.ts`
- (fixtures/policy sin cambios de permisos)

### Tests
- familias fantasma no aparecen
- coding-agent filtra math/system vía enabledTools
- book-writer solo filesystem live
- tool inexistente no rompe Runtime

---

## D — Pairing

### Cambios
- **D1 Revoke:** `revokeTrustedDevice` + `POST /v1/pairing/trusted-devices/:deviceId/revoke` + IPC Desktop
- **D2 Accept/approve:** accept atómico PENDING→AWAITING (un device); segundo device falla; approve atómico; segundo approve → `pairing_already_approved`; waiters sin last-writer-wins
- **D3 Tailscale:** `begin-pairing` exige Tailscale READY; endpoint solo Tailscale IP/DNS (sin LAN/127.0.0.1)
- **D4 Semántica:** `hasPersistedInstallCredential()`; `hasPersistedPairingAuth` deprecated = install credential ≠ trusted device; UI expone `installCredentialPresent` / `trustedDevicePresent`
- Protocolo: `pairing_waiter_busy` en `ErrorCode`

### Archivos
- `gateway/src/pairing/store.ts`
- `gateway/src/pairing/waiters.ts`
- `gateway/src/http/pairing-http.ts`
- `gateway/src/ws/index.ts`
- `packages/protocol/messages.ts`, `PROTOCOL.md`
- `desktop/main.js`, `preload.js`, `lib/agent-identity.cjs`

### Tests
- `gateway/tests/pairing/phase56-1-pairing-hardening.test.ts`
- Desktop: install credential ≠ trusted device

---

## Security Verification

| Control | Resultado |
|---------|-----------|
| Pairing secret no en logs / no persistido plaintext | OK |
| deviceCredential solo en approve → waiter WS | OK |
| HUB_TOKEN no en QR | OK |
| Revoked device no autentica | OK |
| Skills / enabledTools no conceden permisos | OK |
| Tool policy deny-by-default | OK |
| Node disconnect → tools fail-closed | OK |
| Pairing sin Tailscale READY → reject | OK |

---

## Regression Results

| Suite | Resultado |
|-------|-----------|
| `packages/workspace-http` | 8 pass |
| `gateway` | **532 pass** / 0 fail |
| `node` | 240 pass / 3 skipped (Windows-only) |
| `desktop` unit | 23 pass |
| PHASE 56 skills/agent tests | incluidos en gateway PASS |

---

## Build Results

| Check | Resultado |
|-------|-----------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run smoke:package` | PASS (handshake + tools/list + filesystem.read) |

---

## Remaining P1

Ninguno de los P1 del audit PHASE-56 que entraban en el alcance 56.1 queda abierto.

Pendiente de producto (no bloqueante 56.1):
- Acotar `HUB_TOKEN` install auth a control plane localhost (deuda PHASE 52 documentada; fuera de alcance explícito)

---

## Remaining P2

- `memoryPolicy` stub no leído por Runtime
- `HubAgentError` naming / docs `hub/` residuales
- `/health` público (devices + tool names)
- Approve sin waiter pierde credential plaintext (re-pair)
- Desktop SIGKILL agresivo @500ms

---

## Explicitly Deferred

- Artifact tools (`document.*`, `pdf.*`, `image.*`, …) → PHASE 57
- Vector / persistent memory
- Multi-MCP
- Marketplace / A2A / Agent Builder / CapabilityRegistry
- Eliminación completa de `HUB_TOKEN`
- Migración masiva Android `HubClient`
- Auto-restart de Node

---

```text
PHASE 56.1 STATUS: PASS
```
