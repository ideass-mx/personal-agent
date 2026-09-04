# PHASE 65 — TEST MATRIX

## A. Automated validation (Linux / CI)

| Check | Command / location | Required for gate |
|-------|--------------------|-------------------|
| Gateway tests | `npm test --prefix gateway` | Yes |
| Node tests | `npm test --prefix node` | Yes |
| Desktop tests | `npm test --prefix desktop` | Yes |
| Android unit | `cd mobile/android && ./gradlew :app:testDebugUnitTest` | Yes (available) |
| Typecheck | `npm run typecheck` | Yes |
| Build | `npm run build` | Yes |
| Package smoke | `npm run smoke:package` | Yes |
| Architecture | incluidos en Gateway tests (phase51–64) | Yes |
| Windows layout | `npm run package:windows` (+ validate) | Yes (proxy) |
| APK assemble | `./gradlew :app:assembleDebug` | Yes (artifact) |

## B. Real Windows validation (field)

| Check | Status needed |
|-------|---------------|
| Fresh Windows / VM, no repo copy | Required |
| `PersonalAgent-Setup.exe` install | Required |
| Gateway/Node/Desktop under Programs | Required |
| `%LOCALAPPDATA%\Ideass\PersonalAgent\` paths | Required |
| agentId persistence across restarts | Required |
| Tailscale MISSING→AUTH→CONNECTED→READY | Required |
| NETWORK_READY before runtime | Required |
| Gateway/Node from installed product (not `npm run dev`) | Required |
| MCP handshake + tools/list + capability sync | Required |
| Capability real via node-local | Required |

## C. Real Android validation (field)

| Check | Status needed |
|-------|---------------|
| APK on **physical** device | Required |
| Camera QR scan (CameraX / ML Kit) | Required |
| PairingQrParser validation | Required |
| Desktop confirm → TrustedDevice | Required |
| authKind=device | Required |
| WebSocket over Tailscale | Required |
| Agent message → Capability → Result | Required |
| ArtifactReference + HTTP download | Required (product) |

## D. Recovery validation (field)

| Check | Status needed |
|-------|---------------|
| Gateway restart (data preserved) | Required |
| Node restart (unavailable → rediscovery) | Required |
| Windows reboot | Required |
| Android network loss/restore (no re-pair) | Required |
| Security scan logs (0 secret leaks) | Required |

## Separation rule

```text
A = automated (this environment can execute)
B+C+D = product field gate (Windows + physical Android + Tailscale)
PHASE 65 PASS requires A AND B AND C AND (D as specified)
A alone → BLOCKED, not PASS
```
