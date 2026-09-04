# Release & Installer Versioning (Fase 7.5)

**Estado:** IMPLEMENTED  
**Fecha:** 2026-09-04

## Fuente canónica

```text
package.json (raíz) → "version": "0.1.0"  (SemVer MAJOR.MINOR.PATCH)
```

No duplicar la versión a mano en Inno / Desktop / Gateway.

## Identidades

| Campo | Ejemplo | Significado |
|-------|---------|-------------|
| version | `0.1.0` | Release SemVer |
| build | `20260904.42` | Compilación (CI run o timestamp local) |
| commit | `abc1234` | Git SHA corto |
| channel | `release` \| `dev` | Tag `v*` / `PERSONAL_AGENT_RELEASE=1` → release |

## Artefactos

```text
PersonalAgent-Setup-0.1.0-win-x64.exe          # release
PersonalAgent-Setup-0.1.0-dev.20260904.42-win-x64.exe  # dev
+ .sha256
dist/releases/v0.1.0/…                        # release folder
dist/releases/dev-0.1.0-<build>/…             # dev folder
```

`AppId` Inno **estable** (`{{A8E5C2F1-…PERSONALAGENT51}}`) → upgrades del mismo producto.

## Generación

1. `npm run package:windows` → `build-info.json`, `VERSION`, `installer/windows/version.generated.iss`
2. ISCC `personal-agent.iss` (incluye defines generados)
3. `npm run finalize:installer` → SHA-256 + `dist/releases/…`

## Runtime

- Gateway `/health` incluye `version`, `build`, `commit`, `platform`, `architecture`, `builtAt`
- Desktop diagnostics lee `build-info.json` del product root

## Tags oficiales

```text
v0.1.0
v0.1.1
```

Sin auto-update en esta fase.
