import type { Lane } from "./front.ts";
import {
  bestLink,
  capacityOf,
  defenseOf,
  EPSILON,
  FULL_SIEGE,
  signedFlow,
  spread,
} from "./rules.ts";
import type { State } from "./types.ts";

export interface ForceField {
  held: number[];
  potential: number[];
}

export function forceWantedBy(state: State, field: ForceField): boolean[] {
  const wanted = state.powers.map(() => false);
  for (const pressure of state.pressures) {
    wanted[pressure.power] = true;
  }
  state.cells.forEach((cell, id) => {
    if (cell.owner !== null && cell.force < field.held[id] - EPSILON) {
      wanted[cell.owner] = true;
    }
  });
  return wanted;
}

function widthOf(state: State, lane: Lane): number {
  return capacityOf(state, lane.joint) * state.constants.pressurePerCapacity;
}

export function attackNeedOf(state: State, lane: Lane): number {
  return Math.min(widthOf(state, lane), FULL_SIEGE * defenseOf(state, lane.to));
}

export function defenseNeedOf(state: State, lane: Lane): number {
  if (state.cells[lane.to].owner === null) {
    return 0;
  }
  const faced = Math.min(widthOf(state, lane), state.cells[lane.from].force);
  return faced / state.constants.defensePerForce;
}

export function forceFieldOf(state: State, lanes: Lane[], posts: number[]): ForceField {
  const { constants, cells } = state;
  const held = posts.slice();
  const fighting = new Array<boolean>(cells.length).fill(false);
  for (const lane of lanes) {
    fighting[lane.from] = true;
    held[lane.from] += attackNeedOf(state, lane);
    if (cells[lane.to].owner !== null) {
      fighting[lane.to] = true;
      held[lane.to] += defenseNeedOf(state, lane);
    }
  }
  const demand = cells.map((cell, id) => {
    if (cell.owner === null || cell.force >= held[id] - EPSILON) {
      return 0;
    }
    return fighting[id] ? 1 : constants.garrisonPull;
  });
  return { held, potential: spread(state, demand, constants.forceReach) };
}

export function routeForce(state: State, field: ForceField): void {
  const { constants, cells } = state;
  for (const joint of state.joints) {
    joint.forceFlow = 0;
  }
  const arrivals = new Array<number>(cells.length).fill(0);
  for (let cell = 0; cell < cells.length; cell++) {
    const current = cells[cell];
    const free = current.force - field.held[cell];
    if (current.owner === null || free <= EPSILON) {
      continue;
    }
    const link = bestLink(state, cell, field.potential);
    if (link === null) {
      continue;
    }
    const amount = Math.min(free, capacityOf(state, link.joint) * constants.forcePerCapacity);
    current.force -= amount;
    arrivals[link.cell] += amount;
    state.joints[link.joint].forceFlow += signedFlow(state, link.joint, cell, amount);
  }
  for (let cell = 0; cell < cells.length; cell++) {
    cells[cell].force += arrivals[cell];
  }
}

export function decayForce(state: State): void {
  for (const cell of state.cells) {
    if (cell.owner !== null && cell.supply < 1) {
      cell.force -= cell.force * state.constants.forceDecay * (1 - cell.supply);
    }
  }
}
