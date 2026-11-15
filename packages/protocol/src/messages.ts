import type {
  Command,
  Constants,
  EconomyReport,
  ForceReport,
  GameEvent,
  Outline,
  View,
} from "@barycenter/sim";

export const PROTOCOL = 20;
export const SPEEDS = [1, 2, 4, 8];
export const ROOM_NAME = /^[a-z0-9-]{1,32}$/;
export const MAX_ORDERS = 256;
export const MAX_RIVALS = 5;

type Without<Union, Key extends PropertyKey> = Union extends unknown ? Omit<Union, Key> : never;

export type Order = Without<Command, "power">;

export interface Setup {
  seed: number | null;
  rivals: string[];
}

export interface Triggers {
  announced: boolean;
  territory: boolean;
  discovered: boolean;
}

export interface TimeState {
  paused: boolean;
  speed: number;
  pausedFor: number | null;
}

export interface SeatInfo {
  kind: "human" | "bot";
  label: string;
  connected: boolean;
}

export type Watch = { subject: "force" } | { subject: "economy"; region: number | null };

export interface RejectedOrder {
  order: Order;
  reason: string;
}

export type ClientMessage =
  | {
      type: "join";
      protocol: number;
      room: string;
      seat: number | null;
      token: string | null;
      setup: Setup | null;
    }
  | { type: "orders"; orders: Order[] }
  | { type: "time"; paused: boolean | null; speed: number | null }
  | { type: "triggers"; triggers: Triggers }
  | { type: "report"; watch: Watch | null }
  | { type: "snapshot"; selected: number | null }
  | { type: "tune"; constants: Partial<Constants> };

export type ServerMessage =
  | {
      type: "welcome";
      protocol: number;
      room: string;
      seat: number;
      token: string;
      tuning: boolean;
      tickRate: number;
      outline: Outline;
      constants: Constants;
      time: TimeState;
      seats: SeatInfo[];
      triggers: Triggers;
      view: View;
    }
  | {
      type: "view";
      view: View;
      events: GameEvent[];
      force: ForceReport | null;
      economy: EconomyReport | null;
    }
  | { type: "room"; time: TimeState; seats: SeatInfo[] }
  | { type: "constants"; constants: Constants }
  | { type: "rejected"; rejections: RejectedOrder[] }
  | { type: "snapshot"; name: string }
  | { type: "error"; reason: string };

export function commandOf(order: Order, power: number): Command {
  switch (order.kind) {
    case "dial":
      return { kind: "dial", power, region: order.region, value: order.value };
    case "garrison":
      return { kind: "garrison", power, region: order.region, value: order.value };
    case "reinforce":
      return { kind: "reinforce", power, region: order.region, value: order.value };
    case "army":
      return { kind: "army", power, value: order.value };
    case "forward":
      return { kind: "forward", power, value: order.value };
    case "lean":
      return { kind: "lean", power, branch: order.branch, value: order.value };
    case "road":
      return { kind: "road", power, edge: order.edge, active: order.active };
    case "pressure":
      return {
        kind: "pressure",
        power,
        region: order.region,
        target: order.target,
        active: order.active,
      };
    case "aim":
      return {
        kind: "aim",
        power,
        region: order.region,
        target: order.target,
        cell: order.cell,
      };
  }
}

export function orderOf(command: Command): Order {
  switch (command.kind) {
    case "dial":
      return { kind: "dial", region: command.region, value: command.value };
    case "garrison":
      return { kind: "garrison", region: command.region, value: command.value };
    case "reinforce":
      return { kind: "reinforce", region: command.region, value: command.value };
    case "army":
      return { kind: "army", value: command.value };
    case "forward":
      return { kind: "forward", value: command.value };
    case "lean":
      return { kind: "lean", branch: command.branch, value: command.value };
    case "road":
      return { kind: "road", edge: command.edge, active: command.active };
    case "pressure":
      return {
        kind: "pressure",
        region: command.region,
        target: command.target,
        active: command.active,
      };
    case "aim":
      return {
        kind: "aim",
        region: command.region,
        target: command.target,
        cell: command.cell,
      };
  }
}
