# PHASE 64.1 — AUDIT (Windows Packaging Hardening)

Fecha: 2026-09-04.

## Problema

`scripts/package.mjs` copia `gateway/node_modules/better-sqlite3` tal cual del host.

```text
Linux host → npm install → better_sqlite3.node (ELF)
  → package:windows → dist/windows/PersonalAgent/gateway/node_modules/.../better_sqlite3.node
  → Inno Setup (si se compilara) → Setup.exe inválido en Windows
```

Hoy **no** hay validación de magic bytes PE/ELF en el pipeline.

## Dónde se genera el layout

| Paso | Script | Output |
|------|--------|--------|
| esbuild + copy natives | `scripts/package.mjs` → `pack()` | `dist/gateway`, `dist/node`, … |
| Assemble Windows tree | `scripts/package-windows.mjs` → `packageWindows()` | `dist/windows/PersonalAgent/` |
| Validate layout | `scripts/validate-windows-package.mjs` | Re-ejecuta `packageWindows()` + checks |
| Installer | Inno `installer/windows/personal-agent.iss` | `PersonalAgent-Setup.exe` |
| CI canónico | `.github/workflows/windows-installer.yml` | `windows-latest` |

## Dónde entra better-sqlite3

`package.mjs` `copyNativeTree(gateway/node_modules/better-sqlite3 → dist/.../node_modules/better-sqlite3)`.

También puede existir `winax` bajo `node/`.

## Target Windows actual

- Runtimes: `FETCH_NODE_WIN` / `FETCH_ELECTRON_WIN` → `node.exe` / `electron.exe`.
- Natives: implícitos del host de `npm ci` (correcto solo en **windows-latest**).
- No hay detección PE previa.

## Dónde debe validar

1. Al final de `packageWindows()` (fail-closed antes de considerar el layout “release-ready”).
2. En `validate:windows-package` (explícito).
3. En CI **antes** de ISCC (vía validate o paso dedicado).

## Conclusión

Añadir detector magic-byte + scan `**/*.node` bajo `dist/windows/PersonalAgent/`.  
Sin tocar Gateway/Node/Runtime/MCP/Android.
