# PHASE 64.1 — DESIGN (Windows Native Module Validation)

## Problem

Linux can assemble `dist/windows/PersonalAgent/` containing ELF `.node` modules (e.g. `better_sqlite3.node`). That artifact looks like a Windows package but cannot load natives on Windows.

## Solution

Before treating a Windows layout as installer-eligible, scan all `*.node` files and require **PE** format for target `windows-x64`.

## Contract

```text
Windows target
  + native module found
  + PE validation
  = installer eligible

Windows target
  + native module found
  + ELF | Mach-O | unknown
  = packaging aborted (exit ≠ 0)
```

## Release environment

```text
windows-latest = canonical Windows release environment
```

GitHub Actions builds natives via `npm ci` on Windows, then validates, then ISCC.

## Placement

```text
pack / assemble Windows tree
        ↓
validateNativeModulesForWindows(root)
        ↓
PASS → Inno Setup
FAIL → abort (no Setup.exe from invalid runtime)
```

## Scope

Packaging tooling only (`scripts/`). No Gateway / AgentRuntime / MCP / Artifact / Credential / Android changes.
