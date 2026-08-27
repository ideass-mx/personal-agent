; Personal Agent — Inno Setup script (PHASE 51)
; Compile on Windows with Inno Setup 6+.
; Source root: dist\windows\PersonalAgent\ (from: node scripts/package-windows.mjs)
;
; Prerequisites before compiling:
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
#define SourceRoot "..\..\dist\windows\PersonalAgent"

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
function InitializeSetup(): Boolean;
var
  NodePath, ElectronPath, ConsolePath: String;
begin
  Result := True;
  NodePath := ExpandConstant('{#SourceRoot}\runtime\node\node.exe');
  ElectronPath := ExpandConstant('{#SourceRoot}\runtime\electron\electron.exe');
  ConsolePath := ExpandConstant('{#SourceRoot}\console\index.html');
  if not FileExists(NodePath) then
  begin
    MsgBox('Falta runtime\node\node.exe en el paquete.' + #13#10 +
           'Ejecuta package-windows con FETCH_NODE_WIN=1 antes de compilar.',
           mbError, MB_OK);
    Result := False;
    exit;
  end;
  if not FileExists(ElectronPath) then
  begin
    MsgBox('Falta runtime\electron\electron.exe en el paquete.' + #13#10 +
           'Ejecuta package-windows con FETCH_ELECTRON_WIN=1 antes de compilar.' + #13#10 +
           'El usuario final NO debe usar npm.',
           mbError, MB_OK);
    Result := False;
    exit;
  end;
  if not FileExists(ConsolePath) then
  begin
    MsgBox('Falta Agent Console (console\index.html) en el paquete.', mbError, MB_OK);
    Result := False;
    exit;
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
