import { BRANCHES, type Branch, type Constants } from "@barycenter/sim";
import {
  type ClientMessage,
  MAX_ORDERS,
  MAX_RIVALS,
  type Order,
  ROOM_NAME,
  type Setup,
  type Triggers,
  type Watch,
} from "./messages.ts";

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isIndex(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

function isBranch(value: unknown): value is Branch {
  return BRANCHES.some((branch) => branch === value);
}

function parseOrder(value: unknown): Order | null {
  if (!isFields(value)) {
    return null;
  }
  const { kind, region, edge, target, active, branch, cell } = value;
  const amount = value.value;
  if (kind === "dial" && isNumber(region) && isNumber(amount)) {
    return { kind, region, value: amount };
  }
  if (kind === "garrison" && isNumber(region) && (amount === null || isNumber(amount))) {
    return { kind, region, value: amount };
  }
  if (kind === "reinforce" && isNumber(region) && isNumber(amount)) {
    return { kind, region, value: amount };
  }
  if ((kind === "army" || kind === "forward") && isNumber(amount)) {
    return { kind, value: amount };
  }
  if (kind === "lean" && isBranch(branch) && isNumber(amount)) {
    return { kind, branch, value: amount };
  }
  if (kind === "road" && isNumber(edge) && isBoolean(active)) {
    return { kind, edge, active };
  }
  const targeted = target === null || isNumber(target);
  if (kind === "pressure" && isNumber(region) && targeted && isBoolean(active)) {
    return { kind, region, target, active };
  }
  if (kind === "aim" && isNumber(region) && targeted && (cell === null || isNumber(cell))) {
    return { kind, region, target, cell };
  }
  return null;
}

function parseOrders(value: unknown): Order[] | null {
  if (!Array.isArray(value) || value.length > MAX_ORDERS) {
    return null;
  }
  const orders: Order[] = [];
  for (const item of value) {
    const order = parseOrder(item);
    if (order === null) {
      return null;
    }
    orders.push(order);
  }
  return orders;
}

function parseSetup(value: unknown): Setup | null {
  if (!isFields(value)) {
    return null;
  }
  const { seed, rivals } = value;
  const seedValid = seed === null || (isNumber(seed) && Number.isInteger(seed));
  if (!seedValid || !Array.isArray(rivals) || rivals.length < 1 || rivals.length > MAX_RIVALS) {
    return null;
  }
  const names: string[] = [];
  for (const rival of rivals) {
    if (typeof rival !== "string") {
      return null;
    }
    names.push(rival);
  }
  return { seed: seed ?? null, rivals: names };
}

function parseTriggers(value: unknown): Triggers | null {
  if (!isFields(value)) {
    return null;
  }
  const { announced, territory, discovered } = value;
  if (!isBoolean(announced) || !isBoolean(territory) || !isBoolean(discovered)) {
    return null;
  }
  return { announced, territory, discovered };
}

function parseWatch(value: unknown): Watch | null {
  if (!isFields(value)) {
    return null;
  }
  if (value.subject === "force") {
    return { subject: "force" };
  }
  const region = value.region ?? null;
  const placed = region === null || isIndex(region);
  return value.subject === "economy" && placed ? { subject: "economy", region } : null;
}

function parseConstants(value: unknown): Partial<Constants> | null {
  if (!isFields(value)) {
    return null;
  }
  const constants: Record<string, number> = {};
  for (const [name, amount] of Object.entries(value)) {
    if (!isNumber(amount)) {
      return null;
    }
    constants[name] = amount;
  }
  return constants;
}

function parseJoin(value: Fields): ClientMessage | null {
  const { protocol, room, seat, token, setup } = value;
  if (!isNumber(protocol) || typeof room !== "string" || !ROOM_NAME.test(room)) {
    return null;
  }
  const seatValid = seat === null || (isNumber(seat) && Number.isInteger(seat) && seat >= 0);
  const tokenValid = token === null || (typeof token === "string" && token.length <= 64);
  if (!seatValid || !tokenValid) {
    return null;
  }
  const parsedSetup = setup === null || setup === undefined ? null : parseSetup(setup);
  if (setup !== null && setup !== undefined && parsedSetup === null) {
    return null;
  }
  return { type: "join", protocol, room, seat, token, setup: parsedSetup };
}

export function parseClientMessage(text: string): ClientMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isFields(value)) {
    return null;
  }
  if (value.type === "join") {
    return parseJoin(value);
  }
  if (value.type === "orders") {
    const orders = parseOrders(value.orders);
    return orders === null ? null : { type: "orders", orders };
  }
  if (value.type === "time") {
    const paused = value.paused ?? null;
    const speed = value.speed ?? null;
    const valid = (paused === null || isBoolean(paused)) && (speed === null || isNumber(speed));
    return valid ? { type: "time", paused, speed } : null;
  }
  if (value.type === "triggers") {
    const triggers = parseTriggers(value.triggers);
    return triggers === null ? null : { type: "triggers", triggers };
  }
  if (value.type === "report") {
    if (value.watch === null) {
      return { type: "report", watch: null };
    }
    const watch = parseWatch(value.watch);
    return watch === null ? null : { type: "report", watch };
  }
  if (value.type === "snapshot") {
    const selected = value.selected ?? null;
    return selected === null || isIndex(selected) ? { type: "snapshot", selected } : null;
  }
  if (value.type === "tune") {
    const constants = parseConstants(value.constants);
    return constants === null ? null : { type: "tune", constants };
  }
  return null;
}
