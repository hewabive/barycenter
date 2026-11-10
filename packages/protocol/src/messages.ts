import type { Command, Constants, GameEvent, Outline, View } from "@barycenter/sim";

export const PROTOCOL = 1;
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
  captured: boolean;
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
  | { type: "view"; view: View; events: GameEvent[] }
  | { type: "room"; time: TimeState; seats: SeatInfo[] }
  | { type: "constants"; constants: Constants }
  | { type: "rejected"; rejections: RejectedOrder[] }
  | { type: "error"; reason: string };

export function commandOf(order: Order, power: number): Command {
  switch (order.kind) {
    case "dial":
      return { kind: "dial", power, node: order.node, value: order.value };
    case "role":
      return { kind: "role", power, node: order.node, role: order.role };
    case "garrison":
      return { kind: "garrison", power, node: order.node, value: order.value };
    case "expand":
      return { kind: "expand", power, edge: order.edge, active: order.active };
    case "pressure":
      return { kind: "pressure", power, from: order.from, to: order.to, active: order.active };
  }
}

export function orderOf(command: Command): Order {
  switch (command.kind) {
    case "dial":
      return { kind: "dial", node: command.node, value: command.value };
    case "role":
      return { kind: "role", node: command.node, role: command.role };
    case "garrison":
      return { kind: "garrison", node: command.node, value: command.value };
    case "expand":
      return { kind: "expand", edge: command.edge, active: command.active };
    case "pressure":
      return { kind: "pressure", from: command.from, to: command.to, active: command.active };
  }
}
