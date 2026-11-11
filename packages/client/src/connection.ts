import { type ClientMessage, PROTOCOL, type ServerMessage, type Setup } from "@barycenter/protocol";

export type LinkStatus = "connecting" | "open" | "closed";

export interface ConnectionOptions {
  url: string;
  room: string;
  setup: Setup | null;
  onMessage(message: ServerMessage): void;
  onStatus(status: LinkStatus, detail: string): void;
}

export interface Connection {
  send(message: ClientMessage): void;
}

interface Claim {
  seat: number;
  token: string;
}

const REPLACED = 4000;
const RETRY_DELAYS = [500, 1000, 2000, 5000];
const DOUBTFUL_AFTER = 30_000;

export function connect(options: ConnectionOptions): Connection {
  const key = `barycenter:${options.url}:${options.room}`;
  let socket: WebSocket | null = null;
  let abandoned: WebSocket | null = null;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let hiddenAt: number | null = null;
  let replaced = false;

  const remembered = (): Claim | null => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? null : (JSON.parse(stored) as Claim);
    } catch {
      return null;
    }
  };

  const send = (message: ClientMessage) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const join = () => {
    const claim = remembered();
    send({
      type: "join",
      protocol: PROTOCOL,
      room: options.room,
      seat: claim?.seat ?? null,
      token: claim?.token ?? null,
      setup: options.setup,
    });
  };

  const open = () => {
    retry = null;
    options.onStatus("connecting", "Connecting");
    const current = new WebSocket(options.url);
    socket = current;

    current.addEventListener("open", join);

    current.addEventListener("message", (event) => {
      if (socket !== current) {
        return;
      }
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === "welcome") {
        attempt = 0;
        abandoned?.close();
        abandoned = null;
        const claim: Claim = { seat: message.seat, token: message.token };
        localStorage.setItem(key, JSON.stringify(claim));
        options.onStatus("open", "");
      }
      if (message.type === "error" && message.reason === "seat is taken" && remembered() !== null) {
        localStorage.removeItem(key);
        join();
        return;
      }
      options.onMessage(message);
    });

    current.addEventListener("close", (event) => {
      if (socket !== current) {
        return;
      }
      if (event.code === REPLACED) {
        replaced = true;
        options.onStatus("closed", "This game was opened in another window");
        return;
      }
      options.onStatus("closed", "Connection lost, retrying");
      const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
      attempt += 1;
      retry = setTimeout(open, delay);
    });
  };

  const revive = () => {
    if (document.visibilityState !== "visible") {
      hiddenAt ??= Date.now();
      return;
    }
    const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    if (replaced) {
      return;
    }
    if (retry !== null) {
      clearTimeout(retry);
      open();
    } else if (away >= DOUBTFUL_AFTER && socket?.readyState === WebSocket.OPEN) {
      abandoned = socket;
      open();
    }
  };
  document.addEventListener("visibilitychange", revive);
  window.addEventListener("pageshow", revive);
  window.addEventListener("online", revive);

  open();
  return { send };
}
