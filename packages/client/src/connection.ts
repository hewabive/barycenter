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

export function connect(options: ConnectionOptions): Connection {
  const key = `barycenter:${options.url}:${options.room}`;
  let socket: WebSocket | null = null;
  let attempt = 0;

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
    options.onStatus("connecting", "Connecting");
    const current = new WebSocket(options.url);
    socket = current;

    current.addEventListener("open", join);

    current.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === "welcome") {
        attempt = 0;
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
        options.onStatus("closed", "This game was opened in another window");
        return;
      }
      options.onStatus("closed", "Connection lost, retrying");
      const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
      attempt += 1;
      setTimeout(open, delay);
    });
  };

  open();
  return { send };
}
