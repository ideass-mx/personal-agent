/**
 * WindowsCredentialStore — encapsula Windows Credential Manager (Generic).
 * El resto del producto no conoce CredWrite/CredRead.
 * En plataformas no-Windows: no usar (factory elige encrypted file).
 */
import { spawnSync } from "node:child_process";
import type { SecretStore } from "../types.ts";
import { assertSafeCredentialId } from "../types.ts";

const TARGET_PREFIX = "PersonalAgent/cred/";

function targetName(credentialId: string): string {
  return `${TARGET_PREFIX}${credentialId}`;
}

/** Script PowerShell embebido: CredWrite / CredRead / CredDelete vía advapi32. */
const PS_TYPE = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class PaWinCred {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public UInt32 Flags;
    public UInt32 Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredWrite([In] ref CREDENTIAL userCredential, [In] UInt32 flags);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credentialPtr);
  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern bool CredFree(IntPtr cred);
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredDelete(string target, UInt32 type, UInt32 flags);
}
"@
`;

function runPowerShell(script: string): { ok: boolean; stdout: string; stderr: string } {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    { encoding: "utf8", windowsHide: true, timeout: 30_000 },
  );
  return {
    ok: result.status === 0,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

export class WindowsCredentialStore implements SecretStore {
  constructor() {
    if (process.platform !== "win32") {
      throw new Error(
        "WindowsCredentialStore solo está disponible en win32",
      );
    }
  }

  async put(credentialId: string, secret: string): Promise<void> {
    const id = assertSafeCredentialId(credentialId);
    if (typeof secret !== "string" || secret.length === 0) {
      throw new Error("SecretStore.put: secret vacío");
    }
    const target = targetName(id);
    const b64 = Buffer.from(secret, "utf8").toString("base64");
    // Pasar secreto solo como Base64 en script; no loguear.
    const script = `
$ErrorActionPreference = 'Stop'
${PS_TYPE}
$bytes = [Convert]::FromBase64String(${JSON.stringify(b64)})
$ptr = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
try {
  [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
  $cred = New-Object PaWinCred+CREDENTIAL
  $cred.Type = 1
  $cred.TargetName = ${JSON.stringify(target)}
  $cred.CredentialBlobSize = [UInt32]$bytes.Length
  $cred.CredentialBlob = $ptr
  $cred.Persist = 2
  $cred.UserName = 'PersonalAgent'
  $ok = [PaWinCred]::CredWrite([ref]$cred, 0)
  if (-not $ok) { throw "CredWrite failed" }
} finally {
  [Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
}
Write-Output 'OK'
`;
    const r = runPowerShell(script);
    if (!r.ok || !r.stdout.includes("OK")) {
      throw new Error(
        `WindowsCredentialStore.put falló (sin detalle de secreto)`,
      );
    }
  }

  async get(credentialId: string): Promise<string | null> {
    const id = assertSafeCredentialId(credentialId);
    const target = targetName(id);
    const script = `
$ErrorActionPreference = 'Stop'
${PS_TYPE}
$ptr = [IntPtr]::Zero
$ok = [PaWinCred]::CredRead(${JSON.stringify(target)}, 1, 0, [ref]$ptr)
if (-not $ok) {
  Write-Output 'MISSING'
  exit 0
}
try {
  $cred = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][PaWinCred+CREDENTIAL])
  $size = [int]$cred.CredentialBlobSize
  $bytes = New-Object byte[] $size
  [Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $size)
  Write-Output ([Convert]::ToBase64String($bytes))
} finally {
  [PaWinCred]::CredFree($ptr) | Out-Null
}
`;
    const r = runPowerShell(script);
    if (!r.ok) {
      throw new Error("WindowsCredentialStore.get falló");
    }
    if (r.stdout === "MISSING" || r.stdout === "") return null;
    return Buffer.from(r.stdout, "base64").toString("utf8");
  }

  async delete(credentialId: string): Promise<void> {
    const id = assertSafeCredentialId(credentialId);
    const target = targetName(id);
    const script = `
$ErrorActionPreference = 'Stop'
${PS_TYPE}
[void][PaWinCred]::CredDelete(${JSON.stringify(target)}, 1, 0)
Write-Output 'OK'
`;
    const r = runPowerShell(script);
    if (!r.ok) {
      // Idempotente: credencial ausente no es error fatal.
      return;
    }
  }
}
