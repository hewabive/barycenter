import type { Lane } from "./front.ts";
import {
  bestLink,
  capacityOf,
  defenseOf,
  EPSILON,
  FULL_SIEGE,
  passOf,
  signedFlow,
  spread,
} from "./rules.ts";
import type { State } from "./types.ts";

export interface ForceField {
  need: number[];
  rest: number[];
  held: number[];
  toFront: number[];
  toHome: number[];
}

export function widthOf(state: State, lane: Lane): number {
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

export function forceCapsOf(state: State): number[] {
  const caps = state.powers.map(() => 0);
  for (const cell of state.cells) {
    if (cell.owner !== null) {
      caps[cell.owner] += cell.quarters;
    }
  }
  return caps;
}

export function forceTotalsOf(state: State): number[] {
  const totals = state.powers.map(() => 0);
  for (const cell of state.cells) {
    if (cell.owner !== null) {
      totals[cell.owner] += cell.force;
    }
  }
  return totals;
}

export function forceRoomOf(state: State): number[] {
  const caps = forceCapsOf(state);
  return forceTotalsOf(state).map((total, power) => Math.max(0, caps[power] - total));
}

export function armingOf(state: State): boolean[] {
  return forceRoomOf(state).map((room) => room > EPSILON);
}

export function forceFieldOf(state: State, lanes: Lane[]): ForceField {
  const { cells } = state;
  const need = new Array<number>(cells.length).fill(0);
  for (const lane of lanes) {
    need[lane.from] += attackNeedOf(state, lane);
    if (cells[lane.to].owner !== null) {
      need[lane.to] += defenseNeedOf(state, lane);
    }
  }

  const short = cells.map((cell, id) => (cell.owner === null ? 0 : need[id] - cell.force));
  const toFront = spread(
    state,
    short.map((missing) => (missing > EPSILON ? 1 : 0)),
  );

  const rest = new Array<number>(cells.length).fill(0);
  const call = state.powers.map(() => 0);
  const bases: number[] = [];
  cells.forEach((cell, id) => {
    if (cell.owner === null) {
      return;
    }
    const spare = Math.max(0, cell.force - need[id]);
    rest[id] = Math.min(spare, cell.quarters);
    call[cell.owner] += Math.max(0, short[id]);
    if (toFront[id] > EPSILON) {
      call[cell.owner] -= spare - rest[id];
      if (rest[id] > EPSILON) {
        bases.push(id);
      }
    }
  });
  bases.sort((left, right) => toFront[right] - toFront[left] || left - right);
  for (const base of bases) {
    const owner = cells[base].owner;
    if (owner === null || call[owner] <= EPSILON) {
      continue;
    }
    const released = Math.min(rest[base], call[owner]);
    rest[base] -= released;
    call[owner] -= released;
  }

  const toHome = spread(
    state,
    cells.map((cell, id) => {
      const room = cell.quarters - Math.max(0, cell.force - need[id]);
      return cell.owner !== null && room > EPSILON ? 1 : 0;
    }),
  );
  return { need, rest, held: need.map((wanted, id) => wanted + rest[id]), toFront, toHome };
}

export function headingOf(field: ForceField, cell: number): number[] | null {
  if (field.toFront[cell] > EPSILON) {
    return field.toFront;
  }
  return field.need[cell] > EPSILON ? null : field.toHome;
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
    const heading = headingOf(field, cell);
    const link = heading === null ? null : bestLink(state, cell, heading);
    if (link === null) {
      continue;
    }
    const amount = Math.min(free, capacityOf(state, link.joint) * constants.forcePerCapacity);
    current.force -= amount;
    arrivals[link.cell] += amount * passOf(state, link.joint);
    state.joints[link.joint].forceFlow += signedFlow(state, link.joint, cell, amount);
  }
  for (let cell = 0; cell < cells.length; cell++) {
    cells[cell].force += arrivals[cell];
  }
}

export function linkedOf(state: State): boolean[] {
  const { cells, map } = state;
  const linked = new Array<boolean>(cells.length).fill(false);
  state.powers.forEach((power, id) => {
    if (!power.alive || cells[power.capital].owner !== id) {
      return;
    }
    linked[power.capital] = true;
    const queue = [power.capital];
    for (let head = 0; head < queue.length; head++) {
      for (const link of map.links[queue[head]]) {
        if (!linked[link.cell] && cells[link.cell].owner === id) {
          linked[link.cell] = true;
          queue.push(link.cell);
        }
      }
    }
  });
  return linked;
}

export function decayForce(state: State): void {
  const { constants, cells } = state;
  const linked = linkedOf(state);
  const caps = forceCapsOf(state);
  const totals = forceTotalsOf(state);
  cells.forEach((cell, id) => {
    if (cell.owner === null || cell.force <= 0) {
      return;
    }
    const starved = linked[id] ? constants.forceDecay * (1 - cell.supply) : constants.strandedDecay;
    const excess = Math.max(0, totals[cell.owner] - caps[cell.owner]) / totals[cell.owner];
    const lost = starved + constants.excessDecay * excess;
    cell.force -= cell.force * Math.min(1, lost);
  });
}
