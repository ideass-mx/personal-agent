import { useCallback, useEffect, useState } from "react";
import {
  listTrustedDevices,
  revokeTrustedDevice,
  type TrustedDeviceDto,
} from "../../api/devices";

function platformLabel(platform: string | null): string {
  if (!platform) return "Dispositivo";
  const p = platform.toLowerCase();
  if (p.includes("android")) return "Android";
  if (p.includes("ios") || p.includes("iphone")) return "iOS";
  if (p.includes("win")) return "Windows";
  if (p.includes("mac") || p.includes("darwin")) return "macOS";
  if (p.includes("linux")) return "Linux";
  if (p.includes("browser") || p.includes("web")) return "Navegador";
  return platform;
}

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  try {
    return new Intl.DateTimeFormat("es", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(t));
  } catch {
    return iso;
  }
}

type Props = {
  httpBase: string;
  token: string;
  currentDeviceId?: string;
};

export function TrustedDevicesPanel({
  httpBase,
  token,
  currentDeviceId,
}: Props) {
  const [devices, setDevices] = useState<TrustedDeviceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<TrustedDeviceDto | null>(
    null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listTrustedDevices(httpBase, token);
      setDevices(rows);
    } catch (e) {
      const code = e instanceof Error ? e.message : "error";
      setError(
        code === "unauthorized" || code === "devices_401"
          ? "Inicia sesión en el host para gestionar dispositivos."
          : code === "install_compat_required"
            ? "Se requiere la sesión del host para esta acción."
            : "No se pudieron cargar los dispositivos.",
      );
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [httpBase, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function confirmRevoke() {
    if (!pendingRevoke) return;
    const target = pendingRevoke;
    setBusyId(target.deviceId);
    setPendingRevoke(null);
    try {
      await revokeTrustedDevice(httpBase, token, target.deviceId);
      await reload();
    } catch {
      setError("No se pudo revocar el dispositivo.");
    } finally {
      setBusyId(null);
    }
  }

  const active = devices.filter((d) => d.status === "ACTIVE");
  const revoked = devices.filter((d) => d.status === "REVOKED");

  return (
    <div className="trusted-devices">
      <h3 className="trusted-devices-title">Dispositivos</h3>
      <p className="muted lead">
        Estos son los dispositivos que pueden acceder a tu Personal Agent.
      </p>

      {loading ? <p className="muted">Cargando…</p> : null}
      {error ? <p className="settings-error">{error}</p> : null}

      {!loading && !error && active.length === 0 && revoked.length === 0 ? (
        <p className="muted">Aún no hay dispositivos vinculados.</p>
      ) : null}

      <div className="trusted-device-list">
        {active.map((d) => {
          const isCurrent = Boolean(
            currentDeviceId && d.deviceId === currentDeviceId,
          );
          const title = d.name?.trim() || platformLabel(d.platform);
          const last = formatWhen(d.lastSeen);
          return (
            <div key={d.deviceId} className="trusted-device-card">
              <div className="trusted-device-main">
                <strong>{isCurrent ? `Este dispositivo · ${title}` : title}</strong>
                <p className="muted">
                  {platformLabel(d.platform)}
                  {" · "}
                  {isCurrent ? "Actual · " : ""}
                  Activo
                  {last ? ` · Última actividad ${last}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="btn-danger-outline"
                disabled={busyId === d.deviceId}
                onClick={() => setPendingRevoke(d)}
              >
                Revocar
              </button>
            </div>
          );
        })}
      </div>

      {revoked.length > 0 ? (
        <div className="trusted-device-list trusted-device-revoked">
          <p className="muted" style={{ fontSize: 13 }}>
            Revocados
          </p>
          {revoked.map((d) => (
            <div key={d.deviceId} className="trusted-device-card is-revoked">
              <div className="trusted-device-main">
                <strong>{d.name?.trim() || platformLabel(d.platform)}</strong>
                <p className="muted">
                  {platformLabel(d.platform)} · Revocado
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {pendingRevoke ? (
        <div className="trusted-device-modal" role="dialog" aria-modal="true">
          <div className="trusted-device-modal-card">
            <h4>¿Revocar este dispositivo?</h4>
            <p>
              El dispositivo dejará de tener acceso a tu Personal Agent. Podrás
              volver a vincularlo posteriormente.
            </p>
            {currentDeviceId &&
            pendingRevoke.deviceId === currentDeviceId ? (
              <p className="settings-error">
                Estás a punto de revocar el dispositivo que usas ahora. Esta
                sesión terminará.
              </p>
            ) : null}
            <div className="trusted-device-modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPendingRevoke(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => void confirmRevoke()}
              >
                Revocar dispositivo
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
