/**
 * Trusted Devices client (PHASE 57.6).
 * Same-origin cookie or Bearer install token — never shows secrets in UI.
 */
export type TrustedDeviceDto = {
  deviceId: string;
  name: string | null;
  platform: string | null;
  status: "ACTIVE" | "REVOKED";
  pairedAt: string;
  lastSeen: string | null;
  identityStatus?: "legacy" | "crypto_enrolled";
  hasPublicKey?: boolean;
};

function authHeaders(token: string): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (token.trim()) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function listTrustedDevices(
  base: string,
  token: string,
): Promise<TrustedDeviceDto[]> {
  const res = await fetch(`${base}/v1/devices`, {
    headers: authHeaders(token),
    credentials: "same-origin",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    const code = body?.error?.code || `devices_${res.status}`;
    throw new Error(code);
  }
  const json = (await res.json()) as {
    ok?: boolean;
    devices?: TrustedDeviceDto[];
  };
  return Array.isArray(json.devices) ? json.devices : [];
}

export async function revokeTrustedDevice(
  base: string,
  token: string,
  deviceId: string,
): Promise<{
  ok: true;
  deviceId: string;
  status: string;
  alreadyRevoked: boolean;
}> {
  const res = await fetch(
    `${base}/v1/devices/${encodeURIComponent(deviceId)}/revoke`,
    {
      method: "POST",
      headers: authHeaders(token),
      credentials: "same-origin",
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    deviceId?: string;
    status?: string;
    alreadyRevoked?: boolean;
    error?: { code?: string; message?: string };
  };
  if (!res.ok || !json.ok) {
    throw new Error(json.error?.code || `revoke_${res.status}`);
  }
  return {
    ok: true,
    deviceId: json.deviceId || deviceId,
    status: json.status || "REVOKED",
    alreadyRevoked: Boolean(json.alreadyRevoked),
  };
}
