import { randomInt } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import {
  type ClientMessage,
  PROTOCOL,
  parseClientMessage,
  type ServerMessage,
  type Setup,
} from "@barycenter/protocol";
import { type WebSocket, WebSocketServer } from "ws";
import { Room, type RoomOptions, unknownRival } from "./room.ts";
import { loadSave, setAside, writeSave } from "./saves.ts";
import { createStaticHandler } from "./static.ts";

export interface ServerOptions {
  port: number;
  host: string;
  tuning: boolean;
  saves: string | null;
  client: string | null;
  tickRate: number;
  seed: number | null;
}

export interface RunningServer {
  port: number;
  close(): Promise<void>;
}

interface Entry {
  room: Room;
  sockets: Map<number, WebSocket>;
  savedAt: number;
}

type Opened = Entry | { error: string };

const DEFAULT_RIVALS = ["aggressor", "builder"];
const PUMP_INTERVAL = 20;
const SAVE_EVERY = 1000;
const SNAPSHOTS = "snapshots";
const MAX_PAYLOAD = 64 * 1024;
const COMPRESS_FROM = 1024;
const MAX_MESSAGES_PER_SECOND = 60;
const WIRE_PRECISION = 10_000;
const REPLACED = 4000;
const FLOODING = 4001;

function encode(message: ServerMessage): string {
  return JSON.stringify(message, (_key, value) =>
    typeof value === "number" ? Math.round(value * WIRE_PRECISION) / WIRE_PRECISION : value,
  );
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(encode(message));
  }
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const rooms = new Map<string, Promise<Opened>>();

  const persist = async (entry: Entry): Promise<void> => {
    if (options.saves === null) {
      return;
    }
    entry.savedAt = entry.room.tick;
    try {
      await writeSave(options.saves, entry.room.options.id, entry.room.save());
    } catch (error) {
      process.stderr.write(`Could not save room ${entry.room.options.id}: ${String(error)}\n`);
    }
  };

  const capture = async (
    entry: Entry,
    seat: number,
    selected: number | null,
  ): Promise<ServerMessage> => {
    if (options.saves === null) {
      return { type: "error", reason: "snapshots are disabled" };
    }
    const snapshot = entry.room.snapshot(seat, selected);
    const name = snapshot.options.id;
    try {
      await writeSave(join(options.saves, SNAPSHOTS), name, snapshot);
      return { type: "snapshot", name };
    } catch (error) {
      process.stderr.write(`Could not write snapshot ${name}: ${String(error)}\n`);
      return { type: "error", reason: "snapshot could not be written" };
    }
  };

  const create = async (id: string, setup: Setup | null): Promise<Opened> => {
    const sockets = new Map<number, WebSocket>();
    const sink = (seat: number, message: ServerMessage) => {
      const socket = sockets.get(seat);
      if (socket !== undefined) {
        send(socket, message);
      }
    };
    if (options.saves !== null) {
      try {
        const saved = await loadSave(options.saves, id);
        const room = saved === null ? null : Room.restore(saved, options.tuning, sink);
        if (room !== null) {
          return { room, sockets, savedAt: room.tick };
        }
        if (saved !== null) {
          await setAside(options.saves, id);
        }
      } catch {
        return { error: "saved room could not be read" };
      }
    }
    const rivals = setup?.rivals ?? DEFAULT_RIVALS;
    const unknown = unknownRival(rivals);
    if (unknown !== null) {
      return { error: `unknown doctrine ${unknown}` };
    }
    const roomOptions: RoomOptions = {
      id,
      seed: setup?.seed ?? options.seed ?? randomInt(2 ** 31),
      humans: 1,
      rivals,
      tuning: options.tuning,
      tickRate: options.tickRate,
    };
    return { room: new Room(roomOptions, sink), sockets, savedAt: 0 };
  };

  const open = (id: string, setup: Setup | null): Promise<Opened> => {
    const existing = rooms.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const opening = create(id, setup);
    rooms.set(id, opening);
    opening.then((opened) => {
      if ("error" in opened) {
        rooms.delete(id);
      }
    });
    return opening;
  };

  const entries = async (): Promise<Entry[]> => {
    const opened = await Promise.all(rooms.values());
    return opened.filter((item): item is Entry => "room" in item);
  };

  const http = createServer(createStaticHandler(options.client));
  const sockets = new WebSocketServer({
    server: http,
    maxPayload: MAX_PAYLOAD,
    perMessageDeflate: { threshold: COMPRESS_FROM },
  });

  sockets.on("connection", (socket) => {
    let entry: Entry | null = null;
    let seat = -1;
    let joining = false;
    let windowStart = 0;
    let received = 0;

    const enter = async (message: Extract<ClientMessage, { type: "join" }>) => {
      if (message.protocol !== PROTOCOL) {
        send(socket, { type: "error", reason: "unsupported protocol version" });
        return;
      }
      const opened = await open(message.room, message.setup);
      if ("error" in opened) {
        send(socket, { type: "error", reason: opened.error });
        return;
      }
      const joined = opened.room.join(message.seat, message.token);
      if ("error" in joined) {
        send(socket, { type: "error", reason: joined.error });
        return;
      }
      const previous = opened.sockets.get(joined.seat);
      if (socket.readyState !== socket.OPEN) {
        if (previous === undefined) {
          opened.room.leave(joined.seat);
        }
        return;
      }
      opened.sockets.set(joined.seat, socket);
      previous?.close(REPLACED, "replaced by a newer connection");
      entry = opened;
      seat = joined.seat;
      send(socket, opened.room.welcome(seat));
    };

    socket.on("message", (data, binary) => {
      const now = performance.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        received = 0;
      }
      received += 1;
      if (received > MAX_MESSAGES_PER_SECOND) {
        socket.close(FLOODING, "too many messages");
        return;
      }
      const message = binary ? null : parseClientMessage(data.toString());
      if (message === null) {
        send(socket, { type: "error", reason: "malformed message" });
        return;
      }
      if (entry !== null) {
        if (message.type === "snapshot") {
          void capture(entry, seat, message.selected).then((reply) => send(socket, reply));
        } else {
          entry.room.handle(seat, message);
        }
        return;
      }
      if (message.type !== "join" || joining) {
        send(socket, { type: "error", reason: "join a room first" });
        return;
      }
      joining = true;
      enter(message)
        .catch(() => send(socket, { type: "error", reason: "could not join the room" }))
        .finally(() => {
          joining = false;
        });
    });

    socket.on("close", () => {
      if (entry === null || entry.sockets.get(seat) !== socket) {
        return;
      }
      entry.sockets.delete(seat);
      entry.room.leave(seat);
      if (!entry.room.occupied) {
        void persist(entry);
      }
    });

    socket.on("error", () => {
      socket.terminate();
    });
  });

  let last = performance.now();
  let pumping = false;
  const timer = setInterval(async () => {
    if (pumping) {
      return;
    }
    pumping = true;
    try {
      const now = performance.now();
      const elapsed = now - last;
      last = now;
      for (const entry of await entries()) {
        entry.room.pump(elapsed);
        if (entry.room.tick - entry.savedAt >= SAVE_EVERY) {
          void persist(entry);
        }
      }
    } finally {
      pumping = false;
    }
  }, PUMP_INTERVAL);

  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(options.port, options.host, resolve);
  });

  return {
    port: (http.address() as AddressInfo).port,
    async close() {
      clearInterval(timer);
      for (const entry of await entries()) {
        await persist(entry);
      }
      for (const socket of sockets.clients) {
        socket.terminate();
      }
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
