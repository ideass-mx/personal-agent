export type ServerMsg =
  | { type: "auth_ok"; deviceId: string }
  | { type: "assistant_chunk"; text: string; conversationId?: string }
  | { type: "assistant_done"; messageId: string; conversationId: string }
  | {
      type: "confirm_request";
      confirmationId: string;
      toolCallId: string;
      toolName: string;
      input: unknown;
      conversationId: string;
    }
  | { type: "pong" }
  | { type: "error"; code: string; message: string; conversationId?: string };

export type WsHandlers = {
  onOpen?: () => void;
  onClose?: () => void;
  onAuthOk?: (deviceId: string) => void;
  onMessage?: (msg: ServerMsg) => void;
  onError?: (err: string) => void;
};

export function toWsUrl(httpBase: string): string {
  if (!httpBase) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/ws`;
  }
  const u = new URL(httpBase);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/ws";
  u.search = "";
  u.hash = "";
  return u.toString();
}

export class HubSocket {
  private ws: WebSocket | null = null;
  private authenticated = false;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly deviceId: string,
    private readonly deviceName: string,
    private readonly handlers: WsHandlers,
  ) {}

  connect(): void {
    this.close();
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.handlers.onOpen?.();
      if (this.token.trim()) {
        ws.send(
          JSON.stringify({
            type: "auth",
            token: this.token,
            deviceId: this.deviceId,
            deviceName: this.deviceName,
          }),
        );
      }
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMsg;
      } catch {
        this.handlers.onError?.("bad_frame");
        return;
      }
      if (msg.type === "auth_ok") {
        this.authenticated = true;
        this.handlers.onAuthOk?.(msg.deviceId);
      }
      this.handlers.onMessage?.(msg);
    };
    ws.onclose = () => {
      this.authenticated = false;
      this.handlers.onClose?.();
    };
    ws.onerror = () => {
      this.handlers.onError?.("ws_error");
    };
  }

  sendUserMessage(text: string, conversationId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authenticated) {
      throw new Error("not_connected");
    }
    this.ws.send(
      JSON.stringify({
        type: "user_message",
        text,
        ...(conversationId ? { conversationId } : {}),
      }),
    );
  }

  sendConfirm(confirmationId: string, approved: boolean): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("not_connected");
    }
    this.ws.send(
      JSON.stringify({
        type: "confirm_response",
        confirmationId,
        approved,
      }),
    );
  }

  ping(): void {
    this.ws?.send(JSON.stringify({ type: "ping" }));
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.authenticated = false;
  }

  get isAuthenticated(): boolean {
    return this.authenticated;
  }
}
