import type { Command, GameEvent, Rejection, Role, State } from "./types.ts";

export const ROLES: Role[] = ["extraction", "power", "shipyard"];
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
      return setDial(state, command.power, command.node, command.value);
    case "role":
      return setRole(state, command.power, command.node, command.role);
    case "garrison":
      return setGarrison(state, command.power, command.node, command.value);
    case "expand":
      return setExpand(state, command.power, command.edge, command.active);
    case "pressure":
      return setPressure(state, command.power, command.from, command.to, command.active, events);
    default:
      return "unknown command";
  }
}

function owns(state: State, power: number, node: number): boolean {
  return Number.isInteger(node) && state.nodes[node]?.owner === power;
}

function setDial(state: State, power: number, node: number, value: number): string | null {
  if (!owns(state, power, node)) {
    return "node is not owned";
  }
  if (!(value >= 0 && value <= 1)) {
    return "dial is out of range";
  }
  state.nodes[node].dial = value;
  return null;
}

function setRole(state: State, power: number, node: number, role: Role): string | null {
  if (!owns(state, power, node)) {
    return "node is not owned";
  }
  if (!ROLES.includes(role)) {
    return "unknown role";
  }
  const target = state.nodes[node];
  if (target.role === role) {
    return null;
  }
  if (target.role !== null) {
    target.level = Math.round(target.level * (1 - state.constants.roleChangeLevelLoss));
    target.progress = 0;
  }
  target.role = role;
  return null;
}

function setGarrison(state: State, power: number, node: number, value: number): string | null {
  if (!owns(state, power, node)) {
    return "node is not owned";
  }
  if (!(value >= 0 && value <= GARRISON_LIMIT)) {
    return "garrison is out of range";
  }
  state.nodes[node].garrison = value;
  return null;
}

function setExpand(state: State, power: number, edge: number, active: boolean): string | null {
  const route = Number.isInteger(edge) ? state.map.edges[edge] : undefined;
  if (route === undefined) {
    return "unknown edge";
  }
  if (!owns(state, power, route.a) && !owns(state, power, route.b)) {
    return "edge does not touch owned territory";
  }
  const current = state.edges[edge];
  if (!active) {
    if (current.expanding === power) {
      current.expanding = null;
    }
    return null;
  }
  if (current.expansions >= state.constants.maxExpansions) {
    return "edge is fully expanded";
  }
  if (current.expanding !== null && current.expanding !== power) {
    return "edge is being expanded by another power";
  }
  current.expanding = power;
  return null;
}

function setPressure(
  state: State,
  power: number,
  from: number,
  to: number,
  active: boolean,
  events: GameEvent[],
): string | null {
  if (!owns(state, power, from)) {
    return "source node is not owned";
  }
  const link = state.map.links[from].find((candidate) => candidate.node === to);
  if (link === undefined) {
    return "target is not adjacent";
  }
  const existing = state.pressures.findIndex(
    (pressure) => pressure.from === from && pressure.to === to,
  );
  if (!active) {
    if (existing >= 0) {
      state.pressures.splice(existing, 1);
    }
    return null;
  }
  const target = state.nodes[to].owner;
  if (target === power) {
    return "target is already owned";
  }
  if (existing >= 0) {
    return null;
  }
  const activeAt = state.tick + (target === null ? 0 : state.constants.announceTicks);
  state.pressures.push({ power, from, to, edge: link.edge, activeAt, commit: 0 });
  if (target !== null) {
    events.push({ kind: "announced", power, from, to, target, activeAt });
  }
  return null;
}
