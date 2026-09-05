# Startup UX — Host sin CMD / onboarding en Web (Fase 7.6)

**Estado:** IMPLEMENTED  
**Fecha:** 2026-09-04

## Problemas corregidos

1. **Onboarding en Electron** — el default ya era host mode; se endureció para que recrear la ventana (tray) no cargue `renderer/index.html` legacy.
2. **CMD visible** — los accesos del instalador apuntaban a `AgentePersonal.bat`, que abre `cmd.exe` y mantenía vivo el árbol. Si el usuario cerraba CMD, mataba Electron/Gateway.

## Startup nuevo

```text
Start Menu / Desktop shortcut
  → runtime/electron/electron.exe  "{app}\desktop"
  → Electron host mode
  → Gateway (windowsHide)
  → Node (MCP, windowsHide)
  → splash → Web UI → OnboardingWizard
```

## Launchers

| Artefacto | Rol |
|-----------|-----|
| Inno Icons/Run → `electron.exe` + params | **Primario** (sin consola) |
| `AgentePersonal.vbs` | Doble clic silencioso (fallback) |
| `AgentePersonal.bat` | Diagnóstico; usa `start ""` para desacoplar de CMD |

Legacy Electron onboarding: solo con `PERSONAL_AGENT_LEGACY_ONBOARDING=1`.
