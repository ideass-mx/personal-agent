# Windows Installer CI (GitHub Actions)

**Estado:** documentado para packaging CI
**Fecha:** 2026-09-04 (Fase 7.5 versioning)

## Qué hace el workflow

Archivo: [`.github/workflows/windows-installer.yml`](../../.github/workflows/windows-installer.yml)

En un runner **`windows-latest`**:

1. Checkout del repositorio
2. Node.js **22**
3. `npm ci` en protocol / gateway / node / web
4. `FETCH_NODE_WIN=1` + `FETCH_ELECTRON_WIN=1` → `npm run package:windows`
   (escribe `build-info.json` + `version.generated.iss` desde SemVer raíz)
5. Validación de layout + natives PE (PHASE 64.1)
6. Tests de arquitectura PHASE 51
7. `npm run smoke:package`
8. Inno Setup 6 → Setup versionado
9. `npm run finalize:installer` → `.sha256` + `dist/releases/…`
10. Artifact con nombre versionado (no sobrescribe releases distintas)

**No** crea GitHub Releases todavía.
**No** instala ni valida en PC física.

## Nombres de artefacto

Release (tag `v0.1.0`):

```text
PersonalAgent-Setup-0.1.0-win-x64.exe
PersonalAgent-Setup-0.1.0-win-x64.exe.sha256
```

Dev (`workflow_dispatch`):

```text
PersonalAgent-Setup-0.1.0-dev.<build>-win-x64.exe
```

Ver [release-versioning.md](./release-versioning.md).

## Cómo ejecutarlo

```bash
gh workflow run windows-installer.yml --ref main
gh run watch
```

También se dispara al push de tags `v*`.

## Qué significa PASS

- Layout empaquetado con runtimes embebidos
- Natives win32 PE
- Setup.exe ≥ ~40MB con nombre versionado
- Checksum SHA-256 presente

Field install Windows = **NOT_EXECUTED** en este workflow.
