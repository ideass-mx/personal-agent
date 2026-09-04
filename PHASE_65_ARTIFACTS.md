# PHASE 65 — ARTIFACTS

Fecha (UTC): 2026-09-04T09:07:00Z  
Host de build: Linux `ironman` (no Inno Setup / no Setup.exe).

## Gateway / Node (esbuild)

| Artifact | Path | Version | SHA-256 |
|----------|------|---------|---------|
| Gateway | `dist/gateway/gateway.cjs` | product 0.1.0 | `e3663e8f1748227b166148c38a203dde073a7d6a524128795b96bf857aafe999` |
| Node | `dist/node/node.cjs` | product 0.1.0 | `3003c065f8defb846bf5306327b6c0e3901fbdf56916b409aee6dbd221354f83` |

Cómo: `npm run build` / incluido en `package` / `package:windows`.

## Windows product layout

| Artifact | Path | Notes |
|----------|------|-------|
| Layout | `dist/windows/PersonalAgent/` | `runtimeReady=true` |
| VERSION | `dist/windows/PersonalAgent/VERSION` | `0.1.0-phase51` |
| Manifest | `dist/windows/PersonalAgent/manifest.json` | phase 51 metadata |
| Launcher | `…/AgentePersonal.bat` | SHA-256 `50369b1381906ecd15808b462e46fb3753f169ca695d799600c71e3cf44e2f89` |
| Node runtime | `…/runtime/node/node.exe` | Node v22.14.0 win-x64 (fetched) |
| Electron | `…/runtime/electron/electron.exe` | Electron v33.4.11 win32-x64 (fetched) |
| Setup.exe | **NOT PRODUCED** | Requires Inno Setup `ISCC` on Windows / GH Actions |

Cómo:

```bash
FETCH_NODE_WIN=1 FETCH_ELECTRON_WIN=1 npm run package:windows
FETCH_NODE_WIN=1 FETCH_ELECTRON_WIN=1 REQUIRE_WINDOWS_RUNTIMES=1 npm run validate:windows-package
```

Validate result: **PASS** (layout + runtimes; labeled “not Windows field”).

## Android APK

| Artifact | Path | Size | SHA-256 |
|----------|------|------|---------|
| Debug APK | `mobile/android/app/build/outputs/apk/debug/app-debug.apk` | ~97 MB | `e2718498cafa9ee71f0fc04ecbe3692a8f83063758357f833a1c308f1020e7b3` |

Cómo: `cd mobile/android && ./gradlew :app:assembleDebug :app:testDebugUnitTest`  
Nota: **debug** APK (no release-signed). Suficiente para field pairing; no es Play Store release.

## Package smoke

```text
npm run smoke:package → OK (handshake + tools/list + filesystem.read)
```

## No generado en esta sesión

| Artifact | Motivo |
|----------|--------|
| `PersonalAgent-Setup.exe` | Sin ISCC en Linux |
| Release-signed APK | Sin keystore de producto configurado aquí |
| Field install snapshot | Sin Windows limpia |
