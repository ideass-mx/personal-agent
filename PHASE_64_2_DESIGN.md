# PHASE 64.2 — DESIGN (Windows Installer CI Optimization)

## Principio

PHASE 64.2 es **solo** optimización/hardening del CI del instalador Windows.  
No modifica arquitectura de producto, runtime, MCP, Agent Runtime, Capability Model, Artifact, ObjectStorage ni Android.

---

## Flujo final del job

```text
Windows Installer CI (windows-latest)
│
├── checkout
├── setup-node 22 + cache npm (intacta)
├── diagnostics + Electron asset HEAD
│
├── npm ci protocol          [timed]
├── npm ci gateway           [timed]
│     └── better-sqlite3 → prebuild win32 / PE
├── npm ci node              [timed]
├── npm ci web               [timed]
│
├── package:windows
│     └── dist/windows/PersonalAgent/
│
├── validate:windows-package
│     └── *.node == PE (PHASE 64.1)
├── assertWindowsNativeModules (explícito)
├── phase51 architecture tests
├── smoke:package
├── choco Inno Setup 6
└── ISCC
      └── PersonalAgent-Setup.exe
```

`packages/workspace-http` **no** aparece como dependencia de instalación del Windows Installer.

---

## Timing (PowerShell)

Cada `npm ci` restante emite:

```text
[windows-installer] npm ci <label> START
[windows-installer] npm ci <label> END: hh:mm:ss
[windows-installer] <label> npm ci duration: <TimeSpan>
```

Implementación: `[System.Diagnostics.Stopwatch]` nativo — sin paquetes npm adicionales.

Labels: `protocol` | `gateway` | `node` | `web`.

---

## Invariantes preservadas

| Invariante | Estado |
|------------|--------|
| gateway `npm ci` en Windows | PRESERVED |
| better-sqlite3 nativo Windows | PRESERVED |
| validate PE / reject ELF·Mach-O | PRESERVED |
| Inno / ISCC gate | PRESERVED |
| npm cache setup-node | PRESERVED |
| lockfiles / versiones deps | UNCHANGED |

---

## Validación (local) — ejecutada

| Check | Resultado |
|-------|-----------|
| YAML válido + sin workspace-http npm ci | PASS |
| Timings Stopwatch protocol/gateway/node/web | PASS |
| `npm run test:packaging` | PASS |
| phase64.1 + phase51 architecture | PASS |
| typecheck gateway/node, build, smoke:package | PASS |

---

## Relación con fases

| Fase | Rol |
|------|-----|
| 64.1 | Gate PE de `*.node` en packaging |
| 64.2 | Quitar `npm ci` redundante + medir tiempos en CI |
| 65 | Validación de campo Windows (sin relación directa) |
