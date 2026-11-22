import { randomUUID } from "node:crypto";
import { type Doctrine, decide, doctrines } from "@barycenter/bots";
import {
  type ClientMessage,
  commandOf,
  type Order,
  orderOf,
  PROTOCOL,
  type SeatInfo,
  type ServerMessage,
  SPEEDS,
  type TimeState,
  type Triggers,
  type Watch,
} from "@barycenter/protocol";
import {
  type Command,
  type Constants,
  createWorld,
  economyReportFor,
  eventsFor,
  forceReportFor,
  type GameEvent,
  issue,
  type Outline,
  outlineOf,
  retune,
  type State,
  step,
  viewFor,
} from "@barycenter/sim";

export interface RoomOptions {
  id: string;
  seed: number;
  humans: number;
  rivals: string[];
  tuning: boolean;
  tickRate: number;
}

export interface SavedRoom {
  version: number;
  options: RoomOptions;
  state: State;
  tokens: (string | null)[];
  speed: number;
}

export interface Snapshot extends SavedRoom {
  seat: number;
  selected: number | null;
  time: TimeState;
}

export type RoomMessage = Exclude<ClientMessage, { type: "snapshot" }>;
export type Sink = (seat: number, message: ServerMessage) => void;
export type JoinResult = { seat: number; token: string } | { error: string };

interface Seat {
  doctrine: Doctrine | null;
  label: string;
  token: string | null;
  connected: boolean;
  watch: Watch | null;
  triggers: Triggers;
}

const SAVE_VERSION = 20;
const THINK_EVERY = 5;
const MAX_BURST = 32;

export function unknownRival(rivals: string[]): string | null {
  return rivals.find((name) => doctrines[name] === undefined) ?? null;
}

function fires(triggers: Triggers, event: GameEvent, power: number): boolean {
  if (event.kind === "announced") {
    return triggers.announced && event.target === power;
  }
  if (event.kind === "entered" || event.kind === "expelled") {
    return triggers.territory && event.power === power;
  }
  if (event.kind === "lapsed") {
    return triggers.territory && event.power === power && event.left;
  }
  if (event.kind === "discovered") {
    return triggers.discovered && event.power === power;
  }
  return false;
}

export class Room {
  readonly options: RoomOptions;
  private readonly sink: Sink;
  private readonly outline: Outline;
  private readonly seats: Seat[];
  private state: State;
  private paused = true;
  private speed = 1;
  private pausedFor: number | null = null;
  private debt = 0;

  constructor(options: RoomOptions, sink: Sink, saved: SavedRoom | null = null) {
    const unknown = unknownRival(options.rivals);
    if (unknown !== null) {
      throw new Error(`Unknown doctrine "${unknown}"`);
    }
    this.options = options;
    this.sink = sink;
    const powers = options.humans + options.rivals.length;
    this.state = saved?.state ?? createWorld({ seed: options.seed, powers });
    this.outline = outlineOf(this.state.map);
    this.speed = saved?.speed ?? 1;
    this.seats = Array.from({ length: powers }, (_, index) => {
      const rival = options.rivals[index - options.humans];
      return {
        doctrine: rival === undefined ? null : doctrines[rival],
        label: rival ?? "human",
        token: saved?.tokens[index] ?? null,
        connected: false,
        watch: null,
        triggers: { announced: true, territory: true, discovered: true },
      };
    });
  }

  static restore(saved: SavedRoom, tuning: boolean, sink: Sink): Room | null {
    if (saved.version !== SAVE_VERSION) {
      return null;
    }
    const powers = saved.options.humans + saved.options.rivals.length;
    const consistent =
      saved.state.powers.length === powers && unknownRival(saved.options.rivals) === null;
    return consistent ? new Room({ ...saved.options, tuning }, sink, saved) : null;
  }

  get tick(): number {
    return this.state.tick;
  }

  get occupied(): boolean {
    return this.seats.some((seat) => seat.connected);
  }

  get running(): boolean {
    return !this.paused && this.occupied;
  }

  save(): SavedRoom {
    return {
      version: SAVE_VERSION,
      options: this.options,
      state: this.state,
      tokens: this.seats.map((seat) => seat.token),
      speed: this.speed,
    };
  }

  snapshot(seat: number, selected: number | null): Snapshot {
    return {
      ...this.save(),
      options: { ...this.options, id: `${this.options.id}-${this.state.tick}` },
      tokens: this.seats.map(() => null),
      seat,
      selected,
      time: this.time(),
    };
  }

  join(wanted: number | null, token: string | null): JoinResult {
    const index =
      wanted ?? this.seats.findIndex((seat) => seat.doctrine === null && seat.token === null);
    const seat = this.seats[index];
    if (seat === undefined || seat.doctrine !== null) {
      return { error: "no open seat" };
    }
    if (seat.token !== null && seat.token !== token) {
      return { error: "seat is taken" };
    }
    seat.token ??= randomUUID();
    seat.connected = true;
    seat.watch = null;
    this.announce();
    return { seat: index, token: seat.token };
  }

