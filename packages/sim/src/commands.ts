import { touches } from "./front.ts";
import { holds } from "./rules.ts";
import {
  BRANCHES,
  type Branch,
  type Command,
  type GameEvent,
  type Rejection,
  type State,
} from "./types.ts";

const GARRISON_LIMIT = 1_000_000;

export function applyCommands(state: State, commands: Command[], events: GameEvent[]): Rejection[] {
  const rejections: Rejection[] = [];
  for (const command of commands) {
    const reason = applyCommand(state, command, events);
    if (reason !== null) {
      rejections.push({ command, reason });
    }
  }
  return rejections;
}

function applyCommand(state: State, command: Command, events: GameEvent[]): string | null {
  const power = state.powers[command.power];
  if (power === undefined || !power.alive) {
    return "power is not in play";
  }
  switch (command.kind) {
    case "dial":
      return setDial(state, command.power, command.region, command.value);
    case "garrison":
      return setGarrison(state, command.power, command.region, command.value);
    case "lean":
      return setLean(state, command.power, command.branch, command.value);
    case "road":
      return setRoad(state, command.power, command.edge, command.active);
    case "pressure":
      return setPressure(
        state,
        command.power,
        command.region,
        command.target,
        command.active,
        events,
      );
    case "aim":
      return setAim(state, command.power, command.region, command.target, command.cell);
    default:
      return "unknown command";
  }
}

function isRegion(state: State, region: number): boolean {
  return Number.isInteger(region) && state.map.regions[region] !== undefined;
}

function setDial(state: State, power: number, region: number, value: number): string | null {
  if (!isRegion(state, region) || !holds(state, power, region)) {
    return "region is not held";
  }
  if (!(value >= 0 && value <= 1)) {
    return "dial is out of range";
  }
  state.powers[power].holdings[region].dial = value;
  return null;
}

function setGarrison(state: State, power: number, region: number, value: number): string | null {
  if (!isRegion(state, region) || !holds(state, power, region)) {
    return "region is not held";
  }
  if (!(value >= 0 && value <= GARRISON_LIMIT)) {
    return "garrison is out of range";
  }
  state.powers[power].holdings[region].garrison = value;
  return null;
}

function setLean(state: State, power: number, branch: Branch, value: number): string | null {
  const index = BRANCHES.indexOf(branch);
  if (index < 0) {
    return "unknown branch";
  }
  if (!(value >= 0 && value <= 1)) {
    return "leaning is out of range";
  }
  state.powers[power].lean[index] = value;
  return null;
}

function setRoad(state: State, power: number, edge: number, active: boolean): string | null {
  const route = Number.isInteger(edge) ? state.map.edges[edge] : undefined;
  if (route === undefined) {
    return "unknown edge";
  }
  if (active && !(holds(state, power, route.a) && holds(state, power, route.b))) {
    return "a road needs land on both sides of the edge";
  }
  state.powers[power].roads[edge] = active;
  return null;
}

function setPressure(
  state: State,
  power: number,
  region: number,
  target: number | null,
  active: boolean,
  events: GameEvent[],
): string | null {
  if (!isRegion(state, region)) {
    return "unknown region";
  }
  if (target !== null && (!Number.isInteger(target) || state.powers[target] === undefined)) {
    return "unknown target";
  }
  if (target === power) {
    return "target is the power itself";
  }
  const existing = state.pressures.findIndex(
    (pressure) =>
      pressure.power === power && pressure.region === region && pressure.target === target,
  );
  if (!active) {
    if (existing >= 0) {
      state.pressures.splice(existing, 1);
    }
    return null;
  }
  if (existing >= 0) {
    return null;
  }
  if (!touches(state, power, region, target)) {
    return "target is out of reach";
  }
  const activeAt = state.tick + (target === null ? 0 : state.constants.announceTicks);
  state.pressures.push({ power, region, target, activeAt, aim: null });
  if (target !== null) {
    events.push({ kind: "announced", power, region, target, activeAt });
  }
  return null;
}

function setAim(
  state: State,
  power: number,
  region: number,
  target: number | null,
  cell: number | null,
): string | null {
  const pressure = state.pressures.find(
    (known) => known.power === power && known.region === region && known.target === target,
  );
  if (pressure === undefined) {
    return "there is no such pressure to aim";
  }
  if (cell === null) {
    pressure.aim = null;
    return null;
  }
  const place = Number.isInteger(cell) ? state.map.cells[cell] : undefined;
  if (place === undefined || place.region !== region || state.cells[cell].owner !== target) {
    return "the aim is not a cell of the pressed holder in the region";
  }
  pressure.aim = cell;
  return null;
}
