/**
 * Launch helpers for packaged Windows product (Fase 7.6).
 * Primary entry: Electron.exe directly (no CMD).
 * AgentePersonal.bat remains a detach fallback only.
 */
export function electronShortcutParameters() {
  // Inno {app} expands at install time; quoted desktop folder is Electron app path.
  return '"{app}\\desktop"';
}

export function electronShortcutFilename() {
  return "{app}\\runtime\\electron\\electron.exe";
}

/** Content of silent-ish bat: start detaches Electron so closing CMD does not kill the app. */
export function buildAgentePersonalBat() {
  return [
    "@echo off",
    "setlocal",
    "set \"ROOT=%~dp0\"",
    "set \"PERSONAL_AGENT_PRODUCT_ROOT=%ROOT%\"",
    "set \"NODE_EXE=%ROOT%runtime\\node\\node.exe\"",
    "set \"ELECTRON_EXE=%ROOT%runtime\\electron\\electron.exe\"",
    "if not exist \"%ELECTRON_EXE%\" (",
    "  echo [Personal Agent] Falta Electron embebido ^(runtime\\electron\\electron.exe^).",
    "  echo Reinstala con el instalador oficial. No uses npm en esta PC.",
    "  exit /b 1",
    ")",
    "if not exist \"%NODE_EXE%\" (",
    "  echo [Personal Agent] Falta Node embebido ^(runtime\\node\\node.exe^).",
    "  echo Reinstala con el instalador oficial. No uses npm en esta PC.",
    "  exit /b 1",
    ")",
    "REM Detach Electron from this console so closing CMD cannot kill the agent.",
    "start \"\" \"%ELECTRON_EXE%\" \"%ROOT%desktop\"",
    "exit /b 0",
    "",
  ].join("\r\n");
}

/**
 * VBS launcher: no console window at all (WScript).
 * Preferred for manual double-click if shortcuts are missing.
 */
export function buildAgentePersonalVbs() {
  return [
    "' Personal Agent silent launcher (no console window).",
    "' Prefer Start Menu / Desktop shortcuts that target electron.exe directly.",
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'Set sh = CreateObject("WScript.Shell")',
    "root = fso.GetParentFolderName(WScript.ScriptFullName)",
    'electron = root & "\\runtime\\electron\\electron.exe"',
    'desktop = root & "\\desktop"',
    "If Not fso.FileExists(electron) Then",
    '  MsgBox "No pudimos iniciar Personal Agent. Reinstala la aplicacion.", 16, "Agente personal"',
    "  WScript.Quit 1",
    "End If",
    'sh.Environment("PROCESS")("PERSONAL_AGENT_PRODUCT_ROOT") = root & "\\"',
    'sh.Run """" & electron & """ """ & desktop & """", 1, False',
    "",
  ].join("\r\n");
}