  leave(index: number): void {
    const seat = this.seats[index];
    if (seat === undefined) {
      return;
    }
    seat.connected = false;
    seat.watch = null;
    if (!this.occupied) {
      this.paused = true;
      this.pausedFor = null;
    }
    this.announce();
  }

  welcome(index: number): ServerMessage {
    const seat = this.seats[index];
    return {
      type: "welcome",
      protocol: PROTOCOL,
      room: this.options.id,
      seat: index,
      token: seat.token ?? "",
      tuning: this.options.tuning,
      tickRate: this.options.tickRate,
      outline: this.outline,
      constants: this.state.constants,
      time: this.time(),
      seats: this.seatInfo(),
      triggers: seat.triggers,
      view: viewFor(this.state, index),
    };
  }

  handle(index: number, message: RoomMessage): void {
    switch (message.type) {
      case "join":
        this.sink(index, { type: "error", reason: "already joined" });
        return;
      case "orders":
        this.order(index, message.orders);
        return;
      case "time":
        this.setTime(index, message.paused, message.speed);
        return;
      case "triggers":
        this.seats[index].triggers = message.triggers;
        return;
      case "report":
        this.seats[index].watch = message.watch;
        if (message.watch !== null) {
          this.sink(index, this.viewMessage(index, []));
        }
        return;
      case "tune":
        this.tune(index, message.constants);
        return;
    }
  }

  pump(elapsed: number): number {
    if (!this.running) {
      this.debt = 0;
      return 0;
    }
    const due = (elapsed * this.options.tickRate * this.speed) / 1000;
    this.debt = Math.min(this.debt + due, MAX_BURST);
    let ticks = 0;
    while (this.debt >= 1 && this.running) {
      this.advance();
      this.debt -= 1;
      ticks += 1;
    }
    return ticks;
  }

  advance(): void {
    const commands: Command[] = [];
    this.seats.forEach((seat, power) => {
      const due = (this.state.tick + power) % THINK_EVERY === 0;
      if (seat.doctrine !== null && due && this.state.powers[power].alive) {
        const view = viewFor(this.state, power);
        commands.push(...decide(this.outline, this.state.constants, view, seat.doctrine));
      }
    });
    const result = step(this.state, commands);
    this.state = result.state;
    this.publish(result.events);
  }

  private order(index: number, orders: Order[]): void {
    const result = issue(
      this.state,
      orders.map((order) => commandOf(order, index)),
    );
    this.state = result.state;
    if (result.rejections.length > 0) {
      this.sink(index, {
        type: "rejected",
        rejections: result.rejections.map((rejection) => ({
          order: orderOf(rejection.command),
          reason: rejection.reason,
        })),
      });
    }
    this.publish(result.events);
  }

  private setTime(index: number, paused: boolean | null, speed: number | null): void {
    if (speed !== null) {
      if (!SPEEDS.includes(speed)) {
        this.sink(index, { type: "error", reason: "unsupported speed" });
        return;
      }
      this.speed = speed;
    }
    if (paused !== null) {
      this.paused = paused;
      this.pausedFor = null;
    }
    this.announce();
  }

  private tune(index: number, constants: Partial<Constants>): void {
    if (!this.options.tuning) {
      this.sink(index, { type: "error", reason: "tuning is disabled" });
      return;
    }
    const tuned = retune(this.state, constants);
    if (tuned === null) {
      this.sink(index, { type: "error", reason: "constants are out of range" });
      return;
    }
    this.state = tuned;
    this.seats.forEach((seat, power) => {
      if (seat.connected) {
        this.sink(power, { type: "constants", constants: tuned.constants });
      }
    });
    this.publish([]);
  }

  private publish(events: GameEvent[]): void {
    let stopper: number | null = null;
    for (let power = 0; power < this.seats.length; power++) {
      const seat = this.seats[power];
      if (!seat.connected) {
        continue;
      }
      const seen = eventsFor(this.state, power, events);
      this.sink(power, this.viewMessage(power, seen));
      if (stopper === null && seen.some((event) => fires(seat.triggers, event, power))) {
        stopper = power;
      }
    }
    if (stopper !== null && !this.paused) {
      this.paused = true;
      this.pausedFor = stopper;
      this.announce();
    }
  }

  private viewMessage(power: number, events: GameEvent[]): ServerMessage {
    const watch = this.seats[power].watch;
    return {
      type: "view",
      view: viewFor(this.state, power),
      events,
      force: watch?.subject === "force" ? forceReportFor(this.state, power) : null,
      economy:
        watch?.subject === "economy" ? economyReportFor(this.state, power, watch.region) : null,
    };
  }

  private announce(): void {
    const message: ServerMessage = { type: "room", time: this.time(), seats: this.seatInfo() };
    this.seats.forEach((seat, power) => {
      if (seat.connected) {
        this.sink(power, message);
      }
    });
  }

  private time(): TimeState {
    return { paused: this.paused, speed: this.speed, pausedFor: this.pausedFor };
  }

  private seatInfo(): SeatInfo[] {
    return this.seats.map((seat) => ({
      kind: seat.doctrine === null ? "human" : "bot",
      label: seat.label,
      connected: seat.doctrine !== null || seat.connected,
    }));
  }
}
