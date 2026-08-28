; Personal Agent — Inno Setup script (PHASE 51)
; Compile on Windows with Inno Setup 6+.
; Source root: dist\windows\PersonalAgent\ (from: node scripts/package-windows.mjs)
;
; Prerequisites BEFORE compiling (ISPP checks below):
;   - runtime\node\node.exe
;   - runtime\electron\electron.exe
;   - console\index.html (Agent Console)
;
; DOES NOT embed secrets (.env).
; User data: %LOCALAPPDATA%\Ideass\PersonalAgent\
; Workspace folder is NEVER deleted by uninstall.
; End users must NOT need Node.js, npm, or a terminal.

#define MyAppName "Agente personal"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Ideass"
#define MyAppExeName "AgentePersonal.bat"
; SourcePath = directory of this .iss (trailing backslash). Resolve package layout from there.
#define SourceRoot SourcePath + "..\..\dist\windows\PersonalAgent"

#if !FileExists(SourceRoot + "\runtime\node\node.exe")
  #error "Falta runtime\node\node.exe — ejecuta FETCH_NODE_WIN=1 npm run package:windows antes de ISCC."
#endif
#if !FileExists(SourceRoot + "\runtime\electron\electron.exe")
  #error "Falta runtime\electron\electron.exe — ejecuta FETCH_ELECTRON_WIN=1 npm run package:windows antes de ISCC."
#endif
#if !FileExists(SourceRoot + "\console\index.html")
  #error "Falta Agent Console (console\index.html) en el paquete."
#endif

[Setup]
AppId={{A8E5C2F1-9B47-4D3A-9E21-PERSONALAGENT51}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\PersonalAgent
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\..\dist\windows
OutputBaseFilename=PersonalAgent-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#MyAppName}
CloseApplications=force
InfoBeforeFile=

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear icono en el escritorio"; GroupDescription: "Iconos adicionales:"
Name: "startup"; Description: "Iniciar con Windows"; GroupDescription: "Inicio:"

[Files]
Source: "{#SourceRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Never ship .env secrets — they are not in SourceRoot by design.

[Dirs]
Name: "{localappdata}\Ideass\PersonalAgent\config"
Name: "{localappdata}\Ideass\PersonalAgent\logs"
Name: "{localappdata}\Ideass\PersonalAgent\data"
Name: "{localappdata}\Ideass\PersonalAgent\runtime"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startup

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir Agente personal"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Only leftovers under {app}. Never touch workspace.
Type: filesandordirs; Name: "{app}\desktop\node_modules"

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
begin
  // Post-install: confirm runtimes under the install dir (not the build SourceRoot).
  if CurStep = ssPostInstall then
  begin
    if not FileExists(ExpandConstant('{app}\runtime\node\node.exe')) then
    begin
      MsgBox('Instalación incompleta: falta runtime\node\node.exe bajo la carpeta de instalación.' + #13#10 +
             'Reinstala con el instalador oficial.',
             mbError, MB_OK);
    end
    else if not FileExists(ExpandConstant('{app}\runtime\electron\electron.exe')) then
    begin
      MsgBox('Instalación incompleta: falta runtime\electron\electron.exe bajo la carpeta de instalación.' + #13#10 +
             'Reinstala con el instalador oficial. No uses npm.',
             mbError, MB_OK);
    end;
  end;
end;

function InitializeUninstall(): Boolean;
begin
  Result := True;
  if MsgBox('¿Eliminar también configuración y base de datos locales del agente?' + #13#10 +
            '(La carpeta de trabajo / workspace NUNCA se borra.)',
            mbConfirmation, MB_YESNO) = IDYES then
  begin
    DelTree(ExpandConstant('{localappdata}\Ideass\PersonalAgent\config'), True, True, True);
    DelTree(ExpandConstant('{localappdata}\Ideass\PersonalAgent\data'), True, True, True);
    DelTree(ExpandConstant('{localappdata}\Ideass\PersonalAgent\logs'), True, True, True);
  end;
end;
