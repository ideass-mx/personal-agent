# PHASE 51 — Windows Installation Validation Protocol

**Purpose:** Reproducible checklist for real Windows + Android field validation.  
**This document is the protocol.** Completing rows requires real hardware.

**Session status (Linux packager):** **BLOCKED / NOT TESTED** for all REAL rows below.

Never convert automated packaging/smoke into field PASS.

---

## Environment prerequisites

| Item | Required |
|------|----------|
| Clean Windows 10/11 x64 | Yes |
| No Node.js / npm preinstalled | Yes (success criterion) |
| Inno Setup 6+ (build machine) | Yes to compile Setup |
| `FETCH_NODE_WIN=1 FETCH_ELECTRON_WIN=1` package | Yes before compile |
| Physical Android + same Wi‑Fi | Yes for Android section |
| Microsoft Excel | Only for Excel tool labs |

---

## A. Installation

| Step | Expected | Result |
|------|----------|--------|
| Compile `PersonalAgent-Setup.exe` with Inno | Output in `dist/windows/` | **BLOCKED** (no Windows here) |
| Install on clean PC | Files under `%LOCALAPPDATA%\Programs\PersonalAgent` | **NOT TESTED** |
| Launch without Node/npm | Tray/first-run opens | **NOT TESTED** |
| No terminal required | First-run GUI only | **NOT TESTED** |

## B. First-run → AGENT READY

| Step | Expected | Result |
|------|----------|--------|
| Welcome explains PC / Android / Console | Copy clear | **NOT TESTED** |
| Choose workspace | Persists | **NOT TESTED** |
| Configure Anthropic API key | Secrets in AppData only | **NOT TESTED** |
| Start Agent Host | Boot rows update | **NOT TESTED** |
| AGENT READY | Badge / state | **NOT TESTED** |
| Open Agent Console | `http://127.0.0.1:8787/` | **NOT TESTED** |

## C. Workspace persistence

| Step | Expected | Result |
|------|----------|--------|
| Restart Host | Same `AGENT_FILESYSTEM_ROOT` | **NOT TESTED** |
| Filesystem tools confined | Within workspace | **NOT TESTED** |
| Uninstall | Workspace folder preserved | **NOT TESTED** |

## D. Agent Console

| Step | Expected | Result |
|------|----------|--------|
| Chat | Works | **NOT TESTED** |
| History / Conversations | Works | **NOT TESTED** |
| Capabilities | Six MVP | **NOT TESTED** |
| Tool activity + HITL | Approve/reject | **NOT TESTED** |
| LAN Console from second PC | Bearer/WS auth still required | **NOT TESTED** |

## E. Android

| Step | Expected | Result |
|------|----------|--------|
| Pair with LAN URL + token | Auth OK | **NOT TESTED** |
| Conversation | Works | **NOT TESTED** |
| Tool → HITL → Result | Works | **NOT TESTED** |
| Wrong token | Rejected | **NOT TESTED** |
| Reconnect after disconnect | Works | **NOT TESTED** |

## F. Recovery

| Step | Expected | Result |
|------|----------|--------|
| Gateway restart | READY again | **NOT TESTED** |
| Host restart | Workspace preserved | **NOT TESTED** |
| HITL reject / timeout | No execution | **NOT TESTED** |

## G. Security

| Step | Expected | Result |
|------|----------|--------|
| Unauthenticated HTTP workspace/history | Rejected | **NOT TESTED** |
| Invalid WS token | Rejected | **NOT TESTED** |
| Secrets not in installer / logs | Verified | **NOT TESTED** (layout: no `.env` in package — automated) |

---

## Automated evidence available without Windows

- `npm run package:windows` / `node scripts/validate-windows-package.mjs`
- Layout includes Console, bat without npm, Inno checks for runtimes
- Hub/desktop unit + architecture tests
- Web build / smoke-web

These are **AUTOMATED / MOCK VALIDATION** only.
