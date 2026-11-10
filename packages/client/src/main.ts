import "./style.css";
import { ROOM_NAME, type ServerMessage, type Setup, SPEEDS } from "@barycenter/protocol";
import type { GameEvent } from "@barycenter/sim";
import { connect } from "./connection.ts";
import { required } from "./dom.ts";
import { createGlobe, type Globe } from "./globe.ts";
import { createJournal } from "./journal.ts";
import { type Game, report } from "./model.ts";
import { createPanel } from "./panel.ts";
import { createTopbar } from "./topbar.ts";
import { createTuning, type Tuning } from "./tuning.ts";

const DEFAULT_PORT = 8787;

const parameters = new URLSearchParams(window.location.search);
const requestedRoom = parameters.get("room") ?? "home";
const room = ROOM_NAME.test(requestedRoom) ? requestedRoom : "home";
const secure = window.location.protocol === "https:";
const sameOrigin = `${secure ? "wss" : "ws"}://${window.location.host}`;
const url =
  parameters.get("server") ??
  (import.meta.env.DEV ? `ws://${window.location.hostname}:${DEFAULT_PORT}` : sameOrigin);

function setupFrom(query: URLSearchParams): Setup | null {
  const seed = query.get("seed");
  const rivals = query.get("rivals");
  if (seed === null && rivals === null) {
    return null;
  }
  return {
    seed: seed === null ? null : Number.parseInt(seed, 10),
    rivals: rivals === null ? ["aggressor", "builder"] : rivals.split(","),
  };
}

let game: Game | null = null;
let globe: Globe | null = null;
let tuning: Tuning | null = null;
let selected: number | null = null;
let notice = "";

const stage = required<HTMLElement>("#stage");

const refresh = () => {
  if (game === null) {
    return;
  }
  globe?.draw({
    view: game.view,
    constants: game.constants,
    seat: game.seat,
    running: !game.time.paused,
    speed: game.time.speed,
    selected,
  });
  panel.show(game, selected);
  topbar.show(game, notice);
};

const select = (node: number | null) => {
  selected = node;
  refresh();
};

const focus = (node: number) => {
  globe?.face(node);
  select(node);
};

const topbar = createTopbar(required<HTMLElement>("#topbar"), {
  time: (paused, speed) => link.send({ type: "time", paused, speed }),
  triggers: (triggers) => {
    if (game !== null) {
      game.triggers = triggers;
    }
    link.send({ type: "triggers", triggers });
  },
  restart: () => {
    const fresh = new URLSearchParams(window.location.search);
    fresh.set("room", `game-${Date.now().toString(36)}`);
    fresh.delete("seed");
    window.location.search = fresh.toString();
  },
});

const panel = createPanel(required<HTMLElement>("#panel"), {
  order: (order) => link.send({ type: "orders", orders: [order] }),
  select: focus,
});

const journal = createJournal(required<HTMLElement>("#journal"), focus);

const link = connect({
  url,
  room,
  setup: setupFrom(parameters),
  onMessage: (message) => receive(message),
  onStatus: (_status, detail) => topbar.status(detail),
});

function attention(current: Game, events: GameEvent[]): GameEvent | undefined {
  const me = current.seat;
  return events.find(
    (event) =>
      (event.kind === "announced" && event.target === me) ||
      (event.kind === "captured" && (event.to === me || event.from === me)),
  );
}

function receive(message: ServerMessage): void {
  if (message.type === "welcome") {
    game = {
      room: message.room,
      seat: message.seat,
      tuning: message.tuning,
      tickRate: message.tickRate,
      outline: message.outline,
      constants: message.constants,
      time: message.time,
      seats: message.seats,
      triggers: message.triggers,
      view: message.view,
    };
    if (globe === null) {
      globe = createGlobe(stage, message.outline, select);
    }
    if (message.tuning && tuning === null) {
      tuning = createTuning(required<HTMLElement>("#tuning"), message.constants, (constants) =>
        link.send({ type: "tune", constants }),
      );
    }
    document.title = `Barycenter · ${message.room}`;
    refresh();
    return;
  }
  if (message.type === "error") {
    topbar.status(`Server: ${message.reason}`);
    return;
  }
  if (game === null) {
    return;
  }
  if (message.type === "view") {
    game.view = message.view;
    const current = game;
    journal.add(
      message.events
        .filter((event) => event.kind !== "discovered")
        .map((event) => report(current, event)),
    );
    const urgent = attention(game, message.events);
    if (urgent !== undefined) {
      notice = report(game, urgent).text;
      if (urgent.kind === "captured" && urgent.to === game.seat) {
        selected = urgent.node;
      }
    }
  } else if (message.type === "room") {
    game.time = message.time;
    game.seats = message.seats;
    if (!message.time.paused) {
      notice = "";
    }
  } else if (message.type === "constants") {
    game.constants = message.constants;
    tuning?.show(message.constants);
  } else if (message.type === "rejected") {
    notice = `Order refused: ${message.rejections.map((item) => item.reason).join(", ")}`;
  }
  refresh();
}

window.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement || game === null) {
    return;
  }
  if (event.code === "Space") {
    event.preventDefault();
    link.send({ type: "time", paused: !game.time.paused, speed: null });
    return;
  }
  const speed = SPEEDS[Number(event.key) - 1];
  if (speed !== undefined) {
    link.send({ type: "time", paused: null, speed });
  }
});
